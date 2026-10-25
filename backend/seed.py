"""Demo data for a fresh database."""
import random

from core import db, logger
from models import Guarantee, HedgeOrder, Merchant
from services.kalshi import event_ticker, f, find_market, get_event_markets, price_quote, today_et, weekend_saturday

CUSTOMERS = ["Ana", "Ben", "Carla", "Dev", "Elena", "Femi", "Gabe", "Hana", "Ivan", "Jade", "Kofi", "Lena", "Marco",
             "Nia", "Omar", "Priya", "Quinn", "Rosa", "Sam", "Tara"]


async def seed():
    if await db.merchants.count_documents({}) > 0:
        return
    maria = Merchant(name="Maria's Patio Taqueria", business_type="patio_restaurant", city="Tampa", avg_booking=45)
    maria.id = str((await db.merchants.insert_one(maria.to_mongo())).inserted_id)
    boat = Merchant(name="Bayfront Boat Tours", business_type="boat_tour", city="Miami", avg_booking=80)
    await db.merchants.insert_one(boat.to_mongo())

    sat = weekend_saturday(today_et())
    et = event_ticker("weekend", sat)
    p, ticker_ = 0.12, f"{et}-TPA"
    try:
        m = find_market(await get_event_markets("weekend", sat) or [], "Tampa")
        if m:
            ticker_ = m["ticker"]
            ask = f(m.get("yes_ask_dollars"))
            p = ask if 0 < ask < 1 else (f(m.get("last_price_dollars")) or 0.12)
    except Exception as e:
        logger.warning("seed price fetch failed: %s", e)
    q = price_quote(p, 45, maria.margin_pct)
    rnd = random.Random(7)
    for i in range(40):
        g = Guarantee(merchant_id=maria.id, customer_name=f"{CUSTOMERS[i % 20]} {chr(65 + rnd.randint(0, 25))}.",
                      booking_value=45, kind="weekend", date=sat.isoformat(), event_ticker=et, ticker=ticker_,
                      p=q["p"], fee_per_contract=q["fee_per_contract"], contracts=q["contracts"],
                      hedge_cost=q["hedge_cost"], price=q["price"])
        gid = str((await db.guarantees.insert_one(g.to_mongo())).inserted_id)
        o = HedgeOrder(merchant_id=maria.id, guarantee_id=gid, ticker=ticker_, count=q["contracts"], price=p,
                       fee=round(q["fee_per_contract"] * q["contracts"], 2), mode="mock", note="Seeded demo booking")
        await db.orders.insert_one(o.to_mongo())
    logger.info("Seeded demo merchants")


async def migrate():
    # One-off cleanup requested by the owner: remove the stray test merchant from any environment.
    async for doc in db.merchants.find({"name": "Diddy's Den"}):
        mid = str(doc["_id"])
        await db.guarantees.delete_many({"merchant_id": mid})
        await db.orders.delete_many({"merchant_id": mid})
        await db.merchants.delete_one({"_id": doc["_id"]})
    # Older merchants predate brands: each becomes its own brand.
    async for doc in db.merchants.find({"brand": {"$in": [None, ""]}}):
        await db.merchants.update_one({"_id": doc["_id"]}, {"$set": {"brand": doc["name"]}})
