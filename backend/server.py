import asyncio
import logging
import math
import os
import uuid
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Literal

from dotenv import load_dotenv

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

from fastapi import APIRouter, FastAPI, HTTPException  # noqa: E402
from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402
from pydantic import BaseModel, Field  # noqa: E402
from starlette.middleware.cors import CORSMiddleware  # noqa: E402

import kalshi  # noqa: E402

client = AsyncIOMotorClient(os.environ["MONGO_URL"])
db = client[os.environ["DB_NAME"]]
app = FastAPI()
api = APIRouter(prefix="/api")
log = logging.getLogger("rainsure")

TICKER_CITIES = ["Chicago", "Miami", "New York City", "Austin", "Seattle"]
BUSINESS_TYPES = ["patio_restaurant", "food_truck", "outdoor_event", "boat_tour", "car_wash", "mini_golf"]
NO_ID = {"_id": 0}


class MerchantIn(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    type: Literal["patio_restaurant", "food_truck", "outdoor_event", "boat_tour", "car_wash", "mini_golf"]
    city: str = Field(min_length=2, max_length=60)
    avg_booking: float = Field(gt=0, le=10000)


class GuaranteeIn(BaseModel):
    merchant_id: str
    product: Literal["daily", "weekend"]
    date: date
    customer_name: str = Field(min_length=1, max_length=80)
    booking_value: float = Field(gt=0, le=10000)
    accept_thin_depth: bool = False


def product_label(product: str, d: date) -> str:
    if product == "weekend":
        return f"Weekend {d.strftime('%b %-d')}–{(d + timedelta(days=1)).strftime('%-d')}"
    return d.strftime("%a %b %-d")


def price_for(p: float, booking: float) -> dict:
    fee = 0.07 * p * (1 - p)
    return {
        "p": p,
        "fee_per_contract": round(fee, 4),
        "price": max(1.0, round(booking * (p + fee) * 1.20, 2)),
        "contracts": math.ceil(booking),
    }


async def build_quote(city: str, product: str, d: date, booking: float) -> dict:
    q = {"city": city, "product": product, "date": d.isoformat(), "label": product_label(product, d),
         "event_ticker": kalshi.event_ticker(product, d), "booking_value": booking,
         "available": False, "reason": None, "ticker": None, "rules_primary": None}
    m = await kalshi.find_market(product, d, city)
    if m is None:
        q["reason"] = "Opens Monday" if product == "weekend" else "Not listed yet"
        return q
    q.update(ticker=m["ticker"], rules_primary=m.get("rules_primary"), status=m.get("status"),
             volume=float(m.get("volume_fp") or 0), open_interest=float(m.get("open_interest_fp") or 0),
             yes_bid=float(m.get("yes_bid_dollars") or 0), last_price=float(m.get("last_price_dollars") or 0))
    p = float(m.get("yes_ask_dollars") or 0)
    q.update(price_for(p, booking))
    if m.get("status") != "active":
        q["reason"] = "Market closed"
        return q
    if p > 0.60:
        q["reason"] = "High rain chance — refund not offered"
        return q
    if p <= 0:
        q["reason"] = "No sellers right now"
        return q
    book = await kalshi.orderbook(m["ticker"])
    depth = kalshi.size_at_or_below(book["asks"], p + 0.03)
    q.update(available=True, depth_available=round(depth, 2), depth_ok=depth >= q["contracts"],
             max_price=round(min(0.99, p + 0.03), 2))
    return q


def checkout_dates(today: date):
    sat = kalshi.weekend_saturday(today)
    days = [("daily", today + timedelta(days=i)) for i in range(3)]
    return days + [("weekend", sat), ("weekend", sat + timedelta(days=7))]


async def get_merchant(mid: str) -> dict:
    m = await db.merchants.find_one({"id": mid}, NO_ID)
    if not m:
        raise HTTPException(404, "Merchant not found")
    return m


async def record_guarantee(merchant: dict, q: dict, customer: str, fill: dict, seed: bool = False) -> dict:
    gid = str(uuid.uuid4())
    now = kalshi.now_utc().isoformat()
    cost = round(q["contracts"] * (fill["fill_price"] + q["fee_per_contract"]), 2)
    g = {"id": gid, "merchant_id": merchant["id"], "customer_name": customer, "product": q["product"],
         "date": q["date"], "label": q["label"], "ticker": q["ticker"], "city": q["city"],
         "booking_value": q["booking_value"], "price_paid": q["price"], "p": q["p"],
         "fee_per_contract": q["fee_per_contract"], "contracts": q["contracts"], "hedge_cost": cost,
         "status": "active", "rules_primary": q["rules_primary"], "created_at": now, "settled_at": None}
    o = {"id": str(uuid.uuid4()), "merchant_id": merchant["id"], "guarantee_id": gid, "ticker": q["ticker"],
         "side": "yes", "action": "buy", "count": q["contracts"], "fill_price": fill["fill_price"],
         "fee_total": round(q["contracts"] * q["fee_per_contract"], 2), "cost": cost,
         "mode": "seed" if seed else fill["mode"], "status": fill["status"],
         "kalshi_order_id": fill["kalshi_order_id"], "client_order_id": fill["client_order_id"], "created_at": now}
    await db.guarantees.insert_one(dict(g))
    await db.orders.insert_one(dict(o))
    return {"guarantee": g, "order": o}


async def settle_open_guarantees():
    tickers = await db.guarantees.distinct("ticker", {"status": "active"})
    for t in tickers:
        m = await kalshi.market(t)
        result = (m or {}).get("result")
        if result in ("yes", "no"):
            await db.guarantees.update_many(
                {"ticker": t, "status": "active"},
                {"$set": {"status": "refunded" if result == "yes" else "expired",
                          "settled_at": kalshi.now_utc().isoformat()}})


@api.get("/config")
async def config():
    return {"trading_mode": kalshi.trading_mode(), "exchange": "Kalshi production",
            "business_types": BUSINESS_TYPES}


@api.get("/cities")
async def cities():
    today = date.today()
    for product, d in [("weekend", kalshi.weekend_saturday(today)), ("daily", today),
                       ("weekend", kalshi.weekend_saturday(today) - timedelta(days=7))]:
        ms = await kalshi.event_markets(product, d)
        if ms:
            return sorted({m["yes_sub_title"] for m in ms if m.get("yes_sub_title")})
    raise HTTPException(503, "Kalshi city list unavailable")


@api.get("/ticker")
async def ticker():
    today = date.today()
    sat = kalshi.weekend_saturday(today)
    wk = await kalshi.event_markets("weekend", sat) or []
    dy = await kalshi.event_markets("daily", today) or []
    out = []
    for c in TICKER_CITIES:
        w = next((m for m in wk if m.get("yes_sub_title") == c), None)
        d = next((m for m in dy if m.get("yes_sub_title") == c), None)
        out.append({"city": c,
                    "weekend": float(w["yes_ask_dollars"]) if w else None,
                    "weekend_status": w.get("status") if w else None,
                    "today": float(d["yes_ask_dollars"]) if d else None,
                    "today_status": d.get("status") if d else None})
    return {"weekend_label": product_label("weekend", sat), "cities": out}


@api.get("/quote")
async def quote(city: str, product: Literal["daily", "weekend"], date: date, booking_value: float):
    return await build_quote(city, product, date, booking_value)


@api.get("/checkout/options")
async def checkout_options(merchant_id: str, booking_value: float | None = None):
    m = await get_merchant(merchant_id)
    bv = booking_value or m["avg_booking"]
    opts = await asyncio.gather(*[build_quote(m["city"], p, d, bv) for p, d in checkout_dates(date.today())])
    return {"merchant": m, "options": opts}


@api.get("/orderbook/{ticker}")
async def orderbook(ticker: str):
    book = await kalshi.orderbook(ticker)
    return {"ticker": ticker, "asks": book["asks"][:12], "bids": book["bids"][:12]}


@api.get("/merchants")
async def list_merchants():
    return await db.merchants.find({}, NO_ID).sort("created_at", 1).to_list(200)


@api.post("/merchants")
async def create_merchant(body: MerchantIn):
    if body.city not in await cities():
        raise HTTPException(400, "City is not in the Kalshi rain market list")
    m = {"id": str(uuid.uuid4()), **body.model_dump(), "created_at": kalshi.now_utc().isoformat()}
    await db.merchants.insert_one(dict(m))
    return m


@api.post("/guarantees")
async def create_guarantee(body: GuaranteeIn):
    merchant = await get_merchant(body.merchant_id)
    q = await build_quote(merchant["city"], body.product, body.date, body.booking_value)
    if not q["available"]:
        raise HTTPException(409, q["reason"])
    if not q["depth_ok"] and not body.accept_thin_depth:
        raise HTTPException(409, f"Only {q['depth_available']:.0f} contracts available at ≤ ${q['max_price']:.2f}")
    try:
        fill = await kalshi.place_yes_order(q["ticker"], q["contracts"], q["p"], q["max_price"])
    except Exception as e:
        log.exception("hedge order failed")
        raise HTTPException(502, f"Hedge order failed, refund not sold: {e}")
    return await record_guarantee(merchant, q, body.customer_name, fill)


def summarize(gs: list) -> dict:
    s = {"count": len(gs), "premium": 0.0, "refunds": 0.0, "contracts": 0, "hedge_cost": 0.0}
    for g in gs:
        s["premium"] += g["price_paid"]
        s["refunds"] += g["booking_value"]
        s["contracts"] += g["contracts"]
        s["hedge_cost"] += g["hedge_cost"]
    return {k: round(v, 2) for k, v in s.items()}


@api.get("/merchants/{mid}/dashboard")
async def dashboard(mid: str):
    m = await get_merchant(mid)
    await settle_open_guarantees()
    gs = await db.guarantees.find({"merchant_id": mid}, NO_ID).sort("created_at", -1).to_list(2000)
    orders = await db.orders.find({"merchant_id": mid}, NO_ID).sort("created_at", -1).to_list(100)
    active = [g for g in gs if g["status"] == "active"]
    settled = [g for g in gs if g["status"] != "active"]
    a, all_s = summarize(active), summarize(gs)
    refunded = [g for g in settled if g["status"] == "refunded"]
    rs = summarize(settled)
    realized = rs["premium"] - rs["hedge_cost"] + sum(g["contracts"] - g["booking_value"] for g in refunded)
    live = await build_quote(m["city"], "weekend", kalshi.weekend_saturday(date.today()), m["avg_booking"])
    return {
        "merchant": m, "trading_mode": kalshi.trading_mode(),
        "kpis": {"guarantees_sold": all_s["count"], "refunds_promised": a["refunds"],
                 "contracts_held": a["contracts"], "hedge_cost": all_s["hedge_cost"], "premium": all_s["premium"],
                 "active": a["count"], "refunded": len(refunded), "expired": len(settled) - len(refunded)},
        "pnl": {"rain": round(a["premium"] - a["refunds"] + a["contracts"] - a["hedge_cost"], 2),
                "dry": round(a["premium"] - a["hedge_cost"], 2), "active": a,
                "realized": round(realized, 2)},
        "live": live, "guarantees": gs[:50], "orders": orders,
    }


@api.get("/replay/markets")
async def replay_markets(city: str):
    out = []
    for series in ["KXRAINWKND", "KXRAIN"]:
        data = await kalshi.get("/markets", {"series_ticker": series, "status": "settled", "limit": 1000}, ttl=600)
        for mk in (data or {}).get("markets", []):
            if mk.get("yes_sub_title") == city and mk.get("result") in ("yes", "no"):
                out.append({"ticker": mk["ticker"], "result": mk["result"], "title": mk.get("title"),
                            "product": "weekend" if series == "KXRAINWKND" else "daily",
                            "settled": mk.get("settlement_ts") or mk.get("close_time")})
    out.sort(key=lambda x: (x["product"] != "weekend", x["settled"] or ""), reverse=False)
    wk = sorted([x for x in out if x["product"] == "weekend"], key=lambda x: x["settled"] or "", reverse=True)
    dy = sorted([x for x in out if x["product"] == "daily"], key=lambda x: x["settled"] or "", reverse=True)
    return {"city": city, "markets": (wk + dy)[:60]}


@api.get("/replay/{ticker}")
async def replay(ticker: str, bookings: int = 40, booking_value: float = 45):
    mk = await kalshi.market(ticker, ttl=600)
    if not mk or mk.get("result") not in ("yes", "no"):
        raise HTTPException(404, "Settled market not found")
    p = await kalshi.historical_price(mk)
    pr = price_for(p, booking_value)
    premium = round(bookings * pr["price"], 2)
    hedge = round(bookings * pr["contracts"] * (p + pr["fee_per_contract"]), 2)
    rained = mk["result"] == "yes"
    refunds = round(bookings * booking_value, 2) if rained else 0.0
    payout = float(bookings * pr["contracts"]) if rained else 0.0
    return {"ticker": ticker, "title": mk.get("title"), "result": mk["result"], "rules_primary": mk.get("rules_primary"),
            "city": mk.get("yes_sub_title"), "p": p, **pr, "bookings": bookings, "booking_value": booking_value,
            "premium": premium, "hedge_cost": hedge, "refunds": refunds, "hedge_payout": payout,
            "net": round(premium - hedge + payout - refunds, 2), "settled": mk.get("settlement_ts")}


CUSTOMERS = ["Ana R.", "Ben T.", "Chloe M.", "Dev P.", "Elena G.", "Femi O.", "Grace L.", "Hiro K.", "Isla W.",
             "Jamal B.", "Kira S.", "Luis F.", "Maya D.", "Noah C.", "Omar H.", "Priya N.", "Quinn A.", "Rosa V.",
             "Sam E.", "Tara J."]


async def seed():
    if await db.merchants.count_documents({}):
        return
    today = date.today()
    maria = {"id": str(uuid.uuid4()), "name": "Maria's Patio Taqueria", "type": "patio_restaurant",
             "city": "Chicago", "avg_booking": 45.0, "created_at": kalshi.now_utc().isoformat()}
    bay = {"id": str(uuid.uuid4()), "name": "Bayfront Boat Tours", "type": "boat_tour",
           "city": "Miami", "avg_booking": 85.0, "created_at": kalshi.now_utc().isoformat()}
    await db.merchants.insert_many([dict(maria), dict(bay)])
    q = await build_quote("Chicago", "weekend", kalshi.weekend_saturday(today), 45.0)
    if not q.get("ticker"):
        q = await build_quote("Chicago", "weekend", kalshi.weekend_saturday(today) - timedelta(days=7), 45.0)
    if q.get("ticker") and q.get("p"):
        for i in range(40):
            fill = {"mode": "seed", "status": "filled", "fill_price": q["p"],
                    "kalshi_order_id": f"SEED-{i + 1:03d}", "client_order_id": str(uuid.uuid4())}
            await record_guarantee(maria, q, CUSTOMERS[i % 20] + ("" if i < 20 else " (2)"), fill, seed=True)
    hist = await replay_markets("Miami")
    yes_wk, mk, p = None, None, None
    for x in [x for x in hist["markets"] if x["result"] == "yes" and x["product"] == "weekend"][:8]:
        cand = await kalshi.market(x["ticker"])
        cp = await kalshi.historical_price(cand)
        if cp <= 0.60:
            yes_wk, mk, p = x, cand, cp
            break
    if yes_wk:
        sat = datetime.strptime(yes_wk["ticker"].split("-")[1], "%y%b%d").date()
        hq = {"product": "weekend", "date": sat.isoformat(), "label": product_label("weekend", sat),
              "ticker": mk["ticker"], "city": "Miami", "booking_value": 85.0,
              "rules_primary": mk.get("rules_primary"), **price_for(p, 85.0)}
        for i in range(12):
            fill = {"mode": "seed", "status": "filled", "fill_price": p,
                    "kalshi_order_id": f"SEED-M{i + 1:03d}", "client_order_id": str(uuid.uuid4())}
            await record_guarantee(bay, hq, CUSTOMERS[(i + 5) % 20], fill, seed=True)
    await settle_open_guarantees()


async def settlement_loop():
    while True:
        try:
            await settle_open_guarantees()
        except Exception:
            log.exception("settlement check failed")
        await asyncio.sleep(600)


@app.on_event("startup")
async def startup():
    try:
        await seed()
    except Exception:
        log.exception("seed failed")
    asyncio.create_task(settlement_loop())


@app.on_event("shutdown")
async def shutdown():
    client.close()


app.include_router(api)
app.add_middleware(CORSMiddleware, allow_credentials=True,
                   allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
                   allow_methods=["*"], allow_headers=["*"])
