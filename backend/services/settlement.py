"""Settles guarantees against Kalshi results and runs the 5-minute background loop."""
import asyncio
from typing import Optional

from core import db, logger, now_iso, bg_tasks
from services.kalshi import kget, sync_demo_orders
from services.notifications import retry_confirmations, send_pending_refunds, send_price_alerts, send_reminders

LOOP_SECONDS = 300


async def settle_guarantees(merchant_id: Optional[str]):
    q = {"status": "active"}
    if merchant_id:
        q["merchant_id"] = merchant_id
    for t in await db.guarantees.distinct("ticker", q):
        m = ((await kget(f"/markets/{t}", ttl=60)) or {}).get("market") or {}
        if m.get("result") == "yes":
            base = {"ticker": t, "status": "active"}
            await db.guarantees.update_many({**base, "customer_email": {"$in": [None, ""]}},
                                            {"$set": {"status": "refunded", "settled_at": now_iso(), "refund_email_status": "no_email"}})
            await db.guarantees.update_many(base, {"$set": {"status": "refunded", "settled_at": now_iso(), "refund_email_status": "pending"}})
        elif m.get("result") == "no":
            await db.guarantees.update_many({"ticker": t, "status": "active"}, {"$set": {"status": "expired", "settled_at": now_iso()}})
    task = asyncio.create_task(send_pending_refunds())
    bg_tasks.add(task)
    task.add_done_callback(bg_tasks.discard)


async def settlement_loop():
    jobs = (lambda: settle_guarantees(None), lambda: sync_demo_orders(None), send_pending_refunds,
            retry_confirmations, send_reminders, send_price_alerts)
    names = ("settle", "sync_orders", "refund_emails", "confirm_retries", "reminders", "price_alerts")
    while True:
        for name, job in zip(names, jobs):
            try:
                await job()
            except Exception as e:
                logger.warning("%s error: %s", name, e)
        await asyncio.sleep(LOOP_SECONDS)
