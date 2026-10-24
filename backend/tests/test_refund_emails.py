# Rainly iteration 2: customer_email on guarantees + settlement refund emails (Resend via Emergent)
import os
import time
from datetime import datetime, timezone

import pytest
import requests
from bson import ObjectId
from dotenv import load_dotenv
from pymongo import MongoClient

load_dotenv("/app/backend/.env")
load_dotenv("/app/frontend/.env")
BASE_URL = (os.environ.get('EXPO_PUBLIC_BACKEND_URL') or os.environ.get('EXPO_BACKEND_URL')).rstrip('/')
API = f"{BASE_URL}/api"
YES_TICKER = "KXRAIN-26OCT16-CHI"
NO_TICKER = "KXRAIN-26OCT23-CHI"
RECIPIENT = "delivered@resend.dev"


@pytest.fixture(scope="module")
def s():
    x = requests.Session()
    x.headers.update({"Content-Type": "application/json"})
    return x


@pytest.fixture(scope="module")
def db():
    c = MongoClient(os.environ["MONGO_URL"])
    d = c[os.environ["DB_NAME"]]
    yield d
    # cleanup TEST_ data (guarantees + their hedge orders)
    ids = [str(g["_id"]) for g in d.guarantees.find({"customer_name": {"$regex": "^TEST_"}})]
    d.orders.delete_many({"guarantee_id": {"$in": ids}})
    d.guarantees.delete_many({"customer_name": {"$regex": "^TEST_"}})
    c.close()


@pytest.fixture(scope="module")
def maria(s):
    r = s.get(f"{API}/merchants", timeout=30)
    assert r.status_code == 200
    m = next((m for m in r.json() if m["name"] == "Maria's Patio Taqueria"), None)
    assert m, "Maria's Patio Taqueria seed missing"
    return m


def _wait_sent(db, gid, timeout=30):
    """Refund emails are sent in the background after settlement; poll until done."""
    end = time.time() + timeout
    while True:
        doc = db.guarantees.find_one({"_id": ObjectId(gid)})
        if doc.get("refund_email_status") not in ("pending", "sending") or time.time() > end:
            return doc
        time.sleep(0.5)


def _insert(db, mid, ticker, email, name, d="2026-10-16", kind="day"):
    doc = dict(merchant_id=mid, customer_name=name, booking_value=45.0, kind=kind, date=d,
               event_ticker=ticker.rsplit("-", 1)[0], ticker=ticker, p=0.5, fee_per_contract=0.02,
               contracts=46, hedge_cost=23.92, price=28.7, status="active", depth_warning=False,
               customer_email=email, refund_email_status=None, refund_email_at=None,
               created_at=datetime.now(timezone.utc).isoformat())
    return str(db.guarantees.insert_one(doc).inserted_id)


# --- POST /api/guarantees customer_email
def test_create_guarantee_invalid_email_400(s, maria):
    r = s.post(f"{API}/guarantees", json={"merchant_id": maria["id"], "customer_name": "TEST_bad",
                                          "customer_email": "not-an-email", "booking_value": 45}, timeout=60)
    assert r.status_code == 400
    assert r.json()["detail"] == "Enter a valid email address"


@pytest.mark.parametrize("bad", ["a@b", "a b@c.com", "@x.com", "foo@bar.c"])
def test_create_guarantee_invalid_email_variants(s, maria, bad):
    r = s.post(f"{API}/guarantees", json={"merchant_id": maria["id"], "customer_name": "TEST_bad",
                                          "customer_email": bad, "booking_value": 45}, timeout=60)
    assert r.status_code == 400, f"{bad} -> {r.status_code}"


def test_create_guarantee_valid_email_persisted(s, db, maria):
    r = s.post(f"{API}/guarantees", json={"merchant_id": maria["id"], "customer_name": "TEST_ok",
                                          "customer_email": f"  {RECIPIENT} ", "booking_value": 45}, timeout=60)
    assert r.status_code == 200, r.text
    g = r.json()["guarantee"]
    assert g["customer_email"] == RECIPIENT
    assert g["status"] == "active"
    assert g["refund_email_status"] is None
    doc = db.guarantees.find_one({"_id": ObjectId(g["id"])})
    assert doc["customer_email"] == RECIPIENT


def test_create_guarantee_blank_email_is_none(s, maria):
    r = s.post(f"{API}/guarantees", json={"merchant_id": maria["id"], "customer_name": "TEST_blank",
                                          "customer_email": "   ", "booking_value": 45}, timeout=60)
    assert r.status_code == 200, r.text
    assert r.json()["guarantee"]["customer_email"] is None


