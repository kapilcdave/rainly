"""Customer and merchant emails, with automatic retries.

Every email records `<kind>_email_status`, `<kind>_email_attempts` and `<kind>_email_retry_at` on its
document (kinds: confirm, reminder, refund on guarantees; alert on merchants). A failed send is retried
with growing waits (5m, 15m, 1h, 4h) and marked `gave_up` after the last attempt.
"""
import asyncio
from datetime import datetime, date, timedelta, timezone
from typing import Awaitable, Callable

from bson import ObjectId

from core import db, logger, ET, MAX_P, now_iso
from emailer import booking_confirmation_email, price_alert_email, refund_email, reminder_email, send_email
from models import Guarantee, Merchant
from services.kalshi import f, find_market, get_event_markets, kget, price_quote, today_et, weekend_saturday

RETRY_MINUTES = [5, 15, 60, 240]  # wait after attempt 1, 2, 3, 4
MAX_EMAIL_ATTEMPTS = len(RETRY_MINUTES) + 1
ALERT_JUMP = 0.10  # alert merchants when the weekend rain chance rises 10+ points in 24h
SEND_GAP = 0.6  # seconds between sends, to stay under the email rate limit
RATE_LIMIT_WAITS = (1.5, 4, None)  # in-place waits on a rate limit before falling back to the retry schedule


def retry_due(kind: str) -> dict:
    """Mongo filter: a failed email of this kind whose next attempt is due."""
    return {f"{kind}_email_status": {"$regex": "^failed"},
            f"{kind}_email_attempts": {"$lt": MAX_EMAIL_ATTEMPTS},
            f"{kind}_email_retry_at": {"$lte": now_iso()}}


async def deliver(kind: str, attempts: int, to: str, build: Callable[[], Awaitable[tuple[str, str]]]) -> dict:
    """Build and send one email; returns the fields to $set recording the outcome and the next retry."""
    n = attempts + 1
    upd = {f"{kind}_email_attempts": n, f"{kind}_email_at": now_iso(), f"{kind}_email_retry_at": None}
    error = None
    try:
        subject, html = await build()
        for wait in RATE_LIMIT_WAITS:
            try:
                upd[f"{kind}_email_id"] = await send_email(to=to, subject=subject, html=html)
                break
            except RuntimeError as e:
                if str(e) != "rate_limited" or wait is None:
                    raise
                await asyncio.sleep(wait)  # brief rate limit: try again in a moment
        upd[f"{kind}_email_status"] = "sent"
        return upd
    except ValueError as e:  # template rejected by the safety check — retrying can't help
        logger.error("%s email rejected: %s", kind, e)
        upd[f"{kind}_email_status"] = "gave_up"
        return upd
    except RuntimeError as e:
        error = str(e)
    except Exception as e:  # e.g. Kalshi down while building the email
        logger.warning("%s email failed: %s", kind, e)
        error = "error"
    if n >= MAX_EMAIL_ATTEMPTS:
        upd[f"{kind}_email_status"] = "gave_up"
        logger.warning("%s email gave up after %d attempts (%s)", kind, n, error)
    else:
        upd[f"{kind}_email_status"] = f"failed:{error}"
        upd[f"{kind}_email_retry_at"] = (datetime.now(timezone.utc) + timedelta(minutes=RETRY_MINUTES[n - 1])).isoformat()
    return upd


def date_label(g: Guarantee) -> str:
    d = date.fromisoformat(g.date)
    return f"the weekend of {d.strftime('%b %-d')}" if g.kind == "weekend" else d.strftime('%A, %b %-d')


async def _merchant(mid: str):
    doc = await db.merchants.find_one({"_id": ObjectId(mid)})
    return Merchant.from_mongo(doc) if doc else None


async def _market(ticker: str, ttl: int) -> dict:
    return ((await kget(f"/markets/{ticker}", ttl=ttl)) or {}).get("market") or {}


