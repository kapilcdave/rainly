# Iteration 7: contact_email validation, coverage page API, decline/attach-rate stats, multi-location brands
import os
from urllib.parse import quote as urlq

import pytest
import requests
from bson import ObjectId
from pymongo import MongoClient

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
MARIA = "6add11451f0373a8576b5b40"
MARIA_BRAND = "Maria's Patio Taqueria"


@pytest.fixture(scope="module")
def db():
    c = MongoClient(os.environ["MONGO_URL"])
    yield c[os.environ["DB_NAME"]]
    c.close()


@pytest.fixture
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# --- Merchant contact_email validation (no insert on 400)
class TestContactEmail:
    def test_invalid_email_400(self, api, db):
        before = db.merchants.count_documents({})
        r = api.post(f"{BASE_URL}/api/merchants", json={"name": "TEST_BadEmail", "business_type": "patio_restaurant",
                                                        "city": "Miami", "avg_booking": 45, "contact_email": "not-an-email"})
        assert r.status_code == 400
        assert "email" in r.json()["detail"].lower()
        assert db.merchants.count_documents({}) == before

    def test_too_long_email_422(self, api):
        r = api.post(f"{BASE_URL}/api/merchants", json={"name": "TEST_Long", "business_type": "patio_restaurant",
                                                        "city": "Miami", "avg_booking": 45, "contact_email": "a" * 201})
        assert r.status_code == 422


# --- Customer coverage endpoint
class TestCoverage:
    def test_coverage_active_no_email(self, api, db):
        gid = str(db.guarantees.find_one({"merchant_id": MARIA})["_id"])
        r = api.get(f"{BASE_URL}/api/guarantees/{gid}")
        assert r.status_code == 200
        d = r.json()
        assert d["id"] == gid and d["status"] == "active"
        assert d["merchant_name"] == MARIA_BRAND and d["city"] == "Chicago"
        assert "customer_email" not in d and "@" not in str(d)
        assert d["booking_value"] > 0 and "covers_until" in d

    def test_coverage_invalid_and_missing(self, api):
        assert api.get(f"{BASE_URL}/api/guarantees/bad-id").status_code == 404
        assert api.get(f"{BASE_URL}/api/guarantees/{ObjectId()}").status_code == 404


# --- Report totals + decline logging / attach rate
class TestDeclines:
    def test_maria_report_totals(self, api):
        t = api.get(f"{BASE_URL}/api/merchants/{MARIA}/report").json()["totals"]
        assert t["sold"] == 41 and t["declined"] == 0 and t["attach_rate"] == 1.0

    def test_decline_bad_merchant_404(self, api):
        assert api.post(f"{BASE_URL}/api/checkouts/declined", json={"merchant_id": "nope"}).status_code == 404
        assert api.post(f"{BASE_URL}/api/checkouts/declined", json={"merchant_id": str(ObjectId())}).status_code == 404
        assert api.post(f"{BASE_URL}/api/checkouts/declined", json={}).status_code == 422

    def test_decline_lowers_attach_rate(self, api, db):
        before = {d["_id"] for d in db.declines.find({"merchant_id": MARIA}, {"_id": 1})}
        r = api.post(f"{BASE_URL}/api/checkouts/declined", json={"merchant_id": MARIA})
        new_ids = []
        try:
            assert r.status_code == 200 and r.json() == {"ok": True}
            new_ids = [d["_id"] for d in db.declines.find({"merchant_id": MARIA}, {"_id": 1}) if d["_id"] not in before]
            assert len(new_ids) == 1
            t = api.get(f"{BASE_URL}/api/merchants/{MARIA}/report").json()["totals"]
            assert t["declined"] == 1 and t["attach_rate"] == round(41 / 42, 3) and t["attach_rate"] < 1
        finally:
            for _id in new_ids:
                db.declines.delete_one({"_id": _id})
        assert api.get(f"{BASE_URL}/api/merchants/{MARIA}/report").json()["totals"]["declined"] == 0


# --- Brands / multi-location
class TestBrands:
    def test_unknown_brand_404(self, api):
        assert api.get(f"{BASE_URL}/api/brands/TEST_NoSuchBrand").status_code == 404

    def test_brand_defaults_to_name(self, api, db):
        r = api.post(f"{BASE_URL}/api/merchants", json={"name": "TEST_SoloBrand", "business_type": "patio_restaurant",
                                                        "city": "Miami", "avg_booking": 30})
        try:
            assert r.status_code == 200
            assert r.json()["brand"] == "TEST_SoloBrand" and r.json()["contact_email"] is None
        finally:
            db.merchants.delete_one({"_id": ObjectId(r.json()["id"])})

    def test_second_location_rolls_up(self, api, db):
        single = api.get(f"{BASE_URL}/api/brands/{urlq(MARIA_BRAND, safe='')}")
        assert single.status_code == 200 and len(single.json()["locations"]) == 1
        assert api.get(f"{BASE_URL}/api/merchants/{MARIA}/dashboard").json()["brand_locations"] == 1
        r = api.post(f"{BASE_URL}/api/merchants", json={"name": "TEST_Loc", "brand": MARIA_BRAND, "city": "Miami",
                                                        "business_type": "patio_restaurant", "avg_booking": 45})
        assert r.status_code == 200
        lid = r.json()["id"]
        try:
            assert r.json()["brand"] == MARIA_BRAND
            assert api.get(f"{BASE_URL}/api/merchants/{MARIA}/dashboard").json()["brand_locations"] == 2
            b = api.get(f"{BASE_URL}/api/brands/{urlq(MARIA_BRAND, safe='')}").json()
            names = [l["merchant"]["name"] for l in b["locations"]]
            assert names == [MARIA_BRAND, "TEST_Loc"]
            assert b["locations"][0]["sold"] == 41 and b["locations"][1]["sold"] == 0
            assert b["totals"]["sold"] == 41 and len(b["weeks"]) == 8
            assert b["totals"]["net"] == b["locations"][0]["net"]
        finally:
            db.merchants.delete_one({"_id": ObjectId(lid)})
        assert api.get(f"{BASE_URL}/api/merchants/{MARIA}/dashboard").json()["brand_locations"] == 1
