# RainSure backend API regression tests (config, cities, ticker, quote math, merchants, checkout, guarantees, dashboard, replay)
import math
import os
from datetime import date, timedelta

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"
T = 60


@pytest.fixture(scope="session")
def s():
    return requests.Session()


@pytest.fixture(scope="session")
def merchants(s):
    r = s.get(f"{API}/merchants", timeout=T)
    assert r.status_code == 200
    return {m["name"]: m for m in r.json()}


@pytest.fixture(scope="session")
def test_merchant(s):
    r = s.post(f"{API}/merchants", json={"name": "TEST_Chicago Patio", "type": "patio_restaurant",
                                          "city": "Chicago", "avg_booking": 45}, timeout=T)
    assert r.status_code == 200, r.text
    return r.json()


def _sat(today):
    wd = today.weekday()
    return today - timedelta(days=1) if wd == 6 else today + timedelta(days=5 - wd)


# Config / cities / ticker
def test_config(s):
    d = s.get(f"{API}/config", timeout=T).json()
    assert d["trading_mode"] == "simulated"
    assert "boat_tour" in d["business_types"]


def test_cities(s):
    r = s.get(f"{API}/cities", timeout=T)
    assert r.status_code == 200
    c = r.json()
    print("cities:", len(c))
    assert len(c) >= 20 and "Chicago" in c and "Miami" in c


def test_ticker(s):
    d = s.get(f"{API}/ticker", timeout=T).json()
    names = [c["city"] for c in d["cities"]]
    assert names == ["Chicago", "Miami", "New York City", "Austin", "Seattle"]
    print(d)


# Quote pricing math
def test_quote_math(s):
    sat = _sat(date.today())
    r = s.get(f"{API}/quote", params={"city": "Chicago", "product": "weekend", "date": sat.isoformat(),
                                      "booking_value": 45}, timeout=T)
    assert r.status_code == 200
    q = r.json()
    print(q)
    if q.get("p") is None:
        pytest.skip(f"no market: {q['reason']}")
    p = q["p"]
    fee = 0.07 * p * (1 - p)
    assert abs(q["fee_per_contract"] - round(fee, 4)) < 1e-6
    assert abs(q["price"] - max(1.0, round(45 * (p + fee) * 1.2, 2))) < 0.011
    assert q["contracts"] == 45
    if p > 0.60:
        assert not q["available"] and q["reason"].startswith("High rain")


def test_quote_unlisted_weekend(s):
    far = _sat(date.today()) + timedelta(days=28)
    q = s.get(f"{API}/quote", params={"city": "Chicago", "product": "weekend", "date": far.isoformat(),
                                      "booking_value": 45}, timeout=T).json()
    assert q["available"] is False and q["reason"] == "Opens Monday"


def test_quote_unlisted_daily(s):
    far = date.today() + timedelta(days=20)
    q = s.get(f"{API}/quote", params={"city": "Chicago", "product": "daily", "date": far.isoformat(),
                                      "booking_value": 45}, timeout=T).json()
    assert q["available"] is False and q["reason"] == "Not listed yet"


def test_quote_min_price(s):
    sat = _sat(date.today())
    q = s.get(f"{API}/quote", params={"city": "Chicago", "product": "weekend", "date": sat.isoformat(),
                                      "booking_value": 1}, timeout=T).json()
    if q.get("p") is not None:
        assert q["price"] >= 1.0


# Merchants
def test_seed_merchants(merchants):
    assert "Maria's Patio Taqueria" in merchants and "Bayfront Boat Tours" in merchants
    assert merchants["Maria's Patio Taqueria"]["city"] == "Chicago"
    assert merchants["Bayfront Boat Tours"]["avg_booking"] == 85


def test_create_merchant_bad_city(s):
    r = s.post(f"{API}/merchants", json={"name": "TEST_Bad", "type": "food_truck", "city": "Atlantis",
                                          "avg_booking": 20}, timeout=T)
    assert r.status_code == 400


def test_create_merchant_bad_type(s):
    r = s.post(f"{API}/merchants", json={"name": "TEST_Bad", "type": "bank", "city": "Chicago",
                                          "avg_booking": 20}, timeout=T)
    assert r.status_code == 422


def test_create_merchant_persist(s, test_merchant):
    ids = [m["id"] for m in s.get(f"{API}/merchants", timeout=T).json()]
    assert test_merchant["id"] in ids


# Checkout
def test_checkout_options(s, test_merchant):
    r = s.get(f"{API}/checkout/options", params={"merchant_id": test_merchant["id"]}, timeout=T)
    assert r.status_code == 200
    opts = r.json()["options"]
    assert len(opts) == 5
    assert [o["product"] for o in opts] == ["daily"] * 3 + ["weekend"] * 2
    for o in opts:
        print(o["event_ticker"], o["available"], o.get("p"), o["reason"], o.get("depth_available"), o.get("depth_ok"))
        if not o["available"]:
            assert o["reason"]


def test_checkout_unknown_merchant(s):
    r = s.get(f"{API}/checkout/options", params={"merchant_id": "nope"}, timeout=T)
    assert r.status_code == 404


