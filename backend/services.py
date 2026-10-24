import asyncio
import json
import logging
import os
import uuid
from datetime import datetime, timezone, timedelta, date
from zoneinfo import ZoneInfo

import httpx
from cryptography.fernet import Fernet
from fastapi import HTTPException
from motor.motor_asyncio import AsyncIOMotorClient
from pywebpush import webpush, WebPushException

import kalshi

client = AsyncIOMotorClient(os.environ["MONGO_URL"])
db = client[os.environ["DB_NAME"]]
fernet = Fernet(os.environ["APP_ENCRYPTION_KEY"].encode())
log = logging.getLogger("raincheck.services")
TZ = ZoneInfo("America/Chicago")
MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"]


def now():
    return datetime.now(timezone.utc)


def nid():
    return uuid.uuid4().hex[:12]


# ---------- Kalshi client per user ----------
async def user_client(user_id: str):
    row = await db.kalshi_credentials.find_one({"user_id": user_id}, {"_id": 0})
    if not row:
        raise HTTPException(400, "Connect your Kalshi keys in Settings first")
    pem = fernet.decrypt(row["private_key_enc"].encode()).decode()
    return kalshi.KalshiClient(row["environment"], row["key_id"], pem), row["environment"]


def _order(resp):
    return (resp.get("order") or resp) if isinstance(resp, dict) else {}


def _num(o, *keys):
    for k in keys:
        if o.get(k) is not None:
            try:
                return float(o[k])
            except (TypeError, ValueError):
                pass
    return None


# ---------- Positions ----------
async def place_position(user_id, ticker, side, contracts, mode, business_id=None, loss_if_event=0.0,
                         headline="", client_order_id=None, plan_id=None):
    try:
        m = await kalshi.market_detail(ticker, fresh=True)
    except httpx.HTTPStatusError:
        raise HTTPException(404, "Market not found")
    if m["status"] not in ("active", "open"):
        raise HTTPException(400, "This market is no longer open")
    price = m["yes_ask"] if side == "yes" else m["no_ask"]
    if not price or price >= 1:
        raise HTTPException(400, "No one is selling this side right now")
    env, order, order_id, kstatus = None, None, None, None
    if mode == "kalshi":
        c, env = await user_client(user_id)
        coid = client_order_id or str(uuid.uuid4())
        if await db.positions.find_one({"client_order_id": coid}):
            raise HTTPException(409, "This order was already submitted")
        try:
            order = await c.buy(ticker, side, contracts, price, coid)
        except Exception as e:
            raise HTTPException(502, str(e)[:300])
        o = _order(order)
        filled = _num(o, "fill_count_fp", "fill_count", "filled_count")
        if filled == 0:
            raise HTTPException(409, "Kalshi couldn't fill this at the shown price, so nothing was bought. Try again.")
        contracts = int(filled) if filled else contracts
        order_id, kstatus = o.get("order_id"), o.get("status") or "submitted"
        client_order_id = coid
    doc = {
        "id": nid(), "user_id": user_id, "business_id": business_id, "plan_id": plan_id, "ticker": ticker,
        "title": m["title"], "outcome": m["outcome"], "city": m["city"], "kind": m["kind"],
        "headline": headline or m["outcome"], "side": side, "contracts": contracts, "price": price,
        "cost": round(contracts * price, 2), "max_payout": float(contracts), "loss_if_event": loss_if_event,
        "mode": mode, "environment": env, "client_order_id": client_order_id if mode == "kalshi" else None,
        "kalshi_order_id": order_id, "kalshi_status": kstatus, "kalshi_order": order,
        "status": "open", "result": None, "payout": None, "pnl": None, "celebrated": False, "simulated": False,
        "close_time": m["close_time"], "created_at": now().isoformat(),
    }
    await db.positions.insert_one(doc)
    doc.pop("_id", None)
    doc.pop("kalshi_order", None)
    return doc


async def settle(p, result, simulated=False):
    won = result == p["side"]
    payout = p["max_payout"] if won else 0.0
    r = await db.positions.update_one(
        {"id": p["id"], "status": "open"},
        {"$set": {"status": "settled", "result": result, "won": won, "payout": payout, "simulated": simulated,
                  "pnl": round(payout - p["cost"], 2), "settled_at": now().isoformat(), "celebrated": not won}},
    )
    if won and r.modified_count:
        covered = f", covering {min(100, round(payout / p['loss_if_event'] * 100))}% of the loss" if p.get("loss_if_event") else ""
        await create_alert(p["user_id"], "payout", f"Your hedge paid ${payout:,.0f}",
                           f"{p['headline']}{covered}.", "/dashboard")


async def refresh_positions(user_id: str):
    for p in await db.positions.find({"user_id": user_id, "status": "open"}, {"_id": 0}).to_list(500):
        try:
            m = await kalshi.market_detail(p["ticker"])
        except Exception:
            continue
        if m["result"] in ("yes", "no") and m["status"] in ("finalized", "settled", "determined"):
            await settle(p, m["result"])


