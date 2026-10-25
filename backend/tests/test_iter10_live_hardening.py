# Iteration 10: kalshi_live hardening - read-only public API checks + in-process _place_live guards.
# SAFETY: never POSTs /api/guarantees; core.http.post is always replaced by a fake; no real Kalshi orders.
import asyncio
import os
import sys

import pytest
import requests

sys.path.insert(0, "/app/backend")

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL").rstrip("/")
MARIA = "6add11451f0373a8576b5b40"
TEST_GID = "TEST_iter10_gid"


# ---------------------------------------------------------------- Public read-only API (live mode)
class TestPublicLive:
    def test_meta_mode_live(self):
        d = requests.get(f"{BASE_URL}/api/meta", timeout=30).json()
        assert d["mode"] == "kalshi_live"
        assert len(d["date_options"]) == 4

    def test_dashboard_mode_live(self):
        r = requests.get(f"{BASE_URL}/api/merchants/{MARIA}/dashboard", timeout=30)
        assert r.status_code == 200
        assert r.json().get("mode") == "kalshi_live"

    def test_quote_45_weekend_walked_book(self):
        # New (iter12): build_quote walks the book up to the 60c cap; 45 weekend contracts cost ~$14 walked,
        # so the live cap rejects it as too large (not 'Not enough sellers' unless the book under 60c is too thin).
        q = requests.get(f"{BASE_URL}/api/quote", params={"city": "Chicago", "booking_value": 45, "kind": "weekend",
                                                         "date_str": "2026-10-24"}, timeout=30).json()
        if q.get("status") not in ("active", "open"):
            pytest.skip(f"Weekend market not open: {q.get('reason')}")
        assert q["available"] is False
        if q.get("limit") is None:
            assert q["reason"] == "Not enough sellers on Kalshi right now" and q["depth_ok"] is False
        else:
            worst = round(45 * min(0.99, q["limit"] + 0.01) * 1.07, 2) + 0.01
            assert worst > 10, f"walked worst-case {worst} fits the cap but quote unavailable: {q['reason']}"
            assert q["reason"].startswith("Too large for today's hedge budget")

    def test_quote_7_available(self):
        q = requests.get(f"{BASE_URL}/api/quote", params={"city": "Chicago", "booking_value": 7, "kind": "weekend",
                                                         "date_str": "2026-10-24"}, timeout=30).json()
        assert q["available"] is True, q.get("reason")
        assert q["contracts"] == 7 and q["price"] >= 1.0 and q["reason"] is None


# ---------------------------------------------------------------- In-process _place_live (fake http.post)
import core as _core  # noqa: E402  share one loop across test modules (motor binds to the first loop)
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
    calls = []

    async def _never(*a, **kw):
        raise AssertionError("real http.post must not be called")

    monkeypatch.setattr(core.http, "post", _never)
    monkeypatch.setattr(k, "_signed_headers", lambda *a, **kw: {})
    k._calls = calls
    yield k
    from pymongo import MongoClient
    MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]].orders.delete_many({"guarantee_id": TEST_GID})


def _order(k):
    from models import HedgeOrder
    return HedgeOrder(merchant_id=MARIA, guarantee_id=TEST_GID, ticker="KXTEST", count=5, price=0.04, fee=0.0, mode="mock")


def _patch_post(monkeypatch, k, fn):
    import core

    async def post(url, headers=None, json=None):
        k._calls.append(json)
        return await fn(url, json)
    monkeypatch.setattr(core.http, "post", post)


def _spent(monkeypatch, k, v):
    async def s():
        return v
    monkeypatch.setattr(k, "spent_today", s)


