import os
import logging
import uuid
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Literal, Optional

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field
from cryptography.fernet import Fernet

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import kalshi  # noqa: E402
import advisor  # noqa: E402

client = AsyncIOMotorClient(os.environ["MONGO_URL"])
db = client[os.environ["DB_NAME"]]
fernet = Fernet(os.environ["APP_ENCRYPTION_KEY"].encode())
logger = logging.getLogger("raincheck")

app = FastAPI()
api = APIRouter(prefix="/api")


def now():
    return datetime.now(timezone.utc)


def nid():
    return uuid.uuid4().hex[:12]


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
    row = await db.kalshi_credentials.find_one({"user_id": user["user_id"]}, {"_id": 0})
    if not row:
        raise HTTPException(400, "Connect your Kalshi keys in Settings first")
    pem = fernet.decrypt(row["private_key_enc"].encode()).decode()
    return kalshi.KalshiClient(row["environment"], row["key_id"], pem), row["environment"]


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


def _fill_count(resp: dict):
    o = resp.get("order", resp) if isinstance(resp, dict) else {}
    for k in ("fill_count_fp", "fill_count", "filled_count"):
        if o.get(k) is not None:
            try:
                return int(float(o[k]))
            except (TypeError, ValueError):
                pass
    return None


@api.post("/positions")
async def open_position(body: PositionIn, user: dict = Depends(current_user)):
    if body.business_id:
        await get_biz(body.business_id, user)
    try:
        m = await kalshi.market_detail(body.ticker, fresh=True)
    except httpx.HTTPStatusError:
        raise HTTPException(404, "Market not found")
    if m["status"] not in ("active", "open"):
        raise HTTPException(400, "This market is no longer open")
    price = m["yes_ask"] if body.side == "yes" else m["no_ask"]
    if not price or price >= 1:
        raise HTTPException(400, "No one is selling this side right now")
    contracts, env, order = body.contracts, None, None
    if body.mode == "kalshi":
        c, env = await user_client(user)
        coid = body.client_order_id or str(uuid.uuid4())
        if await db.positions.find_one({"client_order_id": coid}):
            raise HTTPException(409, "This order was already submitted")
        try:
            order = await c.buy(body.ticker, body.side, contracts, price, coid)
        except Exception as e:
            raise HTTPException(502, str(e)[:300])
        filled = _fill_count(order)
        if filled == 0:
            raise HTTPException(409, "Kalshi couldn't fill this at the shown price, so nothing was bought. Try again.")
        contracts = filled or contracts
    doc = {
        "id": nid(), "user_id": user["user_id"], "business_id": body.business_id, "ticker": body.ticker,
        "title": m["title"], "outcome": m["outcome"], "city": m["city"], "kind": m["kind"],
        "headline": body.headline, "side": body.side, "contracts": contracts, "price": price,
        "cost": round(contracts * price, 2), "max_payout": float(contracts), "loss_if_event": body.loss_if_event,
        "mode": body.mode, "environment": env, "client_order_id": body.client_order_id if body.mode == "kalshi" else None,
        "kalshi_order": order, "status": "open", "result": None, "payout": None, "pnl": None,
        "close_time": m["close_time"], "created_at": now().isoformat(),
    }
    await db.positions.insert_one(doc)
    doc.pop("_id", None)
    return doc


async def refresh_positions(user_id: str):
    open_pos = await db.positions.find({"user_id": user_id, "status": "open"}, {"_id": 0}).to_list(500)
    for p in open_pos:
        try:
            m = await kalshi.market_detail(p["ticker"])
        except Exception:
            continue
        if m["result"] in ("yes", "no") and m["status"] in ("finalized", "settled", "determined"):
            won = m["result"] == p["side"]
            payout = p["max_payout"] if won else 0.0
            await db.positions.update_one(
                {"id": p["id"]},
                {"$set": {"status": "settled", "result": m["result"], "won": won, "payout": payout,
                          "pnl": round(payout - p["cost"], 2), "settled_at": now().isoformat()}},
            )


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
    return {"ok": True}


@api.get("/dashboard")
async def dashboard(user: dict = Depends(current_user)):
    await refresh_positions(user["user_id"])
    pos = await db.positions.find({"user_id": user["user_id"]}, {"_id": 0, "kalshi_order": 0}).to_list(500)
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
    }


app.include_router(api)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origin_regex=".*",
    allow_methods=["*"],
    allow_headers=["*"],
)
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
