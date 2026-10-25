# Iteration 4: ticker sparkline history/change, QR PNG endpoint, booking confirmation email status
import os
import time

import pytest
import requests
from bson import ObjectId
from pymongo import MongoClient

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"
CITIES = 5


@pytest.fixture(scope="module")
def s():
    return requests.Session()


@pytest.fixture(scope="module")
def db():
    c = MongoClient(os.environ["MONGO_URL"])
    yield c[os.environ["DB_NAME"]]
    c.close()


# --- Ticker: history arrays + change ---
def test_ticker_history_and_change(s):
    r = s.get(f"{API}/ticker", timeout=60)
    assert r.status_code == 200
    d = r.json()
    assert len(d["cities"]) == CITIES
    for c in d["cities"]:
        assert isinstance(c["history"], list)
        assert all(isinstance(v, (int, float)) and 0 < v <= 1 for v in c["history"])
        assert c["change"] is None or isinstance(c["change"], int)
        print(c["city"], c["p"], c["change"], len(c["history"]), c["history"][:3], c["history"][-3:])
    assert any(len(c["history"]) >= 2 for c in d["cities"]), "no city has sparkline data"


# --- QR endpoint ---
def test_qr_valid_png(s):
    r = s.get(f"{API}/qr", params={"data": "https://example.com/merchant/x/checkout"}, timeout=30)
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("image/png")
    assert r.content[:8] == b"\x89PNG\r\n\x1a\n"


def test_qr_empty_400(s):
    r = s.get(f"{API}/qr", params={"data": ""}, timeout=30)
    assert r.status_code == 400, r.status_code


def test_qr_missing_param(s):
    r = s.get(f"{API}/qr", timeout=30)
    print("missing data ->", r.status_code)
    assert r.status_code in (400, 422)


def test_qr_500_ok_501_400(s):
    assert s.get(f"{API}/qr", params={"data": "a" * 500}, timeout=30).status_code == 200
    assert s.get(f"{API}/qr", params={"data": "a" * 501}, timeout=30).status_code == 400


# --- Booking confirmation email (ONE email only) + strict cleanup ---
def test_guarantee_confirmation_email_once(s, db):
    m = next(x for x in s.get(f"{API}/merchants", timeout=30).json() if x["name"] == "Maria's Patio Taqueria")
    mid = m["id"]
    g0, o0 = db.guarantees.count_documents({"merchant_id": mid}), db.orders.count_documents({"merchant_id": mid})
    r = s.post(f"{API}/guarantees", json={"merchant_id": mid, "customer_name": "TEST_email", "booking_value": 45,
                                          "kind": "weekend", "customer_email": "delivered@resend.dev"}, timeout=60)
    gid = r.json().get("guarantee", {}).get("id") if r.status_code == 200 else None
    try:
        assert r.status_code == 200, r.text
        assert gid and ObjectId.is_valid(gid)
        status = None
        for _ in range(15):
            doc = db.guarantees.find_one({"_id": ObjectId(gid)})
            status = doc.get("confirm_email_status")
            if status:
                break
            time.sleep(1)
        print("confirm_email_status =", status)
        assert status is not None, "confirm_email_status never set"
        assert status == "sent" or status.startswith("failed:"), status
        if status != "sent":
            pytest.fail(f"email not sent: {status}")
    finally:
        if gid and ObjectId.is_valid(gid):
            ro = db.orders.delete_many({"guarantee_id": gid})
            rg = db.guarantees.delete_one({"_id": ObjectId(gid)})
            print("cleanup orders deleted:", ro.deleted_count, "guarantees deleted:", rg.deleted_count)
        assert db.guarantees.count_documents({"merchant_id": mid}) == g0
        assert db.orders.count_documents({"merchant_id": mid}) == o0
