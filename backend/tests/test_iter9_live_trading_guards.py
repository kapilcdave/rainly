# Iteration 9: live-trading code must not regress mock mode; HedgeFailed -> 409 w/o orphan; daily cap logic.
import asyncio
import os
import sys

import pytest
import requests

sys.path.insert(0, "/app/backend")

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL").rstrip("/")
MARIA = "6add11451f0373a8576b5b40"


def _open_weekend():
    meta = requests.get(f"{BASE_URL}/api/meta", timeout=30).json()
    for o in meta["date_options"]:
        if o["open"]:
            return o
    pytest.skip("No open date right now")


# ---------------------------------------------------------------- Public API (mock mode)
class TestMockModeAPI:
    def test_meta_mode_mock(self):
        r = requests.get(f"{BASE_URL}/api/meta", timeout=30)
        assert r.status_code == 200
        d = r.json()
        if d["mode"] != "mock":
            pytest.skip(f"Backend runs in {d['mode']} (prod keys set) - mock-only assertion")
        assert d["mode"] == "mock"
        assert len(d["date_options"]) == 4
        for o in d["date_options"]:
            assert isinstance(o["open"], bool)
            assert o["kind"] in ("weekend", "daily")

    def test_merchant_dashboard_mode_mock(self):
        r = requests.get(f"{BASE_URL}/api/merchants/{MARIA}/dashboard", timeout=30)
        if r.status_code == 404:
            r = requests.get(f"{BASE_URL}/api/merchants/{MARIA}", timeout=30)
        assert r.status_code == 200
        assert r.json().get("mode") in ("mock", "kalshi_live", None)

    def test_quote_available_in_mock_no_budget_reason(self):
        if requests.get(f"{BASE_URL}/api/meta", timeout=30).json().get("mode") != "mock":
            pytest.skip("Backend not in mock mode - cap applies in kalshi_live by design")
        o = _open_weekend()
        r = requests.get(f"{BASE_URL}/api/quote", params={"city": "Chicago", "kind": o["kind"], "date": o["date"],
                                                          "booking_value": 500}, timeout=30)
        assert r.status_code == 200
        q = r.json()
        # $500 would blow the $10 live cap; in mock mode no cap must apply
        assert "hedge budget" not in (q.get("reason") or "")

    def test_create_guarantee_mock_then_cleanup(self):
        # SAFETY: never POST /api/guarantees unless the backend is in mock mode (real money otherwise)
        if requests.get(f"{BASE_URL}/api/meta", timeout=30).json().get("mode") != "mock":
            pytest.skip("Backend not in mock mode - refusing to place a (possibly real) order")
        o = _open_weekend()
        r = requests.post(f"{BASE_URL}/api/guarantees", json={"merchant_id": MARIA, "customer_name": "TEST_iter9",
                                                              "booking_value": 45, "kind": o["kind"], "date": o["date"]}, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["order"]["mode"] == "mock"
        assert d["order"]["note"] == "Simulated at live Kalshi price"
        assert d["order"]["status"] == "filled"
        assert d["order"]["count"] == 45
        assert d["order"].get("cost") is None  # mock orders never count toward the real-money cap
        g = requests.get(f"{BASE_URL}/api/guarantees/{d['guarantee']['id']}", timeout=30)
        assert g.status_code == 200 and g.json()["customer_name"] == "TEST_iter9"


# ---------------------------------------------------------------- In-process live-mode guards (no real orders)
import core as _core  # noqa: E402  share one loop across test modules (motor binds to the first loop)
_loop = getattr(_core, "_test_loop", None) or asyncio.new_event_loop()
_core._test_loop = _loop


def run(coro):
    return _loop.run_until_complete(coro)


@pytest.fixture
def live(monkeypatch):
    import core
    import services.kalshi as k

    async def _no_network_post(*a, **kw):  # safety net: never hit a trading endpoint
        raise AssertionError("http.post must not be called in tests")

    monkeypatch.setattr(core.http, "post", _no_network_post)
    monkeypatch.setattr(k, "trading_mode", lambda: "kalshi_live")

    async def _deep_book(ticker):  # deterministic depth so the live depth gate doesn't depend on the real book
        return {"asks": [(round(p / 100, 2), 10000.0) for p in range(1, 100)], "bids": []}

    monkeypatch.setattr(k, "orderbook", _deep_book)
    return k


class TestLiveModeGuards:
    def test_hedge_failed_returns_409_and_no_orphan(self, live, monkeypatch):
        from fastapi import HTTPException
        from core import db
        from models import GuaranteeCreate
        import routers.guarantees as rg
        o = _open_weekend()

        async def _fail(*a, **kw):
            raise live.HedgeFailed("No sellers at the live price right now — please try again")

        monkeypatch.setattr(live, "_place_live", _fail)

        async def spent0():
            return 0.0
        monkeypatch.setattr(live, "spent_today", spent0)

        async def go():
            before_g = await db.guarantees.count_documents({"customer_name": "TEST_iter9_livefail"})
            with pytest.raises(HTTPException) as ei:
                await rg.create_guarantee(GuaranteeCreate(merchant_id=MARIA, customer_name="TEST_iter9_livefail",
                                                          booking_value=20, kind=o["kind"], date=o["date"]))
            after_g = await db.guarantees.count_documents({"customer_name": "TEST_iter9_livefail"})
            orders = await db.orders.count_documents({"mode": "kalshi_live"})
            return ei.value, before_g, after_g, orders

        exc, b, a, orders = run(go())
        assert exc.status_code == 409
        assert "No sellers" in exc.detail
        assert b == 0 and a == 0
        assert orders == 0

    def test_live_success_records_cost(self, live, monkeypatch):
        from core import db
        from models import GuaranteeCreate
        import routers.guarantees as rg
        o = _open_weekend()

        async def _fake_fill(order, ticker, count, p, cid):
            order.mode = "kalshi_live"
            order.kalshi_order_id = "TEST_fake"
            order.filled = count
            order.price = p
            order.fee = 0.01
            order.cost = round(p * count + 0.01, 2)
            order.status = "filled"
            order.note = "Real order on Kalshi"

        monkeypatch.setattr(live, "_place_live", _fake_fill)

        async def go():
            res = await rg.create_guarantee(GuaranteeCreate(merchant_id=MARIA, customer_name="TEST_iter9_liveok",
                                                            booking_value=10, kind=o["kind"], date=o["date"]))
            spent = await live.spent_today()
            await db.orders.delete_many({"kalshi_order_id": "TEST_fake"})
            await db.guarantees.delete_many({"customer_name": "TEST_iter9_liveok"})
            return res, spent

        res, spent = run(go())
        assert res["order"]["mode"] == "kalshi_live"
        assert res["order"]["cost"] > 0
        assert spent == pytest.approx(res["order"]["cost"], abs=0.01)

    def test_cap_blocks_quote_when_budget_used(self, live, monkeypatch):
        o = _open_weekend()

        async def spent(): return 9.99
        monkeypatch.setattr(live, "spent_today", spent)
        q = run(live.build_quote("Chicago", o["kind"], live.date.fromisoformat(o["date"]), 20, 10))
        if q.get("p") is None and not q.get("yes_ask"):
            pytest.skip(f"Chicago not quotable: {q.get('reason')}")
        assert q["available"] is False
        assert "hedge budget" in q["reason"]

    def test_cap_blocks_single_large_booking(self, live, monkeypatch):
        o = _open_weekend()

        async def spent(): return 0.0
        monkeypatch.setattr(live, "spent_today", spent)
        q = run(live.build_quote("Chicago", o["kind"], live.date.fromisoformat(o["date"]), 500, 10))
        if not q.get("yes_ask"):
            pytest.skip(f"Chicago not quotable: {q.get('reason')}")
        assert q["available"] is False and "hedge budget" in q["reason"]

    def test_cap_allows_small_booking(self, live, monkeypatch):
        o = _open_weekend()

        async def spent(): return 0.0
        monkeypatch.setattr(live, "spent_today", spent)
        q = run(live.build_quote("Chicago", o["kind"], live.date.fromisoformat(o["date"]), 20, 10))
        if not q.get("yes_ask") or q["yes_ask"] > 0.3:
            pytest.skip("Chicago price not suitable")
        assert q["available"] is True

    def test_trading_mode_real_env_is_mock(self):
        import services.kalshi as k
        if k.KALSHI_PROD_ACCESS_KEY and k.KALSHI_PROD_PRIVATE_KEY_PEM:
            pytest.skip("Prod keys present - env is intentionally kalshi_live")
        assert k.trading_mode() == "mock"  # prod keys absent -> must stay mock even though KALSHI_LIVE_TRADING=true