async def sync_orders(user_id: str):
    rows = await db.positions.find({"user_id": user_id, "mode": "kalshi", "kalshi_order_id": {"$ne": None},
                                    "status": "open"}, {"_id": 0}).to_list(200)
    if not rows:
        return {"synced": 0}
    try:
        c, _ = await user_client(user_id)
    except HTTPException:
        return {"synced": 0}
    n = 0
    for p in rows:
        try:
            o = _order(await c.request("GET", f"/portfolio/orders/{p['kalshi_order_id']}"))
        except Exception as e:
            log.warning("order sync failed %s", e)
            continue
        filled = _num(o, "fill_count_fp", "fill_count")
        st = o.get("status") or p.get("kalshi_status")
        upd = {"kalshi_status": st, "kalshi_synced_at": now().isoformat()}
        if filled is not None:
            fc = int(filled)
            upd.update({"contracts": fc, "max_payout": float(fc), "cost": round(fc * p["price"], 2)})
            if fc == 0 and st in ("canceled", "cancelled"):
                upd["status"] = "cancelled"
        await db.positions.update_one({"id": p["id"]}, {"$set": upd})
        n += 1
    return {"synced": n}


# ---------- Alerts & push ----------
async def create_alert(user_id, kind, title, body, url="/alerts"):
    await db.alerts.insert_one({"id": nid(), "user_id": user_id, "kind": kind, "title": title, "body": body,
                                "url": url, "read": False, "created_at": now().isoformat()})
    await send_push(user_id, title, body, url)


async def send_push(user_id, title, body, url):
    payload = json.dumps({"title": title, "body": body, "url": url, "tag": nid()})
    async for row in db.push_subscriptions.find({"user_id": user_id}):
        try:
            await asyncio.to_thread(
                webpush, subscription_info=row["subscription"], data=payload,
                vapid_private_key=os.environ["VAPID_PRIVATE_KEY"], vapid_claims={"sub": os.environ["VAPID_SUBJECT"]},
            )
        except WebPushException as e:
            if e.response is not None and e.response.status_code in (404, 410):
                await db.push_subscriptions.delete_one({"_id": row["_id"]})
            else:
                log.warning("push failed: %s", e)
        except Exception as e:
            log.warning("push error: %s", e)


def odds(m):
    if m["yes_bid"] is not None and m["yes_ask"] is not None:
        return round((m["yes_bid"] + m["yes_ask"]) / 2, 3)
    return m["last_price"]


async def check_watches(user_id=None):
    q = {"active": True, **({"user_id": user_id} if user_id else {})}
    fired = 0
    for w in await db.watches.find(q, {"_id": 0}).to_list(1000):
        try:
            m = await kalshi.market_detail(w["ticker"], fresh=True)
        except Exception:
            continue
        if m["status"] not in ("active", "open"):
            await db.watches.update_one({"id": w["id"]}, {"$set": {"active": False}})
            continue
        price = m["yes_ask"] if w["side"] == "yes" else m["no_ask"]
        prob = odds(m)
        upd = {"last_price": price, "last_prob": prob, "checked_at": now().isoformat()}
        name = w.get("headline") or m["outcome"]
        if price and w.get("baseline_price") and price < w["baseline_price"] and (
            (w.get("target_price") and price <= w["target_price"]) or price <= w["baseline_price"] * 0.8
        ):
            await create_alert(w["user_id"], "cheaper", "Your hedge just got cheaper",
                               f"{name}: now {round(price * 100)}¢, down from {round(w['baseline_price'] * 100)}¢.", "/markets")
            upd["baseline_price"] = price
            upd["target_price"] = None
            fired += 1
        if prob is not None and w.get("baseline_prob") is not None and abs(prob - w["baseline_prob"]) >= 0.10:
            arrow = "up" if prob > w["baseline_prob"] else "down"
            await create_alert(w["user_id"], "forecast", f"{m['city']} forecast shifted",
                               f"Market odds of \"{m['outcome']}\" moved {arrow} from {round(w['baseline_prob'] * 100)}% to {round(prob * 100)}%.",
                               "/alerts")
            upd["baseline_prob"] = prob
            fired += 1
        await db.watches.update_one({"id": w["id"]}, {"$set": upd})
    return fired


# ---------- Season plans ----------
def weekend_days(n_weekends: int, start: date | None = None):
    d = start or datetime.now(TZ).date()
    out = []
    while len(out) < n_weekends * 2:
        if d.weekday() in (5, 6):
            out.append(d)
        d += timedelta(days=1)
    return out


def event_suffix_day(d: date):
    return f"{d.year % 100:02d}{MONTHS[d.month - 1]}{d.day:02d}"


