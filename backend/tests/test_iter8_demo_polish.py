# Iteration 8: demo polish — mock trading mode, open-date flags, simulated hedge fills, reminders off
import os

import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL").rstrip("/")
MARIA = "6add11451f0373a8576b5b40"


@pytest.fixture(scope="module")
def s():
    x = requests.Session()
    x.headers.update({"Content-Type": "application/json"})
    return x


@pytest.fixture(scope="module")
def meta(s):
    r = s.get(f"{BASE_URL}/api/meta", timeout=60)
    assert r.status_code == 200
    return r.json()


# --- /api/meta
class TestMeta:
    def test_mode_mock(self, meta):
        assert meta["mode"] == "mock"
        assert meta["mock_trading"] is True

    def test_open_flags(self, meta):
        opts = meta["date_options"]
        assert len(opts) == 4
        for o in opts:
            assert isinstance(o["open"], bool)

    def test_next_weekend_closed(self, meta):
        nxt = [o for o in meta["date_options"] if o["kind"] == "weekend"][1]
        assert nxt["date"] == "2026-10-31"
        assert nxt["open"] is False

    def test_root_mode(self, s):
        r = s.get(f"{BASE_URL}/api/", timeout=30)
        assert r.status_code == 200 and r.json()["mode"] == "mock"


# --- POST /api/guarantees with simulated fill
class TestSimulatedHedge:
    def test_create_guarantee_mock_fill(self, s, meta):
        before = s.get(f"{BASE_URL}/api/merchants/{MARIA}/dashboard", timeout=60).json()
        n_before = before["stats"]["guarantees_sold"]
        opened = [o for o in meta["date_options"] if o["open"]]
        assert opened, "no open dates"
        last_err = None
        for o in opened:
            r = s.post(f"{BASE_URL}/api/guarantees", json={
                "merchant_id": MARIA, "customer_name": "TEST_iter8", "customer_email": None,
                "booking_value": 45, "kind": o["kind"], "date": o["date"]}, timeout=60)
            if r.status_code == 200:
                break
            last_err = (o, r.status_code, r.text)
        else:
            pytest.skip(f"No open date available for Chicago: {last_err}")
        data = r.json()
        order = data["order"]
        print("used date", o, "order", order)
        assert order["mode"] == "mock"
        assert order["status"] == "filled"
        assert order["note"] == "Simulated at live Kalshi price"
        assert order["count"] == 45
        assert order["price"] == data["quote"]["p"]
        g = data["guarantee"]
        assert g["customer_name"] == "TEST_iter8" and g["contracts"] == 45
        # persisted
        gr = s.get(f"{BASE_URL}/api/guarantees/{g['id']}", timeout=30)
        assert gr.status_code == 200
        after = s.get(f"{BASE_URL}/api/merchants/{MARIA}/dashboard", timeout=60).json()
        assert after["mode"] == "mock"
        assert after["stats"]["guarantees_sold"] == n_before + 1
        assert any(x["guarantee_id"] == g["id"] for x in after["orders"]) or any(x["id"] == order["id"] for x in after["orders"])

    def test_closed_date_rejected(self, s):
        r = s.post(f"{BASE_URL}/api/guarantees", json={
            "merchant_id": MARIA, "customer_name": "TEST_iter8_closed", "customer_email": None,
            "booking_value": 45, "kind": "weekend", "date": "2026-10-31"}, timeout=60)
        print(r.status_code, r.text[:200])
        assert r.status_code == 400


# --- reminders switched off
def test_reminders_disabled():
    from services import notifications
    assert notifications.REMINDER_EMAILS is False
