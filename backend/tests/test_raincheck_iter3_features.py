# RainCheck iteration 3: watches/alerts, price-drop logic, push, season plans, cron, simulate/payout, kalshi sync
import os
import time
import uuid
import pytest
import requests
from pymongo import MongoClient
from dotenv import dotenv_values

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"
T1 = "test_session_raincheck"
T2 = "test_session_raincheck_2"
BIZ = "6b8b4a0f56dd"
ENV = dotenv_values("/app/backend/.env")
CRON = ENV["WEBHOOK_CRON_SECRET"]
mdb = MongoClient(ENV["MONGO_URL"])[ENV["DB_NAME"]]


def h(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


def uid(tok):
    return requests.get(f"{API}/auth/me", headers=h(tok), timeout=30).json()["user_id"]


@pytest.fixture(scope="module")
def market():
    r = requests.get(f"{API}/markets", params={"city": "Chicago"}, timeout=60)
    ms = [m for m in r.json() if m["yes_ask"] and 0.1 < m["yes_ask"] < 0.9 and m["no_ask"] and m["no_ask"] < 1]
    assert ms
    return ms[0]


# --- Watches CRUD ---
class TestWatches:
    def test_create_list_delete(self, market):
        r = requests.post(f"{API}/watches", headers=h(T2), json={"ticker": market["ticker"], "side": "yes", "headline": "TEST_watch"}, timeout=60)
        assert r.status_code == 200, r.text
        w = r.json()
        assert w["ticker"] == market["ticker"] and w["active"] is True and "_id" not in w
        assert isinstance(w["baseline_price"], float)
        lst = requests.get(f"{API}/watches", headers=h(T2), timeout=30).json()
        assert any(x["id"] == w["id"] for x in lst)
        assert requests.delete(f"{API}/watches/{w['id']}", headers=h(T2), timeout=30).status_code == 200
        lst = requests.get(f"{API}/watches", headers=h(T2), timeout=30).json()
        assert not any(x["id"] == w["id"] for x in lst)

    def test_watch_bad_ticker(self):
        r = requests.post(f"{API}/watches", headers=h(T2), json={"ticker": "KXNOPE-XX", "side": "yes"}, timeout=60)
        assert r.status_code == 404

    def test_watch_bad_target(self, market):
        r = requests.post(f"{API}/watches", headers=h(T2), json={"ticker": market["ticker"], "target_price": 1.5}, timeout=30)
        assert r.status_code == 422

    def test_unauth(self):
        assert requests.get(f"{API}/watches", timeout=30).status_code == 401


# --- Price-drop / forecast logic via Mongo-edited baselines ---
class TestCheckLogic:
    def _setup(self, market):
        u2 = uid(T2)
        mdb.alerts.delete_many({"user_id": u2})
        mdb.watches.delete_many({"user_id": u2})
        r = requests.post(f"{API}/watches", headers=h(T2), json={"ticker": market["ticker"], "side": "yes"}, timeout=60)
        return u2, r.json()

    def _kinds(self, u2):
        return [a["kind"] for a in mdb.alerts.find({"user_id": u2})]

    def test_no_change_no_alert(self, market):
        u2, w = self._setup(market)
        r = requests.post(f"{API}/alerts/check", headers=h(T2), timeout=90)
        assert r.status_code == 200
        assert r.json()["fired"] == 0
        assert self._kinds(u2) == []

    def test_small_drop_no_alert(self, market):
        u2, w = self._setup(market)
        mdb.watches.update_one({"id": w["id"]}, {"$set": {"baseline_price": round(w["baseline_price"] + 0.01, 3)}})
        r = requests.post(f"{API}/alerts/check", headers=h(T2), timeout=90)
        assert "cheaper" not in self._kinds(u2), r.json()

    def test_big_drop_fires_cheaper(self, market):
        u2, w = self._setup(market)
        mdb.watches.update_one({"id": w["id"]}, {"$set": {"baseline_price": min(0.99, w["baseline_price"] * 1.5 + 0.05)}})
        r = requests.post(f"{API}/alerts/check", headers=h(T2), timeout=90)
        assert r.json()["fired"] >= 1
        assert "cheaper" in self._kinds(u2)
        w2 = mdb.watches.find_one({"id": w["id"]})
        assert abs(w2["baseline_price"] - w2["last_price"]) < 1e-9  # baseline reset -> no re-fire
        r = requests.post(f"{API}/alerts/check", headers=h(T2), timeout=90)
        assert self._kinds(u2).count("cheaper") == 1

    def test_target_hit_fires(self, market):
        u2, w = self._setup(market)
        mdb.watches.update_one({"id": w["id"]}, {"$set": {"baseline_price": round(w["baseline_price"] + 0.01, 3), "target_price": 0.99}})
        requests.post(f"{API}/alerts/check", headers=h(T2), timeout=90)
        assert "cheaper" in self._kinds(u2)

    def test_forecast_shift(self, market):
        u2, w = self._setup(market)
        bp = w["baseline_prob"]
        mdb.watches.update_one({"id": w["id"]}, {"$set": {"baseline_prob": bp + 0.2 if bp < 0.7 else bp - 0.2}})
        requests.post(f"{API}/alerts/check", headers=h(T2), timeout=90)
        assert "forecast" in self._kinds(u2)
        alerts = requests.get(f"{API}/alerts", headers=h(T2), timeout=30).json()
        assert alerts and all(a["read"] is False for a in alerts)
        assert requests.post(f"{API}/alerts/read", headers=h(T2), timeout=30).status_code == 200
        d = requests.get(f"{API}/dashboard", headers=h(T2), timeout=60).json()
        assert d["unread_alerts"] == 0
        mdb.watches.delete_many({"user_id": u2})
        mdb.alerts.delete_many({"user_id": u2})


# --- Push ---
class TestPush:
    def test_public_key(self):
        r = requests.get(f"{API}/push/public-key", timeout=30)
        assert r.status_code == 200 and len(r.json()["publicKey"]) > 40

    def test_test_without_subs_400(self):
        mdb.push_subscriptions.delete_many({"user_id": uid(T2)})
        r = requests.post(f"{API}/push/test", headers=h(T2), timeout=30)
        assert r.status_code == 400

    def test_subscribe_unsubscribe(self):
        sub = {"endpoint": f"https://fcm.googleapis.com/fcm/send/TEST_{uuid.uuid4().hex}", "keys": {"p256dh": "x", "auth": "y"}}
        assert requests.post(f"{API}/push/subscribe", headers=h(T2), json=sub, timeout=30).status_code == 200
        assert mdb.push_subscriptions.count_documents({"endpoint": sub["endpoint"]}) == 1
        r = requests.post(f"{API}/push/test", headers=h(T2), timeout=60)
        assert r.status_code == 200 and r.json()["devices"] >= 1
        assert requests.post(f"{API}/push/unsubscribe", headers=h(T2), json=sub, timeout=30).status_code == 200
        assert mdb.push_subscriptions.count_documents({"endpoint": sub["endpoint"]}) == 0


# --- Season plans ---
class TestPlans:
    body = {"business_id": BIZ, "weekends": 4, "risks": ["rain", "cool"], "coverage": 0.4, "budget": 50, "mode": "paper"}

    def test_preview(self):
        r = requests.post(f"{API}/plans/preview", headers=h(T1), json=self.body, timeout=120)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["legs"] and d["now_cost"] <= 50
        assert d["later"] == sum(1 for l in d["legs"] if not l["available"])

    def test_validation(self):
        assert requests.post(f"{API}/plans/preview", headers=h(T1), json={**self.body, "risks": []}, timeout=30).status_code == 422
        assert requests.post(f"{API}/plans/preview", headers=h(T1), json={**self.body, "budget": 0}, timeout=30).status_code == 422
        assert requests.post(f"{API}/plans/preview", headers=h(T2), json=self.body, timeout=30).status_code == 404

    def test_kalshi_mode_400(self):
        r = requests.post(f"{API}/plans", headers=h(T1), json={**self.body, "mode": "kalshi"}, timeout=60)
        assert r.status_code == 400

    def test_create_budget_cancel(self):
        budget = 3
        r = requests.post(f"{API}/plans", headers=h(T1), json={**self.body, "budget": budget}, timeout=180)
        assert r.status_code == 200, r.text
        p = r.json()
        assert p["spent"] <= budget + 1e-9
        per_leg = budget / len(p["legs"])
        placed = [l for l in p["legs"] if l["status"] == "placed"]
        for l in placed:
            assert l["cost"] <= per_leg + 1e-9
        pos = requests.get(f"{API}/positions", headers=h(T1), timeout=120).json()
        pids = {x["id"] for x in pos if x.get("plan_id") == p["id"]}
        assert pids == {l["position_id"] for l in placed}
        lst = requests.get(f"{API}/plans", headers=h(T1), timeout=30).json()
        assert any(x["id"] == p["id"] for x in lst)
        assert requests.post(f"{API}/plans/{p['id']}/cancel", headers=h(T1), timeout=30).status_code == 200
        assert requests.post(f"{API}/plans/{p['id']}/cancel", headers=h(T1), timeout=30).status_code == 404
        # cleanup
        mdb.positions.delete_many({"plan_id": p["id"]})
        mdb.plans.delete_one({"id": p["id"]})


# --- Cron ---
class TestCron:
    def test_ok_and_duplicate(self):
        wid = f"TEST_{uuid.uuid4().hex}"
        t = time.time()
        r = requests.post(f"{API}/cron/tick", headers={"Authorization": f"Bearer {CRON}", "X-Webhook-Id": wid}, timeout=30)
        assert r.status_code == 200 and r.json() == {"ok": True}
        assert time.time() - t < 5
        r = requests.post(f"{API}/cron/tick", headers={"Authorization": f"Bearer {CRON}", "X-Webhook-Id": wid}, timeout=30)
        assert r.json().get("duplicate") is True
        mdb.cron_runs.delete_one({"run_id": wid})

    def test_bad_token(self):
        assert requests.post(f"{API}/cron/tick", headers={"Authorization": "Bearer nope"}, timeout=30).status_code == 401
        assert requests.post(f"{API}/cron/tick", timeout=30).status_code == 401


# --- Simulate / payout / sync ---
class TestSimulate:
    def _open(self, market):
        r = requests.post(f"{API}/positions", headers=h(T2), json={"ticker": market["ticker"], "side": "yes", "contracts": 10, "mode": "paper", "loss_if_event": 20, "headline": "TEST_sim"}, timeout=60)
        assert r.status_code == 200, r.text
        return r.json()

    def test_hit_and_miss(self, market):
        p = self._open(market)
        r = requests.post(f"{API}/positions/{p['id']}/simulate", headers=h(T2), json={"result": "yes"}, timeout=60)
        assert r.status_code == 200
        d = r.json()
        assert d["status"] == "settled" and d["won"] is True and d["payout"] == 10 and d["celebrated"] is False and d["simulated"]
        assert requests.post(f"{API}/positions/{p['id']}/simulate", headers=h(T2), json={"result": "yes"}, timeout=30).status_code == 400
        assert requests.post(f"{API}/positions/{p['id']}/celebrated", headers=h(T2), timeout=30).status_code == 200
        assert mdb.positions.find_one({"id": p["id"]})["celebrated"] is True
        assert mdb.alerts.count_documents({"user_id": uid(T2), "kind": "payout"}) >= 1
        q = self._open(market)
        d = requests.post(f"{API}/positions/{q['id']}/simulate", headers=h(T2), json={"result": "no"}, timeout=60).json()
        assert d["won"] is False and d["payout"] == 0
        # other user can't simulate
        z = self._open(market)
        assert requests.post(f"{API}/positions/{z['id']}/simulate", headers=h(T1), json={"result": "yes"}, timeout=30).status_code == 404
        for x in (p, q, z):
            mdb.positions.delete_one({"id": x["id"]})
        mdb.alerts.delete_many({"user_id": uid(T2)})

    def test_kalshi_position_cannot_simulate(self, market):
        pid = f"TEST{uuid.uuid4().hex[:8]}"
        mdb.positions.insert_one({"id": pid, "user_id": uid(T2), "mode": "kalshi", "status": "open", "side": "yes"})
        r = requests.post(f"{API}/positions/{pid}/simulate", headers=h(T2), json={"result": "yes"}, timeout=30)
        mdb.positions.delete_one({"id": pid})
        assert r.status_code == 400

    def test_sync_none(self):
        r = requests.post(f"{API}/kalshi/sync", headers=h(T2), timeout=60)
        assert r.status_code == 200 and r.json() == {"synced": 0}