def event_suffix_month(y, mth):
    return f"{y % 100:02d}{MONTHS[mth - 1]}"


def build_legs(biz, n_weekends, risks):
    series = kalshi.CITY_SERIES.get(biz["market_city"], {})
    days = weekend_days(n_weekends)
    legs = []
    if "rain" in risks and "rain" in series:
        months = sorted({(d.year, d.month) for d in days})
        for y, mth in months:
            n_days = sum(1 for d in days if (d.year, d.month) == (y, mth))
            legs.append({"key": f"rain-{y}-{mth:02d}", "kind": "rain", "label": f"Wet {MONTHS[mth - 1].title()} {y}",
                         "event": f"{series['rain']}-{event_suffix_month(y, mth)}", "date": date(y, mth, 1).isoformat(),
                         "loss_if_event": round(biz["bad_day_loss"] * n_days * 0.5, 2), "status": "scheduled"})
    for risk, strike in (("cool", "less"), ("hot", "greater")):
        if risk in risks and "heat" in series:
            for d in days:
                legs.append({"key": f"{risk}-{d.isoformat()}", "kind": "cold" if risk == "cool" else "heat",
                             "label": f"{'Cool' if risk == 'cool' else 'Hot'} {d.strftime('%a %b %-d')}",
                             "event": f"{series['heat']}-{event_suffix_day(d)}", "strike": strike, "date": d.isoformat(),
                             "loss_if_event": float(biz["bad_day_loss"]), "status": "scheduled"})
    return legs


async def pick_market(leg):
    try:
        data = await kalshi.public_get("/markets", {"event_ticker": leg["event"], "status": "open", "limit": 100})
    except Exception:
        return None
    mk = [kalshi.normalize(x, None, leg["kind"]) for x in data.get("markets", [])]
    if leg["kind"] != "rain":
        mk = [x for x in mk if x["strike_type"] == leg.get("strike")]
    mk = [x for x in mk if x["yes_ask"] and 0.01 <= x["yes_ask"] <= 0.7]
    if not mk:
        return None
    target = 0.35 if leg["kind"] == "rain" else 0.25
    return min(mk, key=lambda x: abs(x["yes_ask"] - target))


async def run_plan(plan):
    today = datetime.now(TZ).date().isoformat()
    spent = plan.get("spent", 0.0)
    per_leg = plan["budget"] / max(1, len(plan["legs"]))
    changed = False
    for leg in plan["legs"]:
        if leg["status"] != "scheduled":
            continue
        last_day = leg["date"] if leg["kind"] != "rain" else leg["date"][:7] + "-28"
        if last_day < today:
            leg["status"], changed = "missed", True
            continue
        m = await pick_market(leg)
        if not m:
            continue
        contracts = max(1, round(leg["loss_if_event"] * plan["coverage"]))
        cap = min(per_leg, plan["budget"] - spent)
        if contracts * m["yes_ask"] > cap:
            contracts = int(cap / m["yes_ask"])
            if contracts < 1:
                leg["status"], changed = "over_budget", True
                continue
        try:
            pos = await place_position(plan["user_id"], m["ticker"], "yes", contracts, plan["mode"], plan["business_id"],
                                       leg["loss_if_event"], f"Season plan: {leg['label']} ({m['outcome']})",
                                       f"plan-{plan['id']}-{leg['key']}" if plan["mode"] == "kalshi" else None, plan["id"])
        except HTTPException as e:
            leg["error"], changed = e.detail, True
            continue
        spent += pos["cost"]
        leg.update({"status": "placed", "position_id": pos["id"], "ticker": m["ticker"], "outcome": m["outcome"],
                    "cost": pos["cost"], "price": pos["price"], "contracts": pos["contracts"]})
        changed = True
    if changed:
        plan["spent"] = round(spent, 2)
        done = all(l["status"] != "scheduled" for l in plan["legs"])
        if done:
            plan["status"] = "completed"
        await db.plans.update_one({"id": plan["id"]}, {"$set": {"legs": plan["legs"], "spent": plan["spent"],
                                                                 "status": plan["status"]}})
    return plan


async def run_plans(user_id=None):
    q = {"status": "active", **({"user_id": user_id} if user_id else {})}
    for p in await db.plans.find(q, {"_id": 0}).to_list(500):
        before = sum(1 for l in p["legs"] if l["status"] == "placed")
        p = await run_plan(p)
        new = sum(1 for l in p["legs"] if l["status"] == "placed") - before
        if new > 0:
            await create_alert(p["user_id"], "plan", "Season plan placed new hedges",
                               f"{new} new hedge{'s' if new > 1 else ''} added to \"{p['name']}\".", "/plans")


async def tick():
    users = await db.users.distinct("user_id")
    for u in users:
        try:
            await sync_orders(u)
            await refresh_positions(u)
        except Exception as e:
            log.warning("tick user %s failed: %s", u, e)
    await check_watches()
    await run_plans()