# Guarantees
def test_guarantee_flow(s, test_merchant):
    opts = s.get(f"{API}/checkout/options", params={"merchant_id": test_merchant["id"]}, timeout=T).json()["options"]
    av = [o for o in opts if o["available"]]
    if not av:
        pytest.skip("no available market")
    o = av[0]
    body = {"merchant_id": test_merchant["id"], "product": o["product"], "date": o["date"],
            "customer_name": "TEST_Customer", "booking_value": 45}
    if not o["depth_ok"]:
        r = s.post(f"{API}/guarantees", json=body, timeout=T)
        assert r.status_code == 409 and "contracts available" in r.json()["detail"]
        body["accept_thin_depth"] = True
    r = s.post(f"{API}/guarantees", json=body, timeout=T)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["order"]["mode"] == "simulated" and d["order"]["count"] == 45
    assert d["order"]["kalshi_order_id"].startswith("SIM-")
    assert d["guarantee"]["status"] == "active"
    dash = s.get(f"{API}/merchants/{test_merchant['id']}/dashboard", timeout=T).json()
    assert dash["kpis"]["guarantees_sold"] == 1
    assert dash["kpis"]["contracts_held"] == 45
    assert dash["kpis"]["refunds_promised"] == 45
    assert any(x["id"] == d["order"]["id"] for x in dash["orders"])
    g = d["guarantee"]
    assert abs(dash["pnl"]["dry"] - round(g["price_paid"] - g["hedge_cost"], 2)) < 0.011
    assert abs(dash["pnl"]["rain"] - round(g["price_paid"] - 45 + 45 - g["hedge_cost"], 2)) < 0.011


def test_guarantee_unavailable(s, test_merchant):
    far = _sat(date.today()) + timedelta(days=28)
    r = s.post(f"{API}/guarantees", json={"merchant_id": test_merchant["id"], "product": "weekend",
                                           "date": far.isoformat(), "customer_name": "TEST_x",
                                           "booking_value": 45}, timeout=T)
    assert r.status_code == 409 and r.json()["detail"] == "Opens Monday"


# Dashboards for seeds
def test_dashboard_maria(s, merchants):
    d = s.get(f"{API}/merchants/{merchants[chr(77)+'aria' + chr(39) + 's Patio Taqueria']['id']}/dashboard", timeout=T).json()
    print(d["kpis"], d["pnl"]["rain"], d["pnl"]["dry"], d["trading_mode"])
    assert d["kpis"]["guarantees_sold"] >= 40
    assert d["trading_mode"] == "simulated"


def test_dashboard_bayfront(s, merchants):
    d = s.get(f"{API}/merchants/{merchants['Bayfront Boat Tours']['id']}/dashboard", timeout=T).json()
    print(d["kpis"], d["pnl"])
    assert d["kpis"]["refunded"] == 12
    assert d["kpis"]["active"] == 0
    gs = d["guarantees"]
    g = gs[0]
    exp = 12 * (g["price_paid"] - g["hedge_cost"] + g["contracts"] - g["booking_value"])
    assert abs(d["pnl"]["realized"] - round(exp, 2)) < 0.05


# Replay
def test_replay(s):
    r = s.get(f"{API}/replay/markets", params={"city": "Chicago"}, timeout=T)
    assert r.status_code == 200
    ms = r.json()["markets"]
    print("replay markets", len(ms), sum(m["result"] == "yes" for m in ms))
    assert ms
    for res in ("yes", "no"):
        m = next((x for x in ms if x["result"] == res), None)
        if not m:
            continue
        d = s.get(f"{API}/replay/{m['ticker']}", params={"bookings": 40, "booking_value": 45}, timeout=T).json()
        net = d["premium"] - d["hedge_cost"] + d["hedge_payout"] - d["refunds"]
        assert abs(d["net"] - round(net, 2)) < 0.011
        assert d["contracts"] == math.ceil(45)


def test_replay_bad_ticker(s):
    assert s.get(f"{API}/replay/KXRAIN-NOPE", timeout=T).status_code == 404


# Orderbook + high-rain rejection + input validation (added by testing agent iteration_1)
def test_orderbook_live(s):
    sat = _sat(date.today())
    q = s.get(f"{API}/quote", params={"city": "Chicago", "product": "weekend", "date": sat.isoformat(),
                                      "booking_value": 45}, timeout=T).json()
    if not q.get("ticker"):
        pytest.skip("no market")
    d = s.get(f"{API}/orderbook/{q['ticker']}", timeout=T).json()
    assert d["ticker"] == q["ticker"]
    assert isinstance(d["asks"], list) and len(d["asks"]) <= 12
    if d["asks"]:
        prices = [a[0] for a in d["asks"]]
        assert prices == sorted(prices)


def test_guarantee_high_rain_409(s, merchants):
    bay = merchants["Bayfront Boat Tours"]
    opts = s.get(f"{API}/checkout/options", params={"merchant_id": bay["id"]}, timeout=T).json()["options"]
    hi = next((o for o in opts if (o["reason"] or "").startswith("High rain")), None)
    if not hi:
        pytest.skip("no high-rain market right now")
    r = s.post(f"{API}/guarantees", json={"merchant_id": bay["id"], "product": hi["product"], "date": hi["date"],
                                           "customer_name": "TEST_hi", "booking_value": 85}, timeout=T)
    assert r.status_code == 409 and r.json()["detail"].startswith("High rain")


def test_guarantee_bad_booking_value_422(s, merchants):
    m = merchants["Maria's Patio Taqueria"]
    r = s.post(f"{API}/guarantees", json={"merchant_id": m["id"], "product": "daily", "date": date.today().isoformat(),
                                           "customer_name": "TEST_neg", "booking_value": -5}, timeout=T)
    assert r.status_code == 422


def test_quote_negative_booking_rejected(s):
    # Known issue: /api/quote accepts negative booking_value and returns available=True, contracts<0
    r = s.get(f"{API}/quote", params={"city": "Chicago", "product": "daily", "date": date.today().isoformat(),
                                      "booking_value": -5}, timeout=T)
    assert r.status_code == 422 or r.json().get("available") is False
