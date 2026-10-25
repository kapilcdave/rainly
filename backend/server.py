from fastapi import FastAPI, APIRouter, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import math
import time
import base64
import random
import logging
import asyncio
from pathlib import Path
from typing import Annotated, Any, Optional, List
from datetime import datetime, timezone, date, timedelta
from zoneinfo import ZoneInfo

import httpx
from bson import ObjectId
from pydantic import BaseModel, BeforeValidator, Field, ConfigDict
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

from emailer import EMAIL_RE, refund_email, send_email  # noqa: E402  (needs env loaded)

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

KALSHI_PUBLIC = os.environ['KALSHI_PUBLIC_BASE'].rstrip('/')
KALSHI_DEMO = os.environ['KALSHI_DEMO_BASE'].rstrip('/')
MOCK_TRADING = os.environ.get('MOCK_TRADING', 'true').lower() == 'true'
KALSHI_ACCESS_KEY = os.environ.get('KALSHI_ACCESS_KEY', '')
KALSHI_PRIVATE_KEY_PEM = os.environ.get('KALSHI_PRIVATE_KEY_PEM', '')

MAX_P = 0.60
DEPTH_SLIPPAGE = 0.03
TICKER_CITIES = ["Chicago", "New York City", "Miami", "Seattle", "Austin"]
BUSINESS_TYPES = ["patio_restaurant", "food_truck", "outdoor_event", "boat_tour", "car_wash", "mini_golf"]
ET = ZoneInfo("America/New_York")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("rainly")

app = FastAPI()


@app.get("/health", include_in_schema=False)
@app.head("/health", include_in_schema=False)
async def health():
    return {"status": "ok"}


api_router = APIRouter(prefix="/api")


# ---------------------------------------------------------------- Mongo models
PyObjectId = Annotated[str, BeforeValidator(lambda v: str(v) if isinstance(v, ObjectId) else v)]


