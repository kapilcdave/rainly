"""Customer checkout (buy a rain refund) and coverage status."""
import asyncio
from datetime import date, timedelta

from bson import ObjectId
from fastapi import APIRouter, HTTPException

from core import db, bg_tasks, logger
from emailer import EMAIL_RE
from models import Guarantee, GuaranteeCreate
from routers.merchants import merchant_or_404
from services.kalshi import HedgeFailed, build_quote, check_kind, f, kget, parse_day, place_hedge, today_et, weekend_saturday
from services.notifications import send_booking_confirmation

router = APIRouter()


@router.post("/guarantees")
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
    if body.expected_price is not None and q["price"] > body.expected_price + 0.005:
        raise HTTPException(409, f"The rain refund price just changed to ${q['price']:.2f}. Please review and confirm again.")
    g = Guarantee(merchant_id=m.id, customer_name=body.customer_name or "Guest", booking_value=body.booking_value,
                  kind=body.kind, date=d.isoformat(), event_ticker=q["event_ticker"], ticker=q["ticker"], p=q["p"],
                  fee_per_contract=q["fee_per_contract"], contracts=q["contracts"], hedge_cost=q["hedge_cost"],
                  price=q["price"], depth_warning=not q["depth_ok"], customer_email=email)
    g.id = str((await db.guarantees.insert_one(g.to_mongo())).inserted_id)
    try:
        order = await place_hedge(m.id, g.id, q["ticker"], q["contracts"], q["p"], q["fee_per_contract"], q.get("limit"))
    except HedgeFailed as e:  # never sell a refund we couldn't hedge
        await db.guarantees.delete_one({"_id": ObjectId(g.id)})
        raise HTTPException(409, str(e))
    except Exception:
        await db.guarantees.delete_one({"_id": ObjectId(g.id)})
        logger.exception("hedge failed unexpectedly")
        raise HTTPException(502, "Couldn't place the order on Kalshi — no charge, please try again")
    if email:
        t = asyncio.create_task(send_booking_confirmation(g, m, q.get("rules_primary") or ""))
        bg_tasks.add(t)
        t.add_done_callback(bg_tasks.discard)
    return {"guarantee": g.model_dump(), "order": order.model_dump(), "quote": q}


@router.get("/guarantees/{gid}")
async def coverage(gid: str):
    """Customer-facing coverage status. Never returns the customer's email."""
    if not ObjectId.is_valid(gid):
        raise HTTPException(404, "Booking not found")
    doc = await db.guarantees.find_one({"_id": ObjectId(gid)})
    if not doc:
        raise HTTPException(404, "Booking not found")
    g = Guarantee.from_mongo(doc)
    m = await merchant_or_404(g.merchant_id)
    try:
        mk = ((await kget(f"/markets/{g.ticker}", ttl=60)) or {}).get("market") or {}
    except HTTPException:
        mk = {}  # Kalshi unreachable: still show the customer their coverage
    d = date.fromisoformat(g.date)
    return {
        "id": g.id, "merchant_name": m.name, "city": m.city, "kind": g.kind, "date": g.date,
        "covers_until": (d + timedelta(days=1)).isoformat() if g.kind == "weekend" else g.date,
        "booking_value": g.booking_value, "price": g.price, "status": g.status,
        "customer_name": g.customer_name, "rain_chance": f(mk.get("yes_ask_dollars")) or None,
        "market_status": mk.get("status"), "result": mk.get("result") or None,
        "rules_primary": mk.get("rules_primary"), "ticker": g.ticker, "settled_at": doc.get("settled_at"),
        "refund_email_sent": g.refund_email_status == "sent",
    }
