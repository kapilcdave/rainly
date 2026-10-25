# Iteration 16: Maria moved to Tampa; demo-book pricing with PRODUCTION rain odds as yes_ask; orphan-free create_guarantee.
# SAFETY: never POSTs /api/guarantees over HTTP; in-process tests patch place_hedge / http.post (no real orders).
import asyncio
import os
import sys

import httpx
import pytest
import requests

sys.path.insert(0, "/app/backend")

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL").rstrip("/")
DEMO = os.environ.get("KALSHI_DEMO_BASE").rstrip("/")
PROD = "https://api.elections.kalshi.com/trade-api/v2"
MARIA = "6add11451f0373a8576b5b40"
TODAY, TOMORROW, WKND = "2026-10-25", "2026-10-26", "2026-10-24"


def quote(city, kind, d, bv=45):
    r = requests.get(f"{BASE_URL}/api/quote", params={"city": city, "booking_value": bv, "kind": kind, "date_str": d}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()


def best_ask(base, ticker):
    ob = httpx.get(f"{base}/markets/{ticker}/orderbook", timeout=20).json().get("orderbook_fp") or {}
    no = [float(p) for p, s in (ob.get("no_dollars") or []) if float(s) >= 1]
    return round(1 - max(no), 2) if no else 0.0


# ---------------------------------------------------------------- Maria / Tampa
class TestTampaMerchant:
    def test_maria_is_in_tampa(self):
        m = requests.get(f"{BASE_URL}/api/merchants/{MARIA}", timeout=30).json()
        assert m["city"] == "Tampa" and m["name"] == "Maria's Patio Taqueria"

    def test_dashboard_demo_and_weekend_production_odds(self):
        d = requests.get(f"{BASE_URL}/api/merchants/{MARIA}/dashboard", timeout=60).json()
        assert d["mode"] == "kalshi_demo"
        live = d["live"]
        assert live["ticker"] == "KXRAINWKND-26OCT24-TPA"
        prod = best_ask(PROD, live["ticker"])
        assert live["yes_ask"] > 0 and abs(live["yes_ask"] - prod) <= 0.03


# ---------------------------------------------------------------- Quotes: demo price, production odds
class TestTampaQuotes:
    def test_today_available_demo_priced(self):
        q = quote("Tampa", "daily", TODAY)
        assert q["available"] is True and q["price_source"] == "demo" and q["ticker"] == "KXRAIN-26OCT25-TPA"
        assert q["contracts"] == 45 and q["p"] == best_ask(DEMO, q["ticker"]) and q["depth_ok"] is True
        assert q["price"] >= 1.0 and q["limit"] >= q["p"]

    def test_today_yes_ask_is_production(self):
        q = quote("Tampa", "daily", TODAY)
        assert abs(q["yes_ask"] - best_ask(PROD, q["ticker"])) <= 0.03

    def test_albuquerque_yes_ask_production_not_demo(self):
        q = quote("Albuquerque", "daily", TODAY, bv=10)
        if not q.get("ticker"):
            pytest.skip("ABQ not listed")
        prod, demo = best_ask(PROD, q["ticker"]), best_ask(DEMO, q["ticker"])
        assert abs(q["yes_ask"] - prod) <= 0.03
        if demo and q.get("available"):
            assert q["p"] == demo

    @pytest.mark.parametrize("kind,d", [("daily", TOMORROW), ("weekend", WKND)])
    def test_no_demo_sellers_unavailable_but_odds_shown(self, kind, d):
        q = quote("Tampa", kind, d)
        if best_ask(DEMO, q["ticker"]) > 0:
            pytest.skip("demo sellers appeared")
        assert q["available"] is False and q["reason"] == "No sellers on Kalshi right now"
        assert q["yes_ask"] > 0  # production odds, not 0 from the empty demo book

    def test_chicago_empty_demo_book_still_shows_production_odds(self):
        q = quote("Chicago", "daily", TODAY)
        assert q["price_source"] == "demo"
        assert abs(q["yes_ask"] - best_ask(PROD, q["ticker"])) <= 0.03


# ---------------------------------------------------------------- create_guarantee deletes on ANY hedge exception
import core as _core  # noqa: E402
_loop = getattr(_core, "_test_loop", None) or asyncio.new_event_loop()
_core._test_loop = _loop


def run(coro):
    return _loop.run_until_complete(coro)


class TestNoOrphans:
    def test_unexpected_exception_deletes_booking(self, monkeypatch):
        import core
        import routers.guarantees as rg
        from models import GuaranteeCreate

        async def _never(*a, **kw):
            raise AssertionError("real http.post must not be called")
        monkeypatch.setattr(core.http, "post", _never)

        async def boom(*a, **kw):
            raise RuntimeError("TEST_unexpected kalshi body")
        monkeypatch.setattr(rg, "place_hedge", boom)

        async def go():
            with pytest.raises(Exception):
                await rg.create_guarantee(GuaranteeCreate(merchant_id=MARIA, customer_name="TEST_iter16_boom",
                                                          booking_value=5, kind="daily", date=TODAY))
            return await core.db.guarantees.count_documents({"customer_name": "TEST_iter16_boom"})
        assert run(go()) == 0
