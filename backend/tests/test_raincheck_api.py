# RainCheck backend regression tests: markets, auth, businesses (scoping), advisor AI, positions, dashboard, kalshi creds
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"
T1 = "test_session_raincheck"
T2 = "test_session_raincheck_2"  # seeded second user (test-user-2)
BIZ = "6b8b4a0f56dd"


def h(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def market():
    r = requests.get(f"{API}/markets", params={"city": "Chicago"}, timeout=60)
    assert r.status_code == 200
    ms = [m for m in r.json() if m["yes_ask"] and 0 < m["yes_ask"] < 1 and m["no_ask"] and m["no_ask"] < 1]
    assert ms, "no tradeable Chicago market"
    return ms[0]


# --- Public markets ---
class TestMarkets:
    def test_cities(self):
        r = requests.get(f"{API}/cities", timeout=30)
        assert r.status_code == 200
        names = [c["city"] for c in r.json()]
        assert "Chicago" in names and len(names) == 16

    def test_featured(self):
        r = requests.get(f"{API}/markets/featured", timeout=60)
        assert r.status_code == 200
        d = r.json()
        assert isinstance(d, list) and 0 < len(d) <= 8
        for m in d:
            assert m["kind"] == "rain" and 0.08 <= m["yes_ask"] <= 0.85
        assert len({m["city"] for m in d}) == len(d)

    def test_markets_filter(self):
        r = requests.get(f"{API}/markets", params={"city": "Chicago", "kind": "rain"}, timeout=60)
        assert r.status_code == 200
        assert all(m["city"] == "Chicago" and m["kind"] == "rain" for m in r.json())

    def test_market_detail(self, market):
        r = requests.get(f"{API}/markets/{market['ticker']}", timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert d["ticker"] == market["ticker"] and "rules_primary" in d and "settlement_sources" in d

    def test_market_404(self):
        r = requests.get(f"{API}/markets/NOPE-XYZ-123", timeout=30)
        assert r.status_code == 404


# --- Auth ---
class TestAuth:
    def test_me_bearer(self):
        r = requests.get(f"{API}/auth/me", headers=h(T1), timeout=30)
        assert r.status_code == 200 and r.json()["user_id"] == "test-user-1"

    def test_me_cookie(self):
        r = requests.get(f"{API}/auth/me", cookies={"session_token": T1}, timeout=30)
        assert r.status_code == 200 and r.json()["email"] == "test.user@example.com"

    def test_me_unauth(self):
        assert requests.get(f"{API}/auth/me", timeout=30).status_code == 401
        assert requests.get(f"{API}/auth/me", headers=h("bogus"), timeout=30).status_code == 401


# --- Businesses ---
class TestBusinesses:
    def test_seeded_business(self):
        r = requests.get(f"{API}/businesses/{BIZ}", headers=h(T1), timeout=30)
        assert r.status_code == 200
        assert r.json()["report"]["hedges"]

    def test_scoped_other_user(self):
        r = requests.get(f"{API}/businesses/{BIZ}", headers=h(T2), timeout=30)
        assert r.status_code == 404
        r = requests.get(f"{API}/businesses", headers=h(T2), timeout=30)
        assert all(b["id"] != BIZ for b in r.json())
        assert requests.delete(f"{API}/businesses/{BIZ}", headers=h(T2), timeout=30).status_code == 404

    def test_crud(self):
        payload = {"name": "TEST_Shop", "business_type": "Cafe", "city": "Chicago", "market_city": "Chicago",
                   "daily_revenue": 1000, "bad_day_loss": 400}
        r = requests.post(f"{API}/businesses", json=payload, headers=h(T1), timeout=30)
        assert r.status_code == 200
        bid = r.json()["id"]
        assert "_id" not in r.json()
        g = requests.get(f"{API}/businesses/{bid}", headers=h(T1), timeout=30).json()
        assert g["name"] == "TEST_Shop" and g["report"] is None
        payload["name"] = "TEST_Shop2"
        u = requests.put(f"{API}/businesses/{bid}", json=payload, headers=h(T1), timeout=30)
        assert u.status_code == 200 and u.json()["name"] == "TEST_Shop2"
        assert requests.put(f"{API}/businesses/{bid}", json=payload, headers=h(T2), timeout=30).status_code == 404
        assert requests.delete(f"{API}/businesses/{bid}", headers=h(T1), timeout=30).status_code == 200
        assert requests.get(f"{API}/businesses/{bid}", headers=h(T1), timeout=30).status_code == 404

    def test_bad_city(self):
        r = requests.post(f"{API}/businesses", json={"name": "TEST_x", "business_type": "x", "city": "Nowhere",
                          "market_city": "Nowhere", "daily_revenue": 1, "bad_day_loss": 1}, headers=h(T1), timeout=30)
        assert r.status_code == 400

    def test_negative_revenue(self):
        r = requests.post(f"{API}/businesses", json={"name": "TEST_x", "business_type": "x", "city": "Chicago",
                          "market_city": "Chicago", "daily_revenue": -1, "bad_day_loss": 1}, headers=h(T1), timeout=30)
        assert r.status_code == 422


# --- AI advisor ---
class TestAdvisor:
    def test_profile_draft(self):
        r = requests.post(f"{API}/advisor/profile", json={"description": "Ice cream shop in Chicago, rainy weekends kill our sales. About $2,500 on a good Saturday."},
                          headers=h(T1), timeout=120)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["market_city"] == "Chicago"
        for k in ("name", "business_type", "daily_revenue", "bad_day_loss"):
            assert k in d

    def test_profile_short(self):
        assert requests.post(f"{API}/advisor/profile", json={"description": "ab"}, headers=h(T1), timeout=30).status_code == 422

    def test_report_other_user(self):
        assert requests.post(f"{API}/businesses/{BIZ}/report", headers=h(T2), timeout=30).status_code == 404


# --- Positions + dashboard ---
class TestPositions:
    def test_paper_flow(self, market):
        d0 = requests.get(f"{API}/dashboard", headers=h(T1), timeout=60).json()
        r = requests.post(f"{API}/positions", json={"ticker": market["ticker"], "side": "yes", "contracts": 10,
                          "mode": "paper", "business_id": BIZ, "headline": "TEST_hedge"}, headers=h(T1), timeout=60)
        assert r.status_code == 200, r.text
        p = r.json()
        assert p["contracts"] == 10 and p["max_payout"] == 10.0
        assert abs(p["cost"] - round(10 * p["price"], 2)) < 1e-6
        lst = requests.get(f"{API}/positions", headers=h(T1), timeout=60).json()
        assert any(x["id"] == p["id"] for x in lst)
        d1 = requests.get(f"{API}/dashboard", headers=h(T1), timeout=60).json()
        assert round(d1["protected"] - d0["protected"], 2) == 10.0
        assert d1["active_count"] == d0["active_count"] + 1
        # other user cannot delete
        assert requests.delete(f"{API}/positions/{p['id']}", headers=h(T2), timeout=30).status_code == 404
        assert requests.delete(f"{API}/positions/{p['id']}", headers=h(T1), timeout=30).status_code == 200
        lst = requests.get(f"{API}/positions", headers=h(T1), timeout=60).json()
        assert not any(x["id"] == p["id"] for x in lst)

    def test_kalshi_mode_without_creds(self, market):
        requests.delete(f"{API}/kalshi/credentials", headers=h(T2), timeout=30)
        r = requests.post(f"{API}/positions", json={"ticker": market["ticker"], "side": "yes", "contracts": 1,
                          "mode": "kalshi"}, headers=h(T2), timeout=60)
        assert r.status_code == 400
        assert "Connect" in r.json()["detail"]

    def test_position_other_users_business(self, market):
        r = requests.post(f"{API}/positions", json={"ticker": market["ticker"], "side": "yes", "contracts": 1,
                          "mode": "paper", "business_id": BIZ}, headers=h(T2), timeout=60)
        assert r.status_code == 404

    def test_position_validation(self, market):
        r = requests.post(f"{API}/positions", json={"ticker": market["ticker"], "side": "maybe", "contracts": 0},
                          headers=h(T1), timeout=30)
        assert r.status_code == 422

    def test_position_bad_ticker(self):
        r = requests.post(f"{API}/positions", json={"ticker": "NOPE-XYZ-1", "side": "yes", "contracts": 1},
                          headers=h(T1), timeout=30)
        assert r.status_code in (400, 404), f"got {r.status_code}"


# --- Kalshi credentials ---
class TestKalshiCreds:
    def test_status(self):
        r = requests.get(f"{API}/kalshi/status", headers=h(T2), timeout=30)
        assert r.status_code == 200 and r.json()["connected"] is False

    def test_invalid_pem(self):
        r = requests.put(f"{API}/kalshi/credentials", json={"key_id": "abcd1234", "private_key": "x" * 80,
                         "environment": "demo"}, headers=h(T2), timeout=30)
        assert r.status_code == 400 and "private key" in r.json()["detail"]

    def test_balance_not_connected(self):
        assert requests.get(f"{API}/kalshi/balance", headers=h(T2), timeout=30).status_code == 400