class BaseDocument(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    id: Optional[PyObjectId] = Field(default=None, alias="_id")

    @classmethod
    def from_mongo(cls, doc: dict):
        return cls.model_validate(doc)

    def to_mongo(self) -> dict:
        data = self.model_dump(by_alias=True, exclude={"id"})
        data.pop("_id", None)
        return data


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class Merchant(BaseDocument):
    name: str
    business_type: str
    city: str
    avg_booking: float
    margin_pct: float = 20.0
    created_at: str = Field(default_factory=now_iso)


class Guarantee(BaseDocument):
    merchant_id: str
    customer_name: str
    booking_value: float
    kind: str
    date: str
    event_ticker: str
    ticker: str
    p: float
    fee_per_contract: float
    contracts: int
    hedge_cost: float
    price: float
    status: str = "active"  # active | refunded | expired
    depth_warning: bool = False
    customer_email: Optional[str] = None
    refund_email_status: Optional[str] = None  # sent | no_email | failed:<code>
    refund_email_at: Optional[str] = None
    refund_email_attempts: int = 0
    created_at: str = Field(default_factory=now_iso)


class HedgeOrder(BaseDocument):
    merchant_id: str
    guarantee_id: Optional[str] = None
    ticker: str
    side: str = "yes"
    action: str = "buy"
    count: int
    price: float
    fee: float
    mode: str  # mock | kalshi_demo
    status: str = "filled"
    kalshi_order_id: Optional[str] = None
    note: Optional[str] = None
    created_at: str = Field(default_factory=now_iso)


class MerchantCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    business_type: str
    city: str
    avg_booking: float = Field(gt=0, le=10000)
    margin_pct: float = Field(default=20.0, ge=0, le=100)


class GuaranteeCreate(BaseModel):
    merchant_id: str
    customer_name: str = Field(default="Guest", max_length=80)
    customer_email: Optional[str] = Field(default=None, max_length=200)
    booking_value: float = Field(gt=0, le=10000)
    kind: str = "weekend"
    date: Optional[str] = None


# ---------------------------------------------------------------- Kalshi public data
_cache: dict[str, tuple[float, Any]] = {}
_http = httpx.AsyncClient(timeout=15)


async def kget(path: str, params: Optional[dict] = None, ttl: int = 15):
    key = path + str(sorted((params or {}).items()))
    hit = _cache.get(key)
    if hit and time.time() - hit[0] < ttl:
        return hit[1]
    try:
        r = await _http.get(KALSHI_PUBLIC + path, params=params)
        if r.status_code == 404:
            data = None
        else:
            r.raise_for_status()
            data = r.json()
    except Exception as e:
        logger.warning("Kalshi fetch failed %s: %s", path, e)
        if hit:
            return hit[1]  # serve stale data rather than failing
        raise HTTPException(502, "Live Kalshi data unavailable — try again shortly")
    _cache[key] = (time.time(), data)
    return data


def today_et() -> date:
    return datetime.now(ET).date()


def code(d: date) -> str:
    return d.strftime('%y%b%d').upper()


def weekend_saturday(d: date) -> date:
    wd = d.weekday()
    if wd == 5:
        return d
    if wd == 6:
        return d - timedelta(days=1)
    return d + timedelta(days=5 - wd)


def event_ticker(kind: str, d: date) -> str:
    return f"KXRAINWKND-{code(d)}" if kind == "weekend" else f"KXRAIN-{code(d)}"


def parse_code(s: str) -> Optional[date]:
    try:
        return datetime.strptime(s, '%y%b%d').date()
    except ValueError:
        return None


def wk_label(sat: date) -> str:
    sun = sat + timedelta(days=1)
    end = sun.strftime('%-d') if sun.month == sat.month else sun.strftime('%b %-d')
    return f"Weekend {sat.strftime('%b %-d')}–{end}"


def parse_day(s: Optional[str]) -> Optional[date]:
    if not s:
        return None
    try:
        return date.fromisoformat(s)
    except ValueError:
        raise HTTPException(400, "Invalid date, use YYYY-MM-DD")


def check_kind(kind: str):
    if kind not in ("weekend", "daily"):
        raise HTTPException(400, "kind must be 'weekend' or 'daily'")


def date_options() -> list[dict]:
    t = today_et()
    sat = weekend_saturday(t)
    nxt = sat + timedelta(days=7)
    tom = t + timedelta(days=1)
    return [
        {"kind": "weekend", "date": sat.isoformat(), "label": wk_label(sat)},
        {"kind": "weekend", "date": nxt.isoformat(), "label": wk_label(nxt)},
        {"kind": "daily", "date": t.isoformat(), "label": f"Today {t.strftime('%b %-d')}"},
        {"kind": "daily", "date": tom.isoformat(), "label": f"Tomorrow {tom.strftime('%b %-d')}"},
    ]


async def get_event_markets(kind: str, d: date) -> Optional[list]:
    data = await kget(f"/events/{event_ticker(kind, d)}", {"with_nested_markets": "true"})
    if not data:
        return None
    return data.get("markets") or (data.get("event") or {}).get("markets") or []


def find_market(markets: list, city: str) -> Optional[dict]:
    for m in markets:
        if (m.get("yes_sub_title") or "").strip().lower() == city.strip().lower():
            return m
    return None


def f(v) -> float:
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0.0


async def orderbook(ticker: str) -> dict:
    data = await kget(f"/markets/{ticker}/orderbook", ttl=10) or {}
    ob = data.get("orderbook_fp") or {}
    yes_bids = [(f(p), f(s)) for p, s in (ob.get("yes_dollars") or [])]
    no_bids = [(f(p), f(s)) for p, s in (ob.get("no_dollars") or [])]
    # YES asks come from NO bids: ask = 1 - no_bid. Best NO bid is last.
    asks = sorted([(round(1 - p, 2), s) for p, s in no_bids if s > 0], key=lambda x: x[0])
    bids = sorted([b for b in yes_bids if b[1] > 0], key=lambda x: -x[0])
    return {"asks": asks, "bids": bids}


def price_quote(p: float, booking_value: float, margin_pct: float) -> dict:
    fee = 0.07 * p * (1 - p)
    contracts = math.ceil(booking_value)
    hedge_cost = contracts * (p + fee)
    price = max(1.0, hedge_cost * (1 + margin_pct / 100))
    return {
        "p": round(p, 4),
        "fee_per_contract": round(fee, 4),
        "contracts": contracts,
        "hedge_cost": round(hedge_cost, 2),
        "price": round(price, 2),
    }


async def build_quote(city: str, kind: str, d: date, booking_value: float, margin_pct: float) -> dict:
    et = event_ticker(kind, d)
    base = {"city": city, "kind": kind, "date": d.isoformat(), "event_ticker": et, "available": False,
            "booking_value": booking_value, "margin_pct": margin_pct}
    markets = await get_event_markets(kind, d)
    if markets is None:
        return {**base, "reason": "Opens Monday" if kind == "weekend" else "Opens ~1 day ahead"}
    m = find_market(markets, city)
    if not m:
        return {**base, "reason": f"{city} not listed for this date"}
    p = f(m.get("yes_ask_dollars"))
    info = {
        **base,
        "ticker": m["ticker"],
        "title": m.get("title"),
        "rules_primary": m.get("rules_primary"),
        "status": m.get("status"),
        "result": m.get("result") or None,
        "yes_ask": p,
        "yes_bid": f(m.get("yes_bid_dollars")),
        "last_price": f(m.get("last_price_dollars")),
        "volume": f(m.get("volume_fp")),
        "open_interest": f(m.get("open_interest_fp")),
        "close_time": m.get("close_time"),
    }
    if m.get("status") not in ("active", "open"):
        return {**info, "reason": "Rain already recorded — closed" if m.get("result") == "yes" else "Market closed"}
    if p <= 0 or p >= 1:
        return {**info, "reason": "No sellers right now"}
    if p > MAX_P:
        return {**info, "reason": "High rain risk — not offered"}
    q = price_quote(p, booking_value, margin_pct)
    ob = await orderbook(m["ticker"])
    limit = p + DEPTH_SLIPPAGE + 1e-9
    depth = sum(s for a, s in ob["asks"] if a <= limit)
    return {**info, **q, "available": True, "depth_within_3c": round(depth, 2),
            "depth_ok": depth >= q["contracts"], "reason": None}


# ---------------------------------------------------------------- Order placement
def _signed_headers(method: str, path: str) -> dict:
    ts = str(int(time.time() * 1000))
    key = serialization.load_pem_private_key(KALSHI_PRIVATE_KEY_PEM.replace("\\n", "\n").encode(), password=None)
    msg = f"{ts}{method.upper()}{path.split('?')[0]}".encode()
    if isinstance(key, Ed25519PrivateKey):
        sig = key.sign(msg)  # Ed25519 (RFC 8032), no padding
    else:
        sig = key.sign(msg, padding.PSS(mgf=padding.MGF1(hashes.SHA256()), salt_length=padding.PSS.DIGEST_LENGTH),
                       hashes.SHA256())
    return {"KALSHI-ACCESS-KEY": KALSHI_ACCESS_KEY, "KALSHI-ACCESS-TIMESTAMP": ts,
            "KALSHI-ACCESS-SIGNATURE": base64.b64encode(sig).decode(), "Content-Type": "application/json"}


def trading_mode() -> str:
    return "mock" if MOCK_TRADING or not (KALSHI_ACCESS_KEY and KALSHI_PRIVATE_KEY_PEM) else "kalshi_demo"


async def place_hedge(merchant_id: str, guarantee_id: Optional[str], ticker: str, count: int, p: float, fee: float) -> HedgeOrder:
    order = HedgeOrder(merchant_id=merchant_id, guarantee_id=guarantee_id, ticker=ticker, count=count,
                       price=p, fee=round(fee * count, 2), mode="mock")
    if trading_mode() == "kalshi_demo":
        path = "/portfolio/orders"
        signed_path = "/trade-api/v2" + path
        cid = f"rainly-{guarantee_id or ObjectId()}"
        payload = {"ticker": ticker, "side": "yes", "action": "buy", "count": count, "type": "limit",
                   "yes_price": min(99, max(1, math.ceil(round((p + DEPTH_SLIPPAGE) * 100, 4)))),
                   "client_order_id": cid}
        try:
            r = await _http.post(KALSHI_DEMO + path, headers=_signed_headers("POST", signed_path), json=payload)
            if r.status_code in (200, 201):
                o = r.json().get("order", {})
                order.mode = "kalshi_demo"
                order.kalshi_order_id = o.get("order_id")
                order.status = o.get("status") or "submitted"
            else:
                order.note = f"Demo rejected ({r.status_code}); simulated fill at live ask"
                logger.warning("Kalshi demo order rejected %s %s", r.status_code, r.text[:300])
        except Exception as e:  # network / key errors → simulated fill so the demo never breaks
            order.note = "Demo unreachable; simulated fill at live ask"
            logger.warning("Kalshi demo order failed: %s", e)
    res = await db.orders.insert_one(order.to_mongo())
    order.id = str(res.inserted_id)
    return order


# ---------------------------------------------------------------- Settlement
async def settle_guarantees(merchant_id: Optional[str]):
    q = {"status": "active"}
    if merchant_id:
        q["merchant_id"] = merchant_id
    tickers = await db.guarantees.distinct("ticker", q)
    for t in tickers:
        data = await kget(f"/markets/{t}", ttl=60)
        m = (data or {}).get("market") or {}
        if m.get("result") == "yes":
            base = {"ticker": t, "status": "active"}
            await db.guarantees.update_many({**base, "customer_email": {"$in": [None, ""]}},
                                            {"$set": {"status": "refunded", "settled_at": now_iso(), "refund_email_status": "no_email"}})
            await db.guarantees.update_many(base, {"$set": {"status": "refunded", "settled_at": now_iso(), "refund_email_status": "pending"}})
        elif m.get("result") == "no":
            await db.guarantees.update_many({"ticker": t, "status": "active"}, {"$set": {"status": "expired", "settled_at": now_iso()}})
    asyncio.create_task(send_pending_alerts())


MAX_EMAIL_ATTEMPTS = 3
_sending = asyncio.Lock()


async def send_pending_alerts():
    """Send refund emails for refunded guarantees that haven't been emailed yet (retries failures)."""
    if _sending.locked():
        return
    async with _sending:
        q = {"status": "refunded", "customer_email": {"$nin": [None, ""]},
             "refund_email_status": {"$nin": ["sent", "no_email", "gave_up"]},
             "refund_email_attempts": {"$not": {"$gte": MAX_EMAIL_ATTEMPTS}}}
        while True:
            # Claim atomically so a refund email is never sent twice.
            doc = await db.guarantees.find_one_and_update(
                q, {"$set": {"refund_email_status": "sending"}, "$inc": {"refund_email_attempts": 1}})
            if not doc:
                break
            g = Guarantee.from_mongo(doc)
            try:
                data = await kget(f"/markets/{g.ticker}", ttl=3600)
                await send_refund_alert(g, (data or {}).get("market") or {})
            except Exception as e:
                logger.warning("refund alert failed for %s: %s", g.id, e)
                await db.guarantees.update_one({"_id": ObjectId(g.id)}, {"$set": {"refund_email_status": "failed:error"}})
            if doc.get("refund_email_attempts", 0) + 1 >= MAX_EMAIL_ATTEMPTS:
                await db.guarantees.update_one({"_id": ObjectId(g.id), "refund_email_status": {"$ne": "sent"}},
                                               {"$set": {"refund_email_status": "gave_up"}})
            fresh = await db.guarantees.find_one({"_id": ObjectId(g.id)}, {"refund_email_status": 1})
            if (fresh or {}).get("refund_email_status") != "sent":
                break  # back off: remaining/failed sends retry on the next 5-minute settlement pass
            await asyncio.sleep(0.6)  # stay under the email rate limit


async def send_refund_alert(g: Guarantee, market: dict):
    mdoc = await db.merchants.find_one({"_id": ObjectId(g.merchant_id)})
    merchant = Merchant.from_mongo(mdoc) if mdoc else None
    d = date.fromisoformat(g.date)
    label = f"the weekend of {d.strftime('%b %-d')}" if g.kind == "weekend" else d.strftime('%A, %b %-d')
    subject, html = refund_email(
        customer_name=g.customer_name or "there", merchant_name=merchant.name if merchant else "your booking",
        city=merchant.city if merchant else (market.get("yes_sub_title") or ""), date_label=label,
        amount=f"${g.booking_value:,.2f}", rules=market.get("rules_primary") or "", ticker=g.ticker)
    update = {"refund_email_at": now_iso()}
    try:
        update["refund_email_id"] = await send_email(to=g.customer_email, subject=subject, html=html)
        update["refund_email_status"] = "sent"
    except (RuntimeError, ValueError) as e:
        update["refund_email_status"] = f"failed:{e}"
    await db.guarantees.update_one({"_id": ObjectId(g.id)}, {"$set": update})


async def settlement_loop():
    while True:
        try:
            await settle_guarantees(None)
        except Exception as e:
            logger.warning("settlement loop error: %s", e)
        await asyncio.sleep(300)


# ---------------------------------------------------------------- Routes
@api_router.get("/")
async def root():
    return {"app": "Rainly", "mode": trading_mode()}


@api_router.get("/meta")
async def meta():
    return {"mode": trading_mode(), "mock_trading": MOCK_TRADING, "max_p": MAX_P,
            "business_types": BUSINESS_TYPES, "date_options": date_options()}


@api_router.get("/cities")
async def cities():
    t = today_et()
    markets = await get_event_markets("weekend", weekend_saturday(t)) or await get_event_markets("daily", t) or []
    names = sorted({m.get("yes_sub_title") for m in markets if m.get("yes_sub_title")})
    return {"cities": names}


@api_router.get("/ticker")
async def ticker():
    sat = weekend_saturday(today_et())
    markets = await get_event_markets("weekend", sat)
    out = []
    for c in TICKER_CITIES:
        m = find_market(markets or [], c)
        prev = f(m.get("previous_yes_ask_dollars")) if m else 0
        p_now = f(m.get("yes_ask_dollars")) if m else 0
        out.append({"city": c, "p": p_now if m else None,
                    "change": round((p_now - prev) * 100) if m and prev > 0 else None,  # points vs ~24h ago
                    "last": f(m.get("last_price_dollars")) if m else None,
                    "ticker": m.get("ticker") if m else None, "status": m.get("status") if m else None})
    return {"event_ticker": event_ticker("weekend", sat), "weekend_of": sat.isoformat(), "listed": markets is not None, "cities": out}


@api_router.get("/quote")
async def quote(city: str, booking_value: float, kind: str = "weekend", date_str: Optional[str] = None, margin_pct: float = 20.0):
    check_kind(kind)
    if not (0 < booking_value <= 10000):
        raise HTTPException(400, "booking_value must be between 0 and 10000")
    if not (0 <= margin_pct <= 100):
        raise HTTPException(400, "margin_pct must be between 0 and 100")
    d = parse_day(date_str) or weekend_saturday(today_et())
    return await build_quote(city, kind, d, booking_value, margin_pct)


async def merchant_or_404(mid: str) -> Merchant:
    if not ObjectId.is_valid(mid):
        raise HTTPException(404, "Merchant not found")
    doc = await db.merchants.find_one({"_id": ObjectId(mid)})
    if not doc:
        raise HTTPException(404, "Merchant not found")
    return Merchant.from_mongo(doc)


@api_router.get("/merchants")
async def list_merchants():
    out = []
    async for doc in db.merchants.find().sort("created_at", 1):
        m = Merchant.from_mongo(doc)
        n = await db.guarantees.count_documents({"merchant_id": m.id})
        out.append({**m.model_dump(), "guarantees": n})
    return out


@api_router.post("/merchants")
async def create_merchant(body: MerchantCreate):
    if body.business_type not in BUSINESS_TYPES:
        raise HTTPException(400, "Unknown business type")
    m = Merchant(**body.model_dump())
    res = await db.merchants.insert_one(m.to_mongo())
    m.id = str(res.inserted_id)
    return m.model_dump()


@api_router.get("/merchants/{mid}")
async def get_merchant(mid: str):
    return (await merchant_or_404(mid)).model_dump()


@api_router.post("/guarantees")
async def create_guarantee(body: GuaranteeCreate):
    m = await merchant_or_404(body.merchant_id)
    check_kind(body.kind)
    email = (body.customer_email or "").strip() or None
    if email and not EMAIL_RE.match(email):
        raise HTTPException(400, "Enter a valid email address")
    d = parse_day(body.date) or weekend_saturday(today_et())
    q = await build_quote(m.city, body.kind, d, body.booking_value, m.margin_pct)
    if not q["available"]:
        raise HTTPException(400, q.get("reason") or "Not available")
    g = Guarantee(merchant_id=m.id, customer_name=body.customer_name or "Guest", booking_value=body.booking_value,
                  kind=body.kind, date=d.isoformat(), event_ticker=q["event_ticker"], ticker=q["ticker"], p=q["p"],
                  fee_per_contract=q["fee_per_contract"], contracts=q["contracts"], hedge_cost=q["hedge_cost"],
                  price=q["price"], depth_warning=not q["depth_ok"], customer_email=email)
    res = await db.guarantees.insert_one(g.to_mongo())
    g.id = str(res.inserted_id)
    order = await place_hedge(m.id, g.id, q["ticker"], q["contracts"], q["p"], q["fee_per_contract"])
    return {"guarantee": g.model_dump(), "order": order.model_dump(), "quote": q}


@api_router.get("/merchants/{mid}/dashboard")
async def dashboard(mid: str):
    m = await merchant_or_404(mid)
    await settle_guarantees(m.id)
    gs = [Guarantee.from_mongo(d) async for d in db.guarantees.find({"merchant_id": m.id})]
    active = [g for g in gs if g.status == "active"]
    premiums = sum(g.price for g in active)
    hedge = sum(g.hedge_cost for g in active)
    contracts = sum(g.contracts for g in active)
    liability = sum(g.booking_value for g in active)
    orders = [HedgeOrder.from_mongo(d).model_dump() async for d in db.orders.find({"merchant_id": m.id}).sort("created_at", -1).limit(50)]
    sat = weekend_saturday(today_et())
    live = await build_quote(m.city, "weekend", sat, m.avg_booking, m.margin_pct)
    book = await orderbook(live["ticker"]) if live.get("ticker") else {"asks": [], "bids": []}
    return {
        "merchant": m.model_dump(),
        "mode": trading_mode(),
        "stats": {
            "guarantees_sold": len(gs),
            "active": len(active),
            "refunded": sum(1 for g in gs if g.status == "refunded"),
            "expired": sum(1 for g in gs if g.status == "expired"),
            "refund_emails_sent": sum(1 for g in gs if g.refund_email_status == "sent"),
            "with_email": sum(1 for g in gs if g.customer_email),
            "contracts_held": contracts,
            "hedge_cost": round(hedge, 2),
            "premiums": round(premiums, 2),
            "refund_liability": round(liability, 2),
        },
        "pnl": {
            "if_rains": {"premiums": round(premiums, 2), "hedge_cost": round(hedge, 2), "refunds": round(liability, 2),
                         "payout": float(contracts), "net": round(premiums - hedge - liability + contracts, 2)},
            "if_dry": {"premiums": round(premiums, 2), "hedge_cost": round(hedge, 2), "refunds": 0.0,
                       "payout": 0.0, "net": round(premiums - hedge, 2)},
        },
        "live": live,
        "orderbook": {"asks": book["asks"][:8], "bids": book["bids"][:8]},
        "orders": orders,
        "recent_guarantees": [g.model_dump() for g in sorted(gs, key=lambda x: x.created_at, reverse=True)[:10]],
    }


async def settled_markets() -> list:
    key = "settled-all"
    hit = _cache.get(key)
    if hit and time.time() - hit[0] < 1800:
        return hit[1]
    out, cursor = [], None
    for _ in range(3):
        params = {"series_ticker": "KXRAIN", "status": "settled", "limit": 1000}
        if cursor:
            params["cursor"] = cursor
        data = await kget("/markets", params, ttl=1800) or {}
        out += data.get("markets") or []
        cursor = data.get("cursor")
        if not cursor:
            break
    _cache[key] = (time.time(), out)
    return out


@api_router.get("/replay")
async def replay_list(city: str):
    ms = [m for m in await settled_markets() if (m.get("yes_sub_title") or "").lower() == city.lower()]
    items = []
    for m in ms:
        d = parse_code(m["event_ticker"].split("-")[-1])
        if d and m.get("result") in ("yes", "no"):
            items.append({"ticker": m["ticker"], "date": d.isoformat(), "result": m["result"],
                          "rules_primary": m.get("rules_primary"), "expiration_value": m.get("expiration_value")})
    items.sort(key=lambda x: x["date"], reverse=True)
    items = items[:40]
    # Default each tab to the newest date Rainly would actually have sold (entry price within the cap).
    recommended = {}
    for res in ("yes", "no"):
        for it in [i for i in items if i["result"] == res][:10]:
            m = ((await kget(f"/markets/{it['ticker']}", ttl=3600)) or {}).get("market")
            entry = await entry_price(m) if m else None
            if entry is not None and entry <= MAX_P:
                recommended[res] = it["ticker"]
                break
    return {"city": city, "items": items, "recommended": recommended}


async def entry_price(m: dict) -> Optional[float]:
    """First listed YES ask from hourly candles, or None."""
    try:
        start = int(datetime.fromisoformat(m["open_time"].replace("Z", "+00:00")).timestamp())
        end = int(datetime.fromisoformat(m["close_time"].replace("Z", "+00:00")).timestamp())
        series = m["event_ticker"].split("-")[0]
        cs = await kget(f"/series/{series}/markets/{m['ticker']}/candlesticks",
                        {"start_ts": start, "end_ts": end, "period_interval": 60}, ttl=3600) or {}
        for c in cs.get("candlesticks", []):
            a = f((c.get("yes_ask") or {}).get("close_dollars"))
            if 0 < a < 1:
                return a
    except Exception as e:
        logger.warning("candlesticks failed: %s", e)
    return None


@api_router.get("/replay/detail")
async def replay_detail(ticker: str, bookings: int = 40, booking_value: float = 45, margin_pct: float = 20.0):
    data = await kget(f"/markets/{ticker}", ttl=3600)
    m = (data or {}).get("market")
    if not m:
        raise HTTPException(404, "Market not found")
    entry = await entry_price(m)
    entry_source = "first listed YES ask (hourly candle)"
    if entry is None:
        entry, entry_source = 0.20, "assumed (no price history)"
    q = price_quote(entry, booking_value, margin_pct)
    contracts = q["contracts"] * bookings
    premiums = q["price"] * bookings
    hedge = q["hedge_cost"] * bookings
    rained = m.get("result") == "yes"
    refunds = booking_value * bookings if rained else 0.0
    payout = float(contracts) if rained else 0.0
    d = parse_code(m["event_ticker"].split("-")[-1])
    return {
        "ticker": ticker, "city": m.get("yes_sub_title"), "date": d.isoformat() if d else None,
        "result": m.get("result"), "rules_primary": m.get("rules_primary"),
        "precip_inches": m.get("expiration_value"), "settled_at": m.get("settlement_ts"),
        "entry_p": entry, "entry_source": entry_source, "would_offer": entry <= MAX_P, "bookings": bookings, "booking_value": booking_value,
        "price_each": q["price"], "contracts": contracts, "premiums": round(premiums, 2), "hedge_cost": round(hedge, 2),
        "refunds": round(refunds, 2), "payout": round(payout, 2), "net": round(premiums - hedge - refunds + payout, 2),
    }


# ---------------------------------------------------------------- Seed
CUSTOMERS = ["Ana", "Ben", "Carla", "Dev", "Elena", "Femi", "Gabe", "Hana", "Ivan", "Jade", "Kofi", "Lena", "Marco",
             "Nia", "Omar", "Priya", "Quinn", "Rosa", "Sam", "Tara"]


async def seed():
    if await db.merchants.count_documents({}) > 0:
        return
    maria = Merchant(name="Maria's Patio Taqueria", business_type="patio_restaurant", city="Chicago", avg_booking=45)
    maria.id = str((await db.merchants.insert_one(maria.to_mongo())).inserted_id)
    boat = Merchant(name="Bayfront Boat Tours", business_type="boat_tour", city="Miami", avg_booking=80)
    await db.merchants.insert_one(boat.to_mongo())

    sat = weekend_saturday(today_et())
    et = event_ticker("weekend", sat)
    p, ticker_ = 0.12, f"{et}-CHI"
    try:
        m = find_market(await get_event_markets("weekend", sat) or [], "Chicago")
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


@app.on_event("startup")
async def on_startup():
    try:
        await seed()
    except Exception as e:
        logger.exception("Seed failed: %s", e)
    # One-off cleanup requested by the owner: remove the stray test merchant from any environment.
    async for doc in db.merchants.find({"name": "Diddy's Den"}):
        mid = str(doc["_id"])
        await db.guarantees.delete_many({"merchant_id": mid})
        await db.orders.delete_many({"merchant_id": mid})
        await db.merchants.delete_one({"_id": doc["_id"]})
    asyncio.create_task(settlement_loop())


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
    await _http.aclose()