# ---------------------------------------------------------------- Booking confirmation
async def send_booking_confirmation(g: Guarantee, m: Merchant, rules: str, attempts: int = 0):
    async def build():
        return booking_confirmation_email(
            customer_name=g.customer_name or "there", merchant_name=m.name, city=m.city, date_label=date_label(g),
            amount=f"${g.booking_value:,.2f}", price=f"${g.price:,.2f}", rules=rules)
    upd = await deliver("confirm", attempts, g.customer_email, build)
    await db.guarantees.update_one({"_id": ObjectId(g.id)}, {"$set": upd})


async def retry_confirmations():
    q = {"status": "active", "customer_email": {"$nin": [None, ""]}, **retry_due("confirm")}
    while doc := await db.guarantees.find_one_and_update(q, {"$set": {"confirm_email_status": "sending"}}):
        g = Guarantee.from_mongo(doc)
        m = await _merchant(g.merchant_id)
        if not m:
            await db.guarantees.update_one({"_id": doc["_id"]}, {"$set": {"confirm_email_status": "gave_up"}})
            continue
        try:
            rules = (await _market(g.ticker, 3600)).get("rules_primary") or ""
        except Exception:
            rules = ""
        await send_booking_confirmation(g, m, rules, doc.get("confirm_email_attempts", 0))
        await asyncio.sleep(SEND_GAP)


# ---------------------------------------------------------------- Refunds
_sending_refunds = asyncio.Lock()


async def send_pending_refunds():
    """Email customers whose bookings were refunded; failed sends retry on the backoff schedule."""
    if _sending_refunds.locked():
        return
    async with _sending_refunds:
        while True:
            q = {"status": "refunded", "customer_email": {"$nin": [None, ""]},
                 "$or": [{"refund_email_status": "pending"}, retry_due("refund")]}
            doc = await db.guarantees.find_one_and_update(q, {"$set": {"refund_email_status": "sending"}})
            if not doc:
                break
            g = Guarantee.from_mongo(doc)

            async def build(g=g):
                market = await _market(g.ticker, 3600)
                m = await _merchant(g.merchant_id)
                return refund_email(
                    customer_name=g.customer_name or "there", merchant_name=m.name if m else "your booking",
                    city=m.city if m else (market.get("yes_sub_title") or ""), date_label=date_label(g),
                    amount=f"${g.booking_value:,.2f}", rules=market.get("rules_primary") or "", ticker=g.ticker)
            upd = await deliver("refund", g.refund_email_attempts, g.customer_email, build)
            await db.guarantees.update_one({"_id": doc["_id"]}, {"$set": upd})
            if upd["refund_email_status"] != "sent":
                break  # provider trouble: back off, the rest go out on a later pass
            await asyncio.sleep(SEND_GAP)


# ---------------------------------------------------------------- Morning-of reminders
async def send_reminders():
    """Morning-of email with the day's rain chance, once per covered booking (from 7am ET)."""
    now = datetime.now(ET)
    if now.hour < 7:
        return
    today = now.date()
    when = [{"kind": "daily", "date": today.isoformat()}]
    if today.weekday() >= 5:  # weekend bookings get their reminder on Saturday/Sunday morning only
        when.append({"kind": "weekend", "date": weekend_saturday(today).isoformat()})
    start_of_day = datetime.combine(today, datetime.min.time(), ET).astimezone(timezone.utc).isoformat()
    q = {"status": "active", "customer_email": {"$nin": [None, ""]},
         "created_at": {"$lt": start_of_day},  # booked today = they just got the confirmation email
         "$and": [{"$or": when}, {"$or": [{"reminder_email_status": {"$exists": False}}, retry_due("reminder")]}]}
    while doc := await db.guarantees.find_one_and_update(q, {"$set": {"reminder_email_status": "sending"}}):
        g = Guarantee.from_mongo(doc)

        async def build(g=g):
            m = await _merchant(g.merchant_id)
            mk = await _market(g.ticker, 120)
            chance = f(mk.get("yes_ask_dollars")) or f(mk.get("last_price_dollars"))
            return reminder_email(
                customer_name=g.customer_name or "there", merchant_name=m.name if m else "your",
                city=m.city if m else "", date_label="today" if g.kind == "daily" else "this weekend",
                amount=f"${g.booking_value:,.2f}", chance=f"{round(chance * 100)}%")
        upd = await deliver("reminder", doc.get("reminder_email_attempts", 0), g.customer_email, build)
        await db.guarantees.update_one({"_id": doc["_id"]}, {"$set": upd})
        await asyncio.sleep(SEND_GAP)


