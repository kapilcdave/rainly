# Iteration 15: kalshi_demo mode - quotes priced from the DEMO book, FOK demo orders, rejection mapping, no orphans.
# SAFETY: never POSTs /api/guarantees; in-process tests replace core.http.post with a fake (no real orders).
import asyncio
import os
import sys

import httpx
import pytest
import requests

sys.path.insert(0, "/app/backend")

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL").rstrip("/")
DEMO = os.environ.get("KALSHI_DEMO_BASE").rstrip("/")
MARIA = "6add11451f0373a8576b5b40"


def quote(city, kind, d, bv=45):
    r = requests.get(f"{BASE_URL}/api/quote", params={"city": city, "booking_value": bv, "kind": kind, "date_str": d}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()


def demo_best_ask(ticker):
    ob = httpx.get(f"{DEMO}/markets/{ticker}/orderbook", timeout=20).json().get("orderbook_fp") or {}
    no = [float(p) for p, s in (ob.get("no_dollars") or []) if float(s) >= 1]
    return round(1 - max(no), 2) if no else 0.0


# ---------------------------------------------------------------- Public API (read-only)
class TestDemoPublic:
    def test_meta_mode_demo(self):
        m = requests.get(f"{BASE_URL}/api/meta", timeout=30).json()
        assert m["mode"] == "kalshi_demo" and m["mock_trading"] is False

    def test_dashboard_mode_demo(self):
        d = requests.get(f"{BASE_URL}/api/merchants/{MARIA}/dashboard", timeout=60).json()
        assert d["mode"] == "kalshi_demo"

    def test_chicago_today_price_source_demo_matches_demo_book(self):
        q = quote("Chicago", "daily", "2026-10-25")
        assert q["price_source"] == "demo"
        ask = demo_best_ask(q["ticker"])
        if ask == 0.0:
            assert q["available"] is False and q["reason"] == "No sellers on Kalshi right now"
        else:
            assert q["p"] == ask

    def test_albuquerque_today_priced_from_demo_book(self):
        q = quote("Albuquerque", "daily", "2026-10-25", bv=10)
        if q.get("ticker") is None:
            pytest.skip("ABQ not listed")
        ask = demo_best_ask(q["ticker"])
        assert q["price_source"] == "demo"  # iter16: yes_ask is production odds; p comes from the demo book
        if 0 < ask <= 0.6:
            assert q["available"] is True and q["p"] == ask and q["limit"] >= ask and q["contracts"] == 10

    def test_weekend_next_not_open(self):
        q = quote("Chicago", "weekend", "2026-10-31")
        assert q["available"] is False and q["reason"] == "Opens Monday"


# ---------------------------------------------------------------- In-process demo order placement (fake http.post)
import core as _core  # noqa: E402
_loop = getattr(_core, "_test_loop", None) or asyncio.new_event_loop()
_core._test_loop = _loop


def run(coro):
    return _loop.run_until_complete(coro)


class FakeResp:
    def __init__(self, code, body):
        self.status_code, self._b, self.text = code, body, str(body)

    def json(self):
        return self._b


@pytest.fixture
def k(monkeypatch):
    import core
    import services.kalshi as k
    k._calls = []

    async def _never(*a, **kw):
        raise AssertionError("real http.post must not be called")
    monkeypatch.setattr(core.http, "post", _never)
    monkeypatch.setattr(k, "_signed_headers", lambda *a, **kw: {})
    return k


def _patch(monkeypatch, k, resp):
    import core

    async def post(url, headers=None, json=None):
        k._calls.append((url, json))
        return resp
    monkeypatch.setattr(core.http, "post", post)


def _order():
    from models import HedgeOrder
    return HedgeOrder(merchant_id=MARIA, guarantee_id="TEST_iter15", ticker="KXTEST", count=5, price=0.04, fee=0.0, mode="mock")


class TestDemoPlace:
    def test_demo_fill_hits_demo_exchange(self, k, monkeypatch):
        _patch(monkeypatch, k, FakeResp(201, {"order_id": "D1", "fill_count": "5.00", "average_fill_price": "0.04", "average_fee_paid": "0.0027"}))
        o = _order()
        run(k._place_real(o, "KXTEST", 5, 0.04, "rainly-t", live=False))
        url, body = k._calls[0]
        assert url.startswith(k.KALSHI_DEMO) and body["time_in_force"] == "fill_or_kill" and body["price"] == "0.0500"
        assert o.mode == "kalshi_demo" and o.status == "filled" and o.kalshi_order_id == "D1" and o.note == "Filled on Kalshi demo"

    @pytest.mark.parametrize("code,needle", [("insufficient_balance", "enough funds"), ("market_closed", "just closed")])
    def test_rejection_codes_mapped(self, k, monkeypatch, code, needle):
        _patch(monkeypatch, k, FakeResp(400, {"error": {"code": code, "message": code}}))
        with pytest.raises(k.HedgeFailed) as ei:
            run(k._place_real(_order(), "KXTEST", 5, 0.04, "rainly-t", live=False))
        assert needle in str(ei.value) and "No sellers" not in str(ei.value)

    def test_unknown_or_string_error_body(self, k, monkeypatch):
        _patch(monkeypatch, k, FakeResp(400, {"error": "fok not filled"}))
        with pytest.raises(k.HedgeFailed) as ei:
            run(k._place_real(_order(), "KXTEST", 5, 0.04, "rainly-t", live=False))
        assert "400" in str(ei.value)

    def test_unfilled_create_guarantee_409_and_deleted(self, k, monkeypatch):
        from fastapi import HTTPException
        from core import db
        from models import GuaranteeCreate
        import routers.guarantees as rg
        monkeypatch.setattr(k, "trading_mode", lambda: "kalshi_demo")

        async def deep(t):
            return {"asks": [(0.05, 1000.0)], "bids": []}
        monkeypatch.setattr(k, "orderbook", deep)
        _patch(monkeypatch, k, FakeResp(201, {"order_id": "D2", "fill_count": "0.00"}))

        async def go():
            with pytest.raises(HTTPException) as ei:
                await rg.create_guarantee(GuaranteeCreate(merchant_id=MARIA, customer_name="TEST_iter15_unfilled",
                                                          booking_value=5, kind="daily", date="2026-10-25"))
            n = await db.guarantees.count_documents({"customer_name": "TEST_iter15_unfilled"})
            return ei.value, n
        exc, n = run(go())
        assert exc.status_code == 409 and "no charge" in exc.detail and n == 0
