"""Weekly rain-refund earnings and attach rate."""
from datetime import datetime, timedelta

from core import db, ET
from models import Guarantee
from services.kalshi import today_et


async def compute_report(merchant_ids: list[str], weeks: int) -> dict:
    """Weekly rain-refund earnings + attach rate, bucketed by the Monday of the week of sale."""
    weeks = max(1, min(weeks, 26))
    this_monday = today_et() - timedelta(days=today_et().weekday())
    buckets = {}
    for i in range(weeks):
        wk = this_monday - timedelta(weeks=i)
        buckets[wk.isoformat()] = {"week_of": wk.isoformat(), "sold": 0, "declined": 0, "fees": 0.0, "hedge_cost": 0.0,
                                   "refunds": 0.0, "payout": 0.0}

    def bucket(created_at: str):
        d = datetime.fromisoformat(created_at).astimezone(ET).date()
        return buckets.get((d - timedelta(days=d.weekday())).isoformat())

    async for doc in db.guarantees.find({"merchant_id": {"$in": merchant_ids}}):
        g = Guarantee.from_mongo(doc)
        b = bucket(g.created_at)
        if not b:
            continue
        b["sold"] += 1
        b["fees"] += g.price
        b["hedge_cost"] += g.hedge_cost
        if g.status == "refunded":
            b["refunds"] += g.booking_value
            b["payout"] += g.contracts
    async for doc in db.declines.find({"merchant_id": {"$in": merchant_ids}}):
        b = bucket(doc["created_at"])
        if b:
            b["declined"] += 1
    rows = []
    for b in sorted(buckets.values(), key=lambda x: x["week_of"]):
        b = {k: (round(v, 2) if isinstance(v, float) else v) for k, v in b.items()}
        b["net"] = round(b["fees"] - b["hedge_cost"] - b["refunds"] + b["payout"], 2)
        rows.append(b)
    tot = {k: round(sum(r[k] for r in rows), 2) for k in ("sold", "declined", "fees", "hedge_cost", "refunds", "payout", "net")}
    tot["sold"], tot["declined"] = int(tot["sold"]), int(tot["declined"])
    offered = tot["sold"] + tot["declined"]
    tot["attach_rate"] = round(tot["sold"] / offered, 3) if offered else None
    return {"weeks": rows, "totals": tot}
