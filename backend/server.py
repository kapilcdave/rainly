import os
import hmac
import logging
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Literal, Optional

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends, BackgroundTasks
from starlette.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from pymongo.errors import DuplicateKeyError

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import kalshi  # noqa: E402
import advisor  # noqa: E402
import services  # noqa: E402
from services import db, client, fernet, now, nid, refresh_positions  # noqa: E402

logger = logging.getLogger("raincheck")

app = FastAPI()
api = APIRouter(prefix="/api")

# ---------- Auth ----------
async def current_user(request: Request) -> dict:
    token = request.cookies.get("session_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        token = auth[7:] if auth.startswith("Bearer ") else None
    if not token:
        raise HTTPException(401, "Not authenticated")
    sess = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if not sess:
        raise HTTPException(401, "Invalid session")
    exp = sess["expires_at"]
    if isinstance(exp, str):
        exp = datetime.fromisoformat(exp)
    if exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    if exp < now():
        raise HTTPException(401, "Session expired")
    user = await db.users.find_one({"user_id": sess["user_id"]}, {"_id": 0})
    if not user:
        raise HTTPException(401, "User not found")
    return user


class SessionIn(BaseModel):
    session_id: str


@api.post("/auth/session")
async def create_session(body: SessionIn, response: Response):
    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.get(
            "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
            headers={"X-Session-ID": body.session_id},
        )
    if r.status_code != 200:
        raise HTTPException(401, "Invalid session id")
    d = r.json()
    existing = await db.users.find_one({"email": d["email"]}, {"_id": 0})
    if existing:
        user_id = existing["user_id"]
        await db.users.update_one({"user_id": user_id}, {"$set": {"name": d["name"], "picture": d.get("picture")}})
    else:
        user_id = f"user_{nid()}"
        await db.users.insert_one(
            {"user_id": user_id, "email": d["email"], "name": d["name"], "picture": d.get("picture"),
             "created_at": now().isoformat()}
        )
    await db.user_sessions.insert_one(
        {"user_id": user_id, "session_token": d["session_token"], "expires_at": now() + timedelta(days=7),
         "created_at": now()}
    )
    response.set_cookie("session_token", d["session_token"], httponly=True, secure=True, samesite="none",
                        path="/", max_age=7 * 24 * 3600)
    return await db.users.find_one({"user_id": user_id}, {"_id": 0})


@api.get("/auth/me")
async def me(user: dict = Depends(current_user)):
    return user


@api.post("/auth/logout")
async def logout(request: Request, response: Response):
    token = request.cookies.get("session_token")
    auth = request.headers.get("Authorization", "")
    token = token or (auth[7:] if auth.startswith("Bearer ") else None)
    if token:
        await db.user_sessions.delete_one({"session_token": token})
    response.delete_cookie("session_token", path="/", secure=True, samesite="none")
    return {"ok": True}


# ---------- Markets (public) ----------
@api.get("/")
async def root():
    return {"message": "RainCheck API"}


@api.get("/cities")
async def cities():
    return [{"city": c, "kinds": list(k.keys())} for c, k in kalshi.CITY_SERIES.items()]


@api.get("/markets")
async def markets(city: Optional[str] = None, kind: Optional[str] = None):
    return await kalshi.weather_markets(city, kind)


@api.get("/markets/featured")
async def featured():
    picks = await kalshi.weather_markets(kind="rain")
    picks = [m for m in picks if m["yes_ask"] and 0.08 <= m["yes_ask"] <= 0.85]
    seen, out = set(), []
    for m in picks:
        if m["city"] not in seen:
            seen.add(m["city"])
            out.append(m)
    return out[:8]


@api.get("/markets/{ticker}")
async def market(ticker: str):
    try:
        return await kalshi.market_detail(ticker)
    except httpx.HTTPStatusError:
        raise HTTPException(404, "Market not found")


# ---------- Businesses ----------
class DescribeIn(BaseModel):
    description: str = Field(min_length=5, max_length=1000)


class BusinessIn(BaseModel):
    name: str
    business_type: str
    city: str
    market_city: str
    city_note: str = ""
    daily_revenue: float = Field(ge=0)
    bad_day_loss: float = Field(ge=0)
    weather_sensitivity: str = ""
    description: str = ""


@api.post("/advisor/profile")
async def ai_profile(body: DescribeIn, user: dict = Depends(current_user)):
    try:
        p = await advisor.draft_profile(body.description)
    except Exception as e:
        logger.exception("profile draft failed")
        raise HTTPException(502, f"AI advisor unavailable: {e}")
    p["description"] = body.description
    return p


@api.post("/businesses")
async def create_business(body: BusinessIn, user: dict = Depends(current_user)):
    if body.market_city not in kalshi.CITY_SERIES:
        raise HTTPException(400, "Unsupported market city")
    doc = {"id": nid(), "user_id": user["user_id"], **body.model_dump(), "report": None,
           "created_at": now().isoformat()}
    await db.businesses.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.get("/businesses")
async def list_businesses(user: dict = Depends(current_user)):
    return await db.businesses.find({"user_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1).to_list(100)


async def get_biz(bid: str, user: dict):
    b = await db.businesses.find_one({"id": bid, "user_id": user["user_id"]}, {"_id": 0})
    if not b:
        raise HTTPException(404, "Business not found")
    return b


@api.get("/businesses/{bid}")
async def business(bid: str, user: dict = Depends(current_user)):
    return await get_biz(bid, user)


@api.put("/businesses/{bid}")
async def update_business(bid: str, body: BusinessIn, user: dict = Depends(current_user)):
    await get_biz(bid, user)
    await db.businesses.update_one({"id": bid}, {"$set": body.model_dump()})
    return await get_biz(bid, user)


@api.delete("/businesses/{bid}")
async def delete_business(bid: str, user: dict = Depends(current_user)):
    await get_biz(bid, user)
    await db.businesses.delete_one({"id": bid})
    await db.positions.update_many({"business_id": bid, "user_id": user["user_id"]}, {"$set": {"business_id": None}})
    return {"ok": True}


@api.post("/businesses/{bid}/report")
async def generate_report(bid: str, user: dict = Depends(current_user)):
    b = await get_biz(bid, user)
    mkts = await kalshi.weather_markets(b["market_city"])
    if not mkts:
        raise HTTPException(404, "No open Kalshi weather markets for this city right now")
    try:
        rep = await advisor.risk_report(b, mkts)
    except Exception as e:
        logger.exception("report failed")
        raise HTTPException(502, f"AI advisor unavailable: {e}")
    by_ticker = {m["ticker"]: m for m in mkts}
    hedges = []
    for h in rep.get("hedges", [])[:3]:
        m = by_ticker.get(h.get("ticker"))
        if not m:
            continue
        side = "no" if h.get("side") == "no" else "yes"
        price = m["yes_ask"] if side == "yes" else m["no_ask"]
        if not price:
            continue
        hedges.append({**h, "side": side, "price": price, "market": m,
                       "loss_if_event": float(h.get("loss_if_event") or b["bad_day_loss"]),
                       "coverage": min(1.0, max(0.1, float(h.get("coverage") or 0.5)))})
    report = {"summary": rep.get("summary", ""), "risks": rep.get("risks", []), "hedges": hedges,
              "generated_at": now().isoformat()}
    await db.businesses.update_one({"id": bid}, {"$set": {"report": report}})
    return report


# ---------- Kalshi credentials ----------
class CredsIn(BaseModel):
    key_id: str = Field(min_length=4)
    private_key: str = Field(min_length=60)
    environment: Literal["demo", "live"] = "demo"


async def user_client(user: dict) -> tuple[kalshi.KalshiClient, str]:
    return await services.user_client(user["user_id"])


@api.get("/kalshi/status")
async def kalshi_status(user: dict = Depends(current_user)):
    row = await db.kalshi_credentials.find_one({"user_id": user["user_id"]}, {"_id": 0, "private_key_enc": 0})
    if not row:
        return {"connected": False}
    return {"connected": True, "environment": row["environment"],
            "key_id_hint": "…" + row["key_id"][-4:], "connected_at": row["connected_at"]}


@api.put("/kalshi/credentials")
async def save_creds(body: CredsIn, user: dict = Depends(current_user)):
    pem = body.private_key.strip()
    try:
        c = kalshi.KalshiClient(body.environment, body.key_id.strip(), pem)
    except Exception:
        raise HTTPException(400, "That private key couldn't be read. Paste the full PEM file contents (RSA or Ed25519).")
    try:
        bal = await c.balance()
    except Exception as e:
        raise HTTPException(400, f"Kalshi rejected these keys for {body.environment}: {str(e)[:200]}")
    await db.kalshi_credentials.update_one(
        {"user_id": user["user_id"]},
        {"$set": {"user_id": user["user_id"], "key_id": body.key_id.strip(), "environment": body.environment,
                  "private_key_enc": fernet.encrypt(pem.encode()).decode(), "connected_at": now().isoformat()}},
        upsert=True,
    )
    return {"connected": True, "environment": body.environment, "balance": bal}


@api.delete("/kalshi/credentials")
async def delete_creds(user: dict = Depends(current_user)):
    await db.kalshi_credentials.delete_one({"user_id": user["user_id"]})
    return {"connected": False}


@api.get("/kalshi/balance")
async def kalshi_balance(user: dict = Depends(current_user)):
    c, env = await user_client(user)
    try:
        return {"environment": env, **(await c.balance())}
    except Exception as e:
        raise HTTPException(502, str(e)[:300])


# ---------- Positions ----------
class PositionIn(BaseModel):
    ticker: str
    side: Literal["yes", "no"]
    contracts: int = Field(ge=1, le=100000)
    mode: Literal["paper", "kalshi"] = "paper"
    business_id: Optional[str] = None
    loss_if_event: float = Field(default=0, ge=0)
    headline: str = ""
    client_order_id: Optional[str] = None


@api.post("/positions")
async def open_position(body: PositionIn, user: dict = Depends(current_user)):
    if body.business_id:
        await get_biz(body.business_id, user)
    return await services.place_position(user["user_id"], body.ticker, body.side, body.contracts, body.mode,
                                         body.business_id, body.loss_if_event, body.headline, body.client_order_id)


class SimulateIn(BaseModel):
    result: Literal["yes", "no"]


@api.post("/positions/{pid}/simulate")
async def simulate_position(pid: str, body: SimulateIn, user: dict = Depends(current_user)):
    p = await db.positions.find_one({"id": pid, "user_id": user["user_id"]}, {"_id": 0})
    if not p:
        raise HTTPException(404, "Not found")
    if p["mode"] != "paper" or p["status"] != "open":
        raise HTTPException(400, "Only open paper hedges can be simulated")
    await services.settle(p, body.result, simulated=True)
    return await db.positions.find_one({"id": pid}, {"_id": 0, "kalshi_order": 0})


@api.post("/positions/{pid}/celebrated")
async def mark_celebrated(pid: str, user: dict = Depends(current_user)):
    r = await db.positions.update_one({"id": pid, "user_id": user["user_id"]}, {"$set": {"celebrated": True}})
    if not r.matched_count:
        raise HTTPException(404, "Not found")
    return {"ok": True}


@api.post("/kalshi/sync")
async def kalshi_sync(user: dict = Depends(current_user)):
    res = await services.sync_orders(user["user_id"])
    await refresh_positions(user["user_id"])
    return res


@api.get("/positions")
async def list_positions(user: dict = Depends(current_user)):
    await refresh_positions(user["user_id"])
    return await db.positions.find({"user_id": user["user_id"]}, {"_id": 0, "kalshi_order": 0}).sort(
        "created_at", -1).to_list(500)


@api.delete("/positions/{pid}")
async def delete_position(pid: str, user: dict = Depends(current_user)):
    p = await db.positions.find_one({"id": pid, "user_id": user["user_id"]})
    if not p:
        raise HTTPException(404, "Not found")
    if p["mode"] != "paper":
        raise HTTPException(400, "Real Kalshi positions can't be removed here")
    await db.positions.delete_one({"id": pid})
    if p.get("plan_id"):
        await db.plans.update_one({"id": p["plan_id"], "legs.position_id": pid},
                                  {"$set": {"legs.$.status": "removed"}, "$inc": {"spent": -p["cost"]}})
    return {"ok": True}


@api.get("/dashboard")
async def dashboard(user: dict = Depends(current_user)):
    await refresh_positions(user["user_id"])
    pos = [p for p in await db.positions.find({"user_id": user["user_id"]}, {"_id": 0, "kalshi_order": 0}).to_list(500)
           if p["status"] != "cancelled"]
    active = [p for p in pos if p["status"] == "open"]
    settled = [p for p in pos if p["status"] == "settled"]
    return {
        "active_count": len(active),
        "settled_count": len(settled),
        "spent": round(sum(p["cost"] for p in pos), 2),
        "payouts": round(sum(p["payout"] or 0 for p in settled), 2),
        "protected": round(sum(p["max_payout"] for p in active), 2),
        "net": round(sum(p["pnl"] or 0 for p in settled), 2),
        "businesses": await db.businesses.count_documents({"user_id": user["user_id"]}),
        "unread_alerts": await db.alerts.count_documents({"user_id": user["user_id"], "read": False}),
    }


# ---------- Watches & alerts ----------
class WatchIn(BaseModel):
    ticker: str
    side: Literal["yes", "no"] = "yes"
    target_price: Optional[float] = Field(default=None, gt=0, lt=1)
    headline: str = ""
    business_id: Optional[str] = None


@api.post("/watches")
async def create_watch(body: WatchIn, user: dict = Depends(current_user)):
    if body.business_id:
        await get_biz(body.business_id, user)
    try:
        m = await kalshi.market_detail(body.ticker, fresh=True)
    except httpx.HTTPStatusError:
        raise HTTPException(404, "Market not found")
    price = m["yes_ask"] if body.side == "yes" else m["no_ask"]
    doc = {"id": nid(), "user_id": user["user_id"], "ticker": body.ticker, "side": body.side,
           "headline": body.headline or m["outcome"], "title": m["title"], "city": m["city"], "kind": m["kind"],
           "business_id": body.business_id, "target_price": body.target_price, "baseline_price": price,
           "baseline_prob": services.odds(m), "last_price": price, "last_prob": services.odds(m),
           "close_time": m["close_time"], "active": True, "created_at": now().isoformat()}
    await db.watches.update_one({"user_id": user["user_id"], "ticker": body.ticker, "side": body.side},
                                {"$set": doc}, upsert=True)
    return doc


@api.get("/watches")
async def list_watches(user: dict = Depends(current_user)):
    return await db.watches.find({"user_id": user["user_id"], "active": True}, {"_id": 0}).sort("created_at", -1).to_list(200)


@api.delete("/watches/{wid}")
async def delete_watch(wid: str, user: dict = Depends(current_user)):
    await db.watches.delete_one({"id": wid, "user_id": user["user_id"]})
    return {"ok": True}


@api.get("/alerts")
async def list_alerts(user: dict = Depends(current_user)):
    return await db.alerts.find({"user_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1).to_list(100)


@api.post("/alerts/read")
async def read_alerts(user: dict = Depends(current_user)):
    await db.alerts.update_many({"user_id": user["user_id"], "read": False}, {"$set": {"read": True}})
    return {"ok": True}


@api.post("/alerts/check")
async def check_now(user: dict = Depends(current_user)):
    fired = await services.check_watches(user["user_id"])
    await services.run_plans(user["user_id"])
    return {"fired": fired}


class PushSub(BaseModel):
    endpoint: str
    expirationTime: Optional[int] = None
    keys: dict


@api.get("/push/public-key")
async def push_key():
    return {"publicKey": os.environ["VAPID_PUBLIC_KEY"]}


@api.post("/push/subscribe")
async def push_subscribe(sub: PushSub, user: dict = Depends(current_user)):
    await db.push_subscriptions.update_one(
        {"user_id": user["user_id"], "endpoint": sub.endpoint},
        {"$set": {"user_id": user["user_id"], "endpoint": sub.endpoint, "subscription": sub.model_dump(),
                  "created_at": now().isoformat()}}, upsert=True)
    return {"ok": True}


@api.post("/push/unsubscribe")
async def push_unsubscribe(sub: PushSub, user: dict = Depends(current_user)):
    await db.push_subscriptions.delete_one({"user_id": user["user_id"], "endpoint": sub.endpoint})
    return {"ok": True}


@api.post("/push/test")
async def push_test(user: dict = Depends(current_user)):
    n = await db.push_subscriptions.count_documents({"user_id": user["user_id"]})
    if not n:
        raise HTTPException(400, "Turn on notifications on this device first")
    await services.send_push(user["user_id"], "RainCheck alerts are on", "We'll ping you when a hedge gets cheaper or the forecast shifts.", "/alerts")
    return {"devices": n}


# ---------- Season plans ----------
class PlanIn(BaseModel):
    business_id: str
    weekends: int = Field(ge=1, le=26)
    risks: list[Literal["rain", "cool", "hot"]] = Field(min_length=1)
    coverage: float = Field(ge=0.1, le=1.0)
    budget: float = Field(gt=0, le=100000)
    mode: Literal["paper", "kalshi"] = "paper"


@api.post("/plans/preview")
async def plan_preview(body: PlanIn, user: dict = Depends(current_user)):
    biz = await get_biz(body.business_id, user)
    legs = services.build_legs(biz, body.weekends, body.risks)
    if not legs:
        raise HTTPException(400, f"No matching Kalshi markets for {biz['market_city']} with these risks")
    est = 0.0
    per_leg = body.budget / len(legs)
    for leg in legs:
        m = await services.pick_market(leg)
        contracts = max(1, round(leg["loss_if_event"] * body.coverage))
        if m and contracts * m["yes_ask"] > per_leg:
            contracts = int(per_leg / m["yes_ask"])
        leg["contracts"] = contracts
        if m and contracts >= 1:
            leg.update({"available": True, "price": m["yes_ask"], "outcome": m["outcome"],
                        "est_cost": round(contracts * m["yes_ask"], 2)})
            est += leg["est_cost"]
        else:
            leg["available"] = False
    now_legs = [l for l in legs if l["available"]]
    return {"legs": legs, "now_cost": round(est, 2), "now_count": len(now_legs),
            "max_payout": sum(l["contracts"] for l in now_legs), "later": len(legs) - len(now_legs)}


@api.post("/plans")
async def create_plan(body: PlanIn, user: dict = Depends(current_user)):
    biz = await get_biz(body.business_id, user)
    if await db.plans.find_one({"user_id": user["user_id"], "business_id": biz["id"], "status": "active"}):
        raise HTTPException(409, "This business already has an active season plan. Cancel it first to avoid double-hedging.")
    if body.mode == "kalshi":
        await user_client(user)
    legs = services.build_legs(biz, body.weekends, body.risks)
    if not legs:
        raise HTTPException(400, f"No matching Kalshi markets for {biz['market_city']} with these risks")
    plan = {"id": nid(), "user_id": user["user_id"], "business_id": biz["id"], "business_name": biz["name"],
            "name": f"Cover the next {body.weekends} weekends", **body.model_dump(), "legs": legs, "spent": 0.0,
            "status": "active", "created_at": now().isoformat()}
    await db.plans.insert_one(plan)
    plan.pop("_id", None)
    return await services.run_plan(plan)


@api.get("/plans")
async def list_plans(user: dict = Depends(current_user)):
    return await db.plans.find({"user_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1).to_list(100)


@api.post("/plans/{pid}/cancel")
async def cancel_plan(pid: str, user: dict = Depends(current_user)):
    r = await db.plans.update_one({"id": pid, "user_id": user["user_id"], "status": "active"},
                                  {"$set": {"status": "cancelled"}})
    if not r.matched_count:
        raise HTTPException(404, "Active plan not found")
    return {"ok": True}


# ---------- Cron ----------
@api.post("/cron/tick")
async def cron_tick(request: Request, background: BackgroundTasks):
    # Cron endpoints must ack 2xx immediately; enqueue/background the actual work.
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer ") or not hmac.compare_digest(auth[7:], os.environ["WEBHOOK_CRON_SECRET"]):
        raise HTTPException(401, "Unauthorized")
    try:
        body = await request.json()
    except Exception:
        body = {}
    run_id = request.headers.get("X-Webhook-Id") or (body or {}).get("run_id") or nid()
    if await db.cron_runs.find_one({"run_id": run_id}):
        return {"ok": True, "duplicate": True}
    try:
        await db.cron_runs.insert_one({"run_id": run_id, "at": now().isoformat()})
    except DuplicateKeyError:
        return {"ok": True, "duplicate": True}
    background.add_task(services.tick)
    return {"ok": True}


app.include_router(api)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origin_regex=".*",
    allow_methods=["*"],
    allow_headers=["*"],
)
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")


@app.on_event("startup")
async def ensure_indexes():
    await db.cron_runs.create_index("run_id", unique=True)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
