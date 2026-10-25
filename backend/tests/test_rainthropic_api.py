# Rainthropic API regression tests (ticker, cities, meta, quote, merchants, dashboard, guarantees, replay)
import math
import os
import pytest
import requests

BASE_URL = (os.environ.get('EXPO_PUBLIC_BACKEND_URL') or os.environ.get('EXPO_BACKEND_URL')).rstrip('/')
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def s():
    x = requests.Session()
    x.headers.update({"Content-Type": "application/json"})
    return x


@pytest.fixture(scope="module")
def merchants(s):
    r = s.get(f"{API}/merchants", timeout=30)
    assert r.status_code == 200
    return {m["name"]: m for m in r.json()}


# --- public market data
def test_ticker(s):
    r = s.get(f"{API}/ticker", timeout=30)
    assert r.status_code == 200
    d = r.json()
    assert len(d["cities"]) == 5
    assert d["event_ticker"].startswith("KXRAINWKND")
    print(d)


def test_cities(s):
    r = s.get(f"{API}/cities", timeout=30)
    assert r.status_code == 200
    c = r.json()["cities"]
    assert "Chicago" in c and "Miami" in c


def test_meta(s):
    d = s.get(f"{API}/meta", timeout=30).json()
    assert d["mode"] == "mock" and d["max_p"] == 0.6
    assert len(d["date_options"]) == 4 and len(d["business_types"]) > 0
    print(d["date_options"])


def test_quote_chicago_formula(s):
    d = s.get(f"{API}/quote", params={"city": "Chicago", "booking_value": 45}, timeout=30).json()
    print(d)
    if not d["available"]:
        pytest.skip(f"Chicago unavailable: {d['reason']}")
    p = d["p"]
    exp = max(1, math.ceil(45) * (p + 0.07 * p * (1 - p)) * 1.2)
    assert abs(d["price"] - round(exp, 2)) < 0.011
    assert d["contracts"] == 45


def test_quote_margin_zero_and_min1(s):
    d = s.get(f"{API}/quote", params={"city": "Chicago", "booking_value": 1, "margin_pct": 0}, timeout=30).json()
    if d["available"]:
        assert d["price"] >= 1.0


def test_quote_miami_unavailable(s):
    d = s.get(f"{API}/quote", params={"city": "Miami", "booking_value": 80}, timeout=30).json()
    print(d)
    assert d["available"] is False and d["reason"]


def test_quote_bad_date_returns_4xx(s):
    r = s.get(f"{API}/quote", params={"city": "Chicago", "booking_value": 45, "date_str": "bad"}, timeout=30)
    assert r.status_code in (400, 422), r.status_code


def test_quote_negative_booking_value_rejected(s):
    r = s.get(f"{API}/quote", params={"city": "Chicago", "booking_value": -10}, timeout=30)
    assert r.status_code in (400, 422), f"{r.status_code} {r.text[:200]}"


# --- merchants
def test_seed_merchants(merchants):
    assert "Maria's Patio Taqueria" in merchants and "Bayfront Boat Tours" in merchants
    assert merchants["Bayfront Boat Tours"]["city"] == "Miami"
    assert "_id" not in merchants["Bayfront Boat Tours"]


def test_create_merchant_and_get(s):
    meta = s.get(f"{API}/meta", timeout=30).json()
    bt = meta["business_types"][0]
    r = s.post(f"{API}/merchants", json={"name": "TEST_Rainthropic Merchant", "business_type": bt, "city": "Chicago", "avg_booking": 30, "margin_pct": 0}, timeout=30)
    assert r.status_code == 200, r.text
    m = r.json()
    assert m["id"] and m["margin_pct"] == 0
    g = s.get(f"{API}/merchants/{m['id']}", timeout=30)
    assert g.status_code == 200 and g.json()["name"] == "TEST_Rainthropic Merchant"


def test_create_merchant_invalid_type(s):
    r = s.post(f"{API}/merchants", json={"name": "TEST_bad", "business_type": "zzz", "city": "Chicago", "avg_booking": 30}, timeout=30)
    assert r.status_code == 400


