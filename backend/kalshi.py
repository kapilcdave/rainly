import base64
import os
import time
import uuid
from datetime import date, datetime, timedelta, timezone
from urllib.parse import urlsplit

import httpx
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding

BASE_URL = os.environ["KALSHI_BASE_URL"]
ORDER_PATH = os.environ["KALSHI_ORDER_PATH"]

_client = httpx.AsyncClient(timeout=15)
_cache: dict = {}


async def get(path: str, params: dict | None = None, ttl: int = 20):
    key = path + str(sorted((params or {}).items()))
    hit = _cache.get(key)
    if hit and time.time() - hit[0] < ttl:
        return hit[1]
    r = await _client.get(BASE_URL + path, params=params)
    if r.status_code == 404:
        data = None
    else:
        r.raise_for_status()
        data = r.json()
    _cache[key] = (time.time(), data)
    return data


def tk_date(d: date) -> str:
    return d.strftime("%y%b%d").upper()


def event_ticker(product: str, d: date) -> str:
    return f"{'KXRAINWKND' if product == 'weekend' else 'KXRAIN'}-{tk_date(d)}"


async def event_markets(product: str, d: date):
    data = await get(f"/events/{event_ticker(product, d)}", {"with_nested_markets": "true"})
    if not data:
        return None
    return data["event"].get("markets") or data.get("markets") or []


async def find_market(product: str, d: date, city: str):
    markets = await event_markets(product, d)
    if markets is None:
        return None
    return next((m for m in markets if m.get("yes_sub_title") == city), None)


async def market(ticker: str, ttl: int = 60):
    data = await get(f"/markets/{ticker}", ttl=ttl)
    return data["market"] if data else None


async def orderbook(ticker: str):
    data = await get(f"/markets/{ticker}/orderbook", ttl=10)
    ob = (data or {}).get("orderbook_fp") or {}
    no_bids = ob.get("no_dollars") or []
    yes_bids = ob.get("yes_dollars") or []
    asks = sorted([[round(1 - float(p), 4), float(s)] for p, s in no_bids], key=lambda x: x[0])
    bids = sorted([[float(p), float(s)] for p, s in yes_bids], key=lambda x: -x[0])
    return {"asks": asks, "bids": bids}


def size_at_or_below(asks: list, limit: float) -> float:
    return sum(s for p, s in asks if p <= limit + 1e-9)


def weekend_saturday(today: date) -> date:
    wd = today.weekday()
    if wd == 6:
        return today - timedelta(days=1)
    return today + timedelta(days=(5 - wd))


async def historical_price(m: dict) -> float:
    try:
        opened = datetime.fromisoformat(m["open_time"].replace("Z", "+00:00"))
        hours = 72 if m["ticker"].startswith("KXRAINWKND") else 12
        max_ts = int((opened + timedelta(hours=hours)).timestamp())
        data = await get("/markets/trades", {"ticker": m["ticker"], "limit": 1, "max_ts": max_ts}, ttl=3600)
        trades = (data or {}).get("trades") or []
        if trades:
            return float(trades[0]["yes_price_dollars"])
    except Exception:
        pass
    return 0.3


def trading_mode() -> str:
    has_keys = os.environ.get("KALSHI_API_KEY_ID") and os.environ.get("KALSHI_PRIVATE_KEY")
    if has_keys and os.environ.get("MOCK_TRADING", "false").lower() != "true":
        return "live"
    return "simulated"


def _signed_headers(method: str, path: str) -> dict:
    ts = str(int(time.time() * 1000))
    key = serialization.load_pem_private_key(
        os.environ["KALSHI_PRIVATE_KEY"].replace("\\n", "\n").encode(), password=None
    )
    sig = key.sign(
        f"{ts}{method}{path}".encode(),
        padding.PSS(mgf=padding.MGF1(hashes.SHA256()), salt_length=padding.PSS.DIGEST_LENGTH),
        hashes.SHA256(),
    )
    return {
        "KALSHI-ACCESS-KEY": os.environ["KALSHI_API_KEY_ID"],
        "KALSHI-ACCESS-TIMESTAMP": ts,
        "KALSHI-ACCESS-SIGNATURE": base64.b64encode(sig).decode(),
        "Content-Type": "application/json",
    }


async def place_yes_order(ticker: str, count: int, live_ask: float, max_price: float) -> dict:
    client_order_id = str(uuid.uuid4())
    if trading_mode() == "simulated":
        return {"mode": "simulated", "status": "filled", "fill_price": live_ask,
                "kalshi_order_id": f"SIM-{client_order_id[:8]}", "client_order_id": client_order_id}
    body = {
        "ticker": ticker, "client_order_id": client_order_id, "side": "yes", "action": "buy",
        "count": count, "type": "limit", "yes_price": min(99, int(round(max_price * 100))),
        "time_in_force": "fill_or_kill",
    }
    signed_path = urlsplit(BASE_URL).path + ORDER_PATH
    r = await _client.post(BASE_URL + ORDER_PATH, json=body, headers=_signed_headers("POST", signed_path))
    if r.status_code >= 400:
        raise RuntimeError(f"Kalshi order rejected ({r.status_code}): {r.text[:300]}")
    order = r.json().get("order", {})
    return {"mode": "live", "status": order.get("status", "submitted"), "fill_price": live_ask,
            "kalshi_order_id": order.get("order_id", ""), "client_order_id": client_order_id}


def now_utc() -> datetime:
    return datetime.now(timezone.utc)