class TestPlaceLive:
    def test_payload_fill_or_kill_and_full_fill(self, k, monkeypatch):
        _spent(monkeypatch, k, 0.0)

        async def ok(url, body):
            return FakeResp(201, {"order_id": "X1", "fill_count": "5.00", "average_fill_price": "0.05", "average_fee_paid": "0.0034"})
        _patch_post(monkeypatch, k, ok)
        o = _order(k)
        run(k._place_live(o, "KXTEST", 5, 0.04, "rainly-test"))
        body = k._calls[0]
        assert body["time_in_force"] == "fill_or_kill"
        assert body["count"] == "5.00" and body["price"] == "0.0500"  # iter12: limit passed directly (walked book) + 1c
        assert o.mode == "kalshi_live" and o.status == "filled" and o.cost == round(0.05 * 5 + 0.02, 2)

    def test_partial_fill_raises(self, k, monkeypatch):
        _spent(monkeypatch, k, 0.0)

        async def part(url, body):
            return FakeResp(201, {"order_id": "X2", "fill_count": "3.00"})
        _patch_post(monkeypatch, k, part)
        with pytest.raises(k.HedgeFailed):
            run(k._place_live(_order(k), "KXTEST", 5, 0.04, "rainly-test"))

    def test_rejected_raises(self, k, monkeypatch):
        _spent(monkeypatch, k, 0.0)

        async def rej(url, body):
            return FakeResp(400, {"error": "fok not filled"})
        _patch_post(monkeypatch, k, rej)
        with pytest.raises(k.HedgeFailed):
            run(k._place_live(_order(k), "KXTEST", 5, 0.04, "rainly-test"))

    def test_cap_recheck_inside_lock_blocks_post(self, k, monkeypatch):
        _spent(monkeypatch, k, 9.9)

        async def ok(url, body):
            return FakeResp(201, {"fill_count": "5.00"})
        _patch_post(monkeypatch, k, ok)
        with pytest.raises(k.HedgeFailed) as ei:
            run(k._place_live(_order(k), "KXTEST", 5, 0.04, "rainly-test"))
        assert "budget" in str(ei.value) and k._calls == []

    def test_connection_lost_records_worst_case(self, k, monkeypatch):
        from core import db
        _spent(monkeypatch, k, 0.0)

        async def boom(url, body):
            raise ConnectionError("reset")
        _patch_post(monkeypatch, k, boom)
        with pytest.raises(k.HedgeFailed):
            run(k._place_live(_order(k), "KXTEST", 5, 0.04, "rainly-test"))
        doc = run(db.orders.find_one({"guarantee_id": TEST_GID}))
        assert doc and doc["mode"] == "kalshi_live" and doc["status"] == "unknown"
        assert doc["cost"] == round(5 * 0.05 * 1.07, 2) + 0.01 == k.live_worst_cost(5, 0.04)  # limit 4c + 1c tolerance

    def test_lock_serializes_concurrent_orders(self, k, monkeypatch):
        # cap 10, worst ~= 5*0.07*1.07 = 0.37 each; spent grows after each fill -> second must see first
        state = {"spent": 9.5, "inflight": 0, "max": 0}

        async def s():
            return state["spent"]
        monkeypatch.setattr(k, "spent_today", s)

        async def slow(url, body):
            state["inflight"] += 1
            state["max"] = max(state["max"], state["inflight"])
            await asyncio.sleep(0.05)
            state["inflight"] -= 1
            state["spent"] += 0.37  # order recorded
            return FakeResp(201, {"fill_count": "5.00", "average_fill_price": "0.07"})
        _patch_post(monkeypatch, k, slow)

        async def go():
            return await asyncio.gather(*[k._place_live(_order(k), "KXTEST", 5, 0.04, f"c{i}") for i in range(3)],
                                        return_exceptions=True)
        res = run(go())
        assert state["max"] == 1
        # 9.5 + .37 = 9.87 ok; 9.87 + .37 > 10 blocked
        assert sum(1 for r in res if isinstance(r, k.HedgeFailed)) == 2


class TestDepthGate:
    def test_live_thin_book_unavailable(self, k, monkeypatch):
        monkeypatch.setattr(k, "trading_mode", lambda: "kalshi_live")
        _spent(monkeypatch, k, 0.0)

        async def thin(t):
            return {"asks": [(0.04, 3.0)], "bids": []}
        monkeypatch.setattr(k, "orderbook", thin)
        q = run(k.build_quote("Chicago", "weekend", k.date(2026, 10, 24), 5, 20))
        if not q.get("yes_ask") or q["yes_ask"] > 0.5:
            pytest.skip("Chicago not quotable")
        assert q["available"] is False and q["reason"] == "Not enough sellers on Kalshi right now"
