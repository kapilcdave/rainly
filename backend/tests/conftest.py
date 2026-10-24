# Shared setup: load env (frontend URL + Mongo) and purge TEST_ data after the session
import os

import pytest
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")
load_dotenv("/app/frontend/.env")


@pytest.fixture(scope="session", autouse=True)
def _cleanup_test_data():
    yield
    from pymongo import MongoClient
    c = MongoClient(os.environ["MONGO_URL"])
    d = c[os.environ["DB_NAME"]]
    mids = [str(m["_id"]) for m in d.merchants.find({"name": {"$regex": "^TEST_"}})]
    gq = {"$or": [{"customer_name": {"$regex": "^TEST_"}}, {"merchant_id": {"$in": mids}}]}
    gids = [str(g["_id"]) for g in d.guarantees.find(gq)]
    d.orders.delete_many({"$or": [{"guarantee_id": {"$in": gids}}, {"merchant_id": {"$in": mids}}]})
    d.guarantees.delete_many(gq)
    d.merchants.delete_many({"name": {"$regex": "^TEST_"}})
    c.close()