def test_create_merchant_invalid_avg(s):
    r = s.post(f"{API}/merchants", json={"name": "TEST_bad", "business_type": "x", "city": "Chicago", "avg_booking": -1}, timeout=30)
    assert r.status_code == 422


def test_merchant_404(s):
    assert s.get(f"{API}/merchants/abc", timeout=30).status_code == 404
    assert s.get(f"{API}/merchants/000000000000000000000000/dashboard", timeout=30).status_code == 404


# --- dashboard + guarantee
def test_dashboard_structure(s, merchants):
    mid = merchants["Maria's Patio Taqueria"]["id"]
    d = s.get(f"{API}/merchants/{mid}/dashboard", timeout=60).json()
    for k in ("merchant", "mode", "stats", "pnl", "live", "orderbook", "orders"):
        assert k in d
    st, pnl = d["stats"], d["pnl"]
    assert st["guarantees_sold"] >= 40
    assert abs(pnl["if_dry"]["net"] - round(st["premiums"] - st["hedge_cost"], 2)) < 0.02
    print(st, pnl)


def test_create_guarantee_chicago_increments(s, merchants):
    mid = merchants["Maria's Patio Taqueria"]["id"]
    before = s.get(f"{API}/merchants/{mid}/dashboard", timeout=60).json()
    if not before["live"]["available"]:
        pytest.skip("Chicago weekend unavailable")
    r = s.post(f"{API}/guarantees", json={"merchant_id": mid, "customer_name": "TEST_guest", "booking_value": 45, "kind": "weekend"}, timeout=60)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["order"]["mode"] == "mock" and d["order"]["count"] == 45 and d["order"]["status"] == "filled"
    after = s.get(f"{API}/merchants/{mid}/dashboard", timeout=60).json()
    assert after["stats"]["guarantees_sold"] == before["stats"]["guarantees_sold"] + 1
    assert after["orders"][0]["guarantee_id"] == d["guarantee"]["id"]


def test_create_guarantee_miami_400(s, merchants):
    mid = merchants["Bayfront Boat Tours"]["id"]
    r = s.post(f"{API}/guarantees", json={"merchant_id": mid, "booking_value": 80, "kind": "weekend"}, timeout=60)
    print(r.text)
    assert r.status_code == 400


def test_create_guarantee_bad_kind(s, merchants):
    mid = merchants["Maria's Patio Taqueria"]["id"]
    r = s.post(f"{API}/guarantees", json={"merchant_id": mid, "booking_value": 45, "kind": "monthly"}, timeout=60)
    assert r.status_code in (400, 422), f"{r.status_code} {r.text[:200]}"


# --- replay
def test_replay_list(s):
    d = s.get(f"{API}/replay", params={"city": "Chicago"}, timeout=90).json()
    assert len(d["items"]) > 0
    results = {i["result"] for i in d["items"]}
    print(len(d["items"]), results, d["items"][:3])
    assert results <= {"yes", "no"}


def test_replay_detail_yes(s):
    d = s.get(f"{API}/replay/detail", params={"ticker": "KXRAIN-26OCT16-CHI"}, timeout=60).json()
    print(d)
    assert d["result"] == "yes"
    assert d["refunds"] == 45 * 40 and d["payout"] == d["contracts"]
    assert abs(d["net"] - round(d["premiums"] - d["hedge_cost"] - d["refunds"] + d["payout"], 2)) < 0.02


def test_replay_detail_no(s):
    items = s.get(f"{API}/replay", params={"city": "Chicago"}, timeout=90).json()["items"]
    no = next((i for i in items if i["result"] == "no"), None)
    if not no:
        pytest.skip("no NO market")
    d = s.get(f"{API}/replay/detail", params={"ticker": no["ticker"]}, timeout=60).json()
    print(d)
    assert d["result"] == "no" and d["refunds"] == 0 and d["payout"] == 0
    assert abs(d["net"] - round(d["premiums"] - d["hedge_cost"], 2)) < 0.02


def test_replay_detail_404(s):
    assert s.get(f"{API}/replay/detail", params={"ticker": "KXRAIN-NOPE"}, timeout=60).status_code == 404
