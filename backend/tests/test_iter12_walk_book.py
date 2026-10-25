"""Iter12: walk_book order-book walking (unit), walked quotes vs Kalshi REST book, and the 409 price guard.
SAFETY: never posts a guarantee that could fill — only with a too-low expected_price (server must 409 first).
"""
import os
import math
import pytest
import requests
from pymongo import MongoClient

import services.kalshi as k

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", os.environ.get("EXPO_BACKEND_URL", "")).rstrip("/")
if not BASE_URL:
    for line in open("/app/frontend/.env"):
        if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
            BASE_URL = line.split("=", 1)[1].strip().strip('"').rstrip("/")
KALSHI = "https://api.elections.kalshi.com/trade-api/v2"
MARIA = "6add11451f0373a8576b5b40"


def fee(a):
    return 0.07 * a * (1 - a)


# ---------------------------------------------------------------- walk_book unit
class TestWalkBook:
    def test_single_level(self):
        avg, worst, fees = k.walk_book([(0.02, 100.0)], 45)
        assert avg == 0.02 and worst == 0.02 and fees == pytest.approx(45 * fee(0.02))

    def test_multi_level_average_worst_fees(self):
        asks = [(0.02, 5.0), (0.33, 17.0), (0.34, 65.0), (0.35, 1000.0)]
        avg, worst, fees = k.walk_book(asks, 45)
        assert avg == round((5 * 0.02 + 17 * 0.33 + 23 * 0.34) / 45, 4)
        assert worst == 0.34
        assert fees == pytest.approx(5 * fee(0.02) + 17 * fee(0.33) + 23 * fee(0.34))

    def test_insufficient_under_cap_returns_none(self):
        assert k.walk_book([(0.05, 10.0), (0.59, 10.0), (0.61, 1000.0)], 45) is None

    def test_cap_level_inclusive(self):
        avg, worst, _ = k.walk_book([(0.10, 5.0), (0.60, 100.0)], 10)
        assert worst == 0.60 and avg == 0.35

    def test_empty_book(self):
        assert k.walk_book([], 1) is None

    def test_exact_fill(self):
        avg, worst, _ = k.walk_book([(0.01, 45.0), (0.02, 1.0)], 45)
        assert avg == 0.01 and worst == 0.01


def rest_asks(ticker):
    ob = requests.get(f"{KALSHI}/markets/{ticker}/orderbook", timeout=20).json().get("orderbook_fp") or {}
    return sorted([(round(1 - float(p), 2), float(s)) for p, s in (ob.get("no_dollars") or []) if float(s) >= 1])


def quote(kind, d, bv=45):
    return requests.get(f"{BASE_URL}/api/quote", params={"city": "Chicago", "booking_value": bv, "kind": kind,
                                                         "date_str": d}, timeout=30).json()


# ---------------------------------------------------------------- walked quotes vs real Kalshi book
class TestWalkedQuotes:
    @pytest.mark.parametrize("d", ["2026-10-25", "2026-10-26"])
    def test_daily_45_available_and_matches_rest(self, d):
        q = quote("daily", d)
        if q.get("status") not in ("active", "open"):
            pytest.skip(f"market closed: {q.get('reason')}")
        assert q["available"] is True, q.get("reason")
        assert q["price_source"] == "stream"
        assert 0.01 <= q["p"] <= 0.03 and q["limit"] is not None and q["p"] <= q["limit"]
        exp = k.walk_book(rest_asks(q["ticker"]), 45)
        assert exp is not None
        assert abs(q["p"] - exp[0]) <= 0.01 and abs(q["limit"] - exp[1]) <= 0.01
        assert q["contracts"] == 45 and q["hedge_cost"] == pytest.approx(45 * q["p"] + 45 * q["fee_per_contract"], abs=0.02)

    def test_weekend_45_too_large(self):
        q = quote("weekend", "2026-10-24")
        if q.get("status") not in ("active", "open"):
            pytest.skip(f"weekend market closed: {q.get('reason')}")
        assert q["available"] is False
        assert q["reason"] == "Too large for today's hedge budget — try a smaller booking or another date"
        assert q["hedge_cost"] > 10 and q["limit"] <= 0.60


# ---------------------------------------------------------------- 409 price guard (creates nothing)
class TestPriceGuard:
    def test_low_expected_price_409_creates_nothing(self):
        mc = MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
        g0 = mc.guarantees.count_documents({"merchant_id": MARIA})
        live0 = mc.orders.count_documents({"mode": "kalshi_live"})
        q = quote("daily", "2026-10-25")
        if not q.get("available") or q["price"] <= 0.01 + 0.005:
            pytest.skip("guard not provable safely (quote unavailable or price too low)")
        r = requests.post(f"{BASE_URL}/api/guarantees", json={
            "merchant_id": MARIA, "customer_name": "TEST_iter12_guard", "booking_value": 45, "kind": "daily",
            "date": "2026-10-25", "expected_price": 0.01}, timeout=30)
        assert r.status_code == 409, r.text
        assert "price just changed" in r.json()["detail"]
        assert mc.guarantees.count_documents({"merchant_id": MARIA}) == g0
        assert mc.orders.count_documents({"mode": "kalshi_live"}) == live0 == 0
