"""Merchants, brands, dashboards and revenue reports."""
from bson import ObjectId
from fastapi import APIRouter, HTTPException

from core import db, BUSINESS_TYPES, now_iso
from emailer import EMAIL_RE
from models import DeclineCreate, Guarantee, HedgeOrder, Merchant, MerchantCreate
from services.kalshi import build_quote, orderbook, sync_demo_orders, today_et, trading_mode, weekend_saturday
from services.reports import compute_report
from services.settlement import settle_guarantees

router = APIRouter()


async def merchant_or_404(mid: str) -> Merchant:
    if not ObjectId.is_valid(mid):
        raise HTTPException(404, "Merchant not found")
    doc = await db.merchants.find_one({"_id": ObjectId(mid)})
    if not doc:
        raise HTTPException(404, "Merchant not found")
    return Merchant.from_mongo(doc)


@router.get("/merchants")
async def list_merchants():
    out = []
    async for doc in db.merchants.find().sort("created_at", 1):
        m = Merchant.from_mongo(doc)
        n = await db.guarantees.count_documents({"merchant_id": m.id})
        out.append({**m.model_dump(), "guarantees": n})
    return out


@router.post("/merchants")
async def create_merchant(body: MerchantCreate):
    if body.business_type not in BUSINESS_TYPES:
        raise HTTPException(400, "Unknown business type")
    email = (body.contact_email or "").strip() or None
    if email and not EMAIL_RE.match(email):
        raise HTTPException(400, "Enter a valid email address")
    m = Merchant(**{**body.model_dump(), "contact_email": email, "brand": (body.brand or "").strip() or body.name.strip()})
    m.id = str((await db.merchants.insert_one(m.to_mongo())).inserted_id)
    return m.model_dump()


@router.get("/merchants/{mid}")
async def get_merchant(mid: str):
    return (await merchant_or_404(mid)).model_dump()


@router.get("/merchants/{mid}/report")
async def revenue_report(mid: str, weeks: int = 8):
    m = await merchant_or_404(mid)
    return {"merchant": m.model_dump(), **(await compute_report([m.id], weeks))}


@router.post("/checkouts/declined")
async def log_decline(body: DeclineCreate):
    """A booking confirmed without a rain refund — feeds the attach-rate stats."""
    m = await merchant_or_404(body.merchant_id)
    await db.declines.insert_one({"merchant_id": m.id, "created_at": now_iso()})
    return {"ok": True}


@router.get("/brands/{brand}")
async def brand_summary(brand: str, weeks: int = 8):
    locs = [Merchant.from_mongo(d) async for d in db.merchants.find({"brand": brand}).sort("created_at", 1)]
    if not locs:
        raise HTTPException(404, "Brand not found")
    out = []
    for m in locs:
        r = await compute_report([m.id], weeks)
        out.append({"merchant": m.model_dump(), "sold": r["totals"]["sold"], "net": r["totals"]["net"]})
    return {"brand": brand, "locations": out, **(await compute_report([m.id for m in locs], weeks))}


@router.get("/merchants/{mid}/dashboard")
async def dashboard(mid: str):
    m = await merchant_or_404(mid)
    await settle_guarantees(m.id)
    await sync_demo_orders(m.id)
    gs = [Guarantee.from_mongo(d) async for d in db.guarantees.find({"merchant_id": m.id})]
    active = [g for g in gs if g.status == "active"]
    premiums = sum(g.price for g in active)
    hedge = sum(g.hedge_cost for g in active)
    contracts = sum(g.contracts for g in active)
    liability = sum(g.booking_value for g in active)
    orders = [HedgeOrder.from_mongo(d).model_dump() async for d in db.orders.find({"merchant_id": m.id}).sort("created_at", -1).limit(50)]
    live = await build_quote(m.city, "weekend", weekend_saturday(today_et()), m.avg_booking, m.margin_pct)
    book = await orderbook(live["ticker"]) if live.get("ticker") else {"asks": [], "bids": []}
    return {
        "merchant": m.model_dump(),
        "brand_locations": await db.merchants.count_documents({"brand": m.brand}) if m.brand else 1,
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
