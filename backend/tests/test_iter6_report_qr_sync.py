# Iteration 6: weekly earnings report, QR as_json, Kalshi demo order status sync
import base64
import os

import pytest
import requests
from bson import ObjectId
from pymongo import MongoClient

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
MARIA = "6add11451f0373a8576b5b40"
CANCELED_DEMO_ORDER = "01a170dc-6f28-7b7f-9a9b-ef796a99e9de"


@pytest.fixture(scope="module")
def db():
    c = MongoClient(os.environ["MONGO_URL"])
    yield c[os.environ["DB_NAME"]]
    c.close()


# --- Weekly earnings report
class TestReport:
    def test_report_default_8_weeks(self):
        r = requests.get(f"{BASE_URL}/api/merchants/{MARIA}/report", params={"weeks": 8}, timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert len(d["weeks"]) == 8
        assert d["totals"]["sold"] == 41
        assert d["totals"]["net"] == pytest.approx(27.28, abs=0.01)
        assert "_id" not in d["merchant"] and d["merchant"]["id"] == MARIA
        wk = [w["week_of"] for w in d["weeks"]]
        assert wk == sorted(wk)
        for w in d["weeks"]:
            assert set(w) >= {"week_of", "sold", "fees", "hedge_cost", "refunds", "payout", "net"}
            assert w["net"] == pytest.approx(w["fees"] - w["hedge_cost"] - w["refunds"] + w["payout"], abs=0.02)
        assert sum(w["sold"] for w in d["weeks"]) == 41

    def test_report_totals_consistent(self):
        d = requests.get(f"{BASE_URL}/api/merchants/{MARIA}/report", timeout=30).json()
        for k in ("fees", "hedge_cost", "refunds", "payout", "net"):
            assert d["totals"][k] == pytest.approx(sum(w[k] for w in d["weeks"]), abs=0.02)

    @pytest.mark.parametrize("weeks,expected", [(0, 1), (-5, 1), (99, 26), (26, 26), (1, 1)])
    def test_report_weeks_clamp(self, weeks, expected):
        r = requests.get(f"{BASE_URL}/api/merchants/{MARIA}/report", params={"weeks": weeks}, timeout=30)
        assert r.status_code == 200
        assert len(r.json()["weeks"]) == expected

    def test_report_bad_id_404(self):
        for bad in ("000000000000000000000000", "not-an-id"):
            r = requests.get(f"{BASE_URL}/api/merchants/{bad}/report", timeout=30)
            assert r.status_code == 404, (bad, r.status_code, r.text)

    def test_report_non_int_weeks_422(self):
        r = requests.get(f"{BASE_URL}/api/merchants/{MARIA}/report", params={"weeks": "abc"}, timeout=30)
        assert r.status_code == 422


# --- QR endpoint
class TestQR:
    def test_qr_as_json(self):
        r = requests.get(f"{BASE_URL}/api/qr", params={"as_json": "true", "data": "x"}, timeout=30)
        assert r.status_code == 200
        b = base64.b64decode(r.json()["png_base64"])
        assert b[:8] == b"\x89PNG\r\n\x1a\n"

    def test_qr_plain_png(self):
        r = requests.get(f"{BASE_URL}/api/qr", params={"data": "x"}, timeout=30)
        assert r.status_code == 200
        assert r.headers["content-type"].startswith("image/png")
        assert r.content[:4] == b"\x89PNG"

    def test_qr_validation(self):
        assert requests.get(f"{BASE_URL}/api/qr", params={"data": ""}, timeout=30).status_code == 400
        assert requests.get(f"{BASE_URL}/api/qr", params={"data": "a" * 501}, timeout=30).status_code == 400


# --- Kalshi demo order status sync (dashboard load triggers it)
class TestOrderSync:
    def test_sync_resting_to_canceled(self, db):
        before_g = db.guarantees.count_documents({"merchant_id": MARIA})
        before_o = db.orders.count_documents({"merchant_id": MARIA})
        oid = db.orders.insert_one({
            "merchant_id": MARIA, "guarantee_id": "TEST_sync_guarantee", "ticker": "KXRAINWKND-TEST",
            "side": "yes", "action": "buy", "count": 3, "price": 0.07, "fee": 0.01, "mode": "kalshi_demo",
            "status": "resting", "kalshi_order_id": CANCELED_DEMO_ORDER, "note": "TEST_sync",
            "created_at": "2000-01-01T00:00:00+00:00",
        }).inserted_id
        try:
            r = requests.get(f"{BASE_URL}/api/merchants/{MARIA}/dashboard", timeout=60)
            assert r.status_code == 200
            doc = db.orders.find_one({"_id": oid})
            assert doc["status"].startswith("canceled"), doc
            assert doc.get("synced_at")
            assert doc.get("note") == "Canceled on Kalshi demo"
        finally:
            db.orders.delete_one({"_id": ObjectId(str(oid))})
        assert db.orders.count_documents({"merchant_id": MARIA}) == before_o
        assert db.guarantees.count_documents({"merchant_id": MARIA}) == before_g == 41