def test_create_guarantee_email_too_long_422(s, maria):
    r = s.post(f"{API}/guarantees", json={"merchant_id": maria["id"], "customer_name": "TEST_long",
                                          "customer_email": "a" * 200 + "@x.com", "booking_value": 45}, timeout=60)
    assert r.status_code in (400, 422)


# --- settlement flow
def test_settlement_yes_sends_email_once(s, db, maria):
    before = s.get(f"{API}/merchants/{maria['id']}/dashboard", timeout=90).json()["stats"]
    gid = _insert(db, maria["id"], YES_TICKER, RECIPIENT, "TEST_settle_yes")
    t0 = time.time()
    r = s.get(f"{API}/merchants/{maria['id']}/dashboard", timeout=90)
    print(f"dashboard with settlement+email took {time.time()-t0:.1f}s")
    assert r.status_code == 200
    st = r.json()["stats"]
    doc = _wait_sent(db, gid)
    assert doc["status"] == "refunded"
    assert doc["refund_email_status"] == "sent", doc.get("refund_email_status")
    assert doc.get("refund_email_id")
    assert doc.get("settled_at")
    st = s.get(f"{API}/merchants/{maria['id']}/dashboard", timeout=90).json()["stats"]
    assert st["refund_emails_sent"] == before["refund_emails_sent"] + 1
    assert st["refunded"] == before["refunded"] + 1
    at = doc["refund_email_at"]
    # idempotency: second dashboard load must not resend
    r2 = s.get(f"{API}/merchants/{maria['id']}/dashboard", timeout=90)
    assert r2.status_code == 200
    doc2 = db.guarantees.find_one({"_id": ObjectId(gid)})
    assert doc2["refund_email_at"] == at
    assert doc2["refund_email_id"] == doc["refund_email_id"]
    assert r2.json()["stats"]["refund_emails_sent"] == st["refund_emails_sent"]
    # refunded guarantee excluded from active liability
    assert gid not in [g["id"] for g in r2.json()["recent_guarantees"] if g["status"] == "active"]


def test_settlement_yes_no_email(s, db, maria):
    gid = _insert(db, maria["id"], YES_TICKER, None, "TEST_settle_noemail")
    r = s.get(f"{API}/merchants/{maria['id']}/dashboard", timeout=90)
    assert r.status_code == 200
    doc = db.guarantees.find_one({"_id": ObjectId(gid)})
    assert doc["status"] == "refunded"
    assert doc["refund_email_status"] == "no_email"
    assert doc.get("refund_email_at") is None


def test_settlement_no_expires_without_email(s, db, maria):
    before = s.get(f"{API}/merchants/{maria['id']}/dashboard", timeout=90).json()["stats"]
    gid = _insert(db, maria["id"], NO_TICKER, RECIPIENT, "TEST_settle_no", d="2026-10-23")
    r = s.get(f"{API}/merchants/{maria['id']}/dashboard", timeout=90)
    assert r.status_code == 200
    doc = db.guarantees.find_one({"_id": ObjectId(gid)})
    assert doc["status"] == "expired"
    assert doc.get("refund_email_status") is None
    assert doc.get("refund_email_at") is None
    st = r.json()["stats"]
    assert st["refund_emails_sent"] == before["refund_emails_sent"]
    assert st["expired"] == before["expired"] + 1


def test_settlement_weekend_kind_label(s, db, maria):
    # weekend-kind guarantee on a settled YES ticker still emails
    gid = _insert(db, maria["id"], YES_TICKER, RECIPIENT, "TEST_settle_wk", d="2026-10-17", kind="weekend")
    s.get(f"{API}/merchants/{maria['id']}/dashboard", timeout=90)
    doc = _wait_sent(db, gid)
    assert doc["status"] == "refunded"
    assert doc["refund_email_status"] == "sent"


def test_other_merchant_not_settled_by_maria_dashboard(s, db, maria):
    # dashboard settles only its own merchant's guarantees
    other = next(m for m in s.get(f"{API}/merchants", timeout=30).json() if m["id"] != maria["id"])
    gid = _insert(db, other["id"], NO_TICKER, None, "TEST_other")
    s.get(f"{API}/merchants/{maria['id']}/dashboard", timeout=90)
    assert db.guarantees.find_one({"_id": ObjectId(gid)})["status"] == "active"