# ---------------------------------------------------------------- Merchant price alerts
async def _send_alert(mid, to: str, payload: dict, attempts: int):
    async def build():
        return price_alert_email(**payload)
    upd = await deliver("alert", attempts, to, build)
    await db.merchants.update_one({"_id": mid}, {"$set": upd})


async def send_price_alerts():
    """Once a day per merchant: email when their city's weekend rain chance jumps but refunds are still on sale."""
    today = today_et().isoformat()
    # Retry today's failed alerts with the exact same content.
    q = {"last_alert_date": today, "contact_email": {"$nin": [None, ""]}, **retry_due("alert")}
    while doc := await db.merchants.find_one_and_update(q, {"$set": {"alert_email_status": "sending"}}):
        await _send_alert(doc["_id"], doc["contact_email"], doc.get("alert_payload") or {}, doc.get("alert_email_attempts", 0))
        await asyncio.sleep(SEND_GAP)

    sat = weekend_saturday(today_et())
    markets = await get_event_markets("weekend", sat) or []
    async for doc in db.merchants.find({"contact_email": {"$nin": [None, ""]}, "last_alert_date": {"$ne": today}}):
        m = Merchant.from_mongo(doc)
        mk = find_market(markets, m.city)
        if not mk or mk.get("status") not in ("active", "open"):
            continue
        p, prev = f(mk.get("yes_ask_dollars")), f(mk.get("previous_yes_ask_dollars"))
        if not (prev > 0 and round((p - prev) * 100) >= round(ALERT_JUMP * 100) and p <= MAX_P):
            continue
        qt = price_quote(p, m.avg_booking, m.margin_pct)
        payload = dict(merchant_name=m.name, city=m.city, chance=f"{round(p * 100)}%",
                       jump=f"{round((p - prev) * 100)}", weekend=sat.strftime('%b %-d'),
                       price=f"${qt['price']:,.2f}", booking=f"${m.avg_booking:,.0f}")
        claimed = await db.merchants.update_one(
            {"_id": doc["_id"], "last_alert_date": {"$ne": today}},
            {"$set": {"last_alert_date": today, "alert_payload": payload, "alert_email_status": "sending",
                      "alert_email_attempts": 0}})
        if claimed.modified_count:
            await _send_alert(doc["_id"], m.contact_email, payload, 0)


async def recover_interrupted_emails():
    """On startup: sends cut off by a restart become due retries."""
    now = now_iso()
    await db.guarantees.update_many({"reminder_email_status": "sending"}, {"$unset": {"reminder_email_status": ""}})
    await db.guarantees.update_many({"refund_email_status": "sending"}, {"$set": {"refund_email_status": "pending"}})
    await db.guarantees.update_many({"confirm_email_status": "sending"},
                                    {"$set": {"confirm_email_status": "failed:interrupted", "confirm_email_retry_at": now}})
    await db.merchants.update_many({"alert_email_status": "sending"},
                                   {"$set": {"alert_email_status": "failed:interrupted", "alert_email_retry_at": now}})
    # Failures recorded before retries existed: schedule them now.
    for coll, kind in ((db.guarantees, "confirm"), (db.guarantees, "reminder"), (db.guarantees, "refund")):
        failed = {f"{kind}_email_status": {"$regex": "^failed"}}
        await coll.update_many({**failed, f"{kind}_email_attempts": {"$exists": False}}, {"$set": {f"{kind}_email_attempts": 1}})
        await coll.update_many({**failed, f"{kind}_email_retry_at": {"$exists": False}}, {"$set": {f"{kind}_email_retry_at": now}})
