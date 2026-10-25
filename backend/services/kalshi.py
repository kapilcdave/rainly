"""Kalshi market data, pricing and demo-order placement."""
import math
import time
import base64
import asyncio
from typing import Any, Optional
from datetime import datetime, date, timedelta, timezone

from bson import ObjectId
from fastapi import HTTPException
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from core import (db, http, logger, ET, KALSHI_PUBLIC, KALSHI_DEMO, MOCK_TRADING, KALSHI_ACCESS_KEY,
                  KALSHI_PRIVATE_KEY_PEM, KALSHI_LIVE_TRADING, KALSHI_PROD_ACCESS_KEY, KALSHI_PROD_PRIVATE_KEY_PEM,
                  DAILY_HEDGE_CAP, MAX_P, DEPTH_SLIPPAGE, now_iso)
from models import HedgeOrder
from services import kalshi_ws

_cache: dict[str, tuple[float, Any]] = {}


async def kget(path: str, params: Optional[dict] = None, ttl: int = 15, base: str = KALSHI_PUBLIC):
    key = base + path + str(sorted((params or {}).items()))
    hit = _cache.get(key)
    if hit and time.time() - hit[0] < ttl:
        return hit[1]
    try:
        r = await http.get(base + path, params=params)
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


# ---------------------------------------------------------------- Dates
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


def long_day(d: date) -> str:
    """e.g. 'Sunday, October 25th'"""
    n = d.day
    suffix = "th" if 11 <= n % 100 <= 13 else {1: "st", 2: "nd", 3: "rd"}.get(n % 10, "th")
    return f"{d.strftime('%A, %B')} {n}{suffix}"


def date_options() -> list[dict]:
    t = today_et()
    sat = weekend_saturday(t)
    nxt = sat + timedelta(days=7)
    tom = t + timedelta(days=1)
    return [  # today first: the daily markets have the deepest books
        {"kind": "daily", "date": t.isoformat(), "label": f"Today · {long_day(t)}"},
        {"kind": "daily", "date": tom.isoformat(), "label": f"Tomorrow · {long_day(tom)}"},
        {"kind": "weekend", "date": sat.isoformat(), "label": wk_label(sat)},
        {"kind": "weekend", "date": nxt.isoformat(), "label": wk_label(nxt)},
    ]


# ---------------------------------------------------------------- Markets & pricing
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
    """Book of the exchange Rainly trades on: the demo exchange in demo mode, otherwise production (stream first)."""
    demo = trading_mode() == "kalshi_demo"
    if not demo:
        live = kalshi_ws.book(ticker)
        if live is not None:
            return live
        kalshi_ws.watch(ticker)
    data = await kget(f"/markets/{ticker}/orderbook", ttl=2 if demo else 10, base=KALSHI_DEMO if demo else KALSHI_PUBLIC) or {}
    ob = data.get("orderbook_fp") or {}
    yes_bids = [(f(p), f(s)) for p, s in (ob.get("yes_dollars") or [])]
    no_bids = [(f(p), f(s)) for p, s in (ob.get("no_dollars") or [])]
    # YES asks come from NO bids: ask = 1 - no_bid. Best NO bid is last.
    asks = sorted([(round(1 - p, 2), s) for p, s in no_bids if s >= 1], key=lambda x: x[0])
    bids = sorted([b for b in yes_bids if b[1] >= 1], key=lambda x: -x[0])
    return {"asks": asks, "bids": bids}


def price_quote(p: float, booking_value: float, margin_pct: float, fee: Optional[float] = None) -> dict:
    fee = 0.07 * p * (1 - p) if fee is None else fee
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
    mode = trading_mode()
    live = kalshi_ws.book(m["ticker"])  # production stream: the real rain odds
    chance = live["asks"][0][0] if live and live["asks"] else f(m.get("yes_ask_dollars"))
    book = await orderbook(m["ticker"]) if mode == "kalshi_demo" else live  # price from where the order fills
    p = (book["asks"][0][0] if book["asks"] else 0.0) if book is not None else chance
    info = {
        **base,
        "price_source": "demo" if mode == "kalshi_demo" else ("stream" if live is not None else "rest"),
        "ticker": m["ticker"],
        "title": m.get("title"),
        "rules_primary": m.get("rules_primary"),
        "status": m.get("status"),
        "result": m.get("result") or None,
        "yes_ask": chance,  # real rain odds (production), shown to people
        "yes_bid": f(m.get("yes_bid_dollars")),
        "last_price": f(m.get("last_price_dollars")),
        "volume": f(m.get("volume_fp")),
        "open_interest": f(m.get("open_interest_fp")),
        "close_time": m.get("close_time"),
    }
    if m.get("status") not in ("active", "open"):
        return {**info, "reason": "Rain already recorded — closed" if m.get("result") == "yes" else "Market closed"}
    if p <= 0 or p >= 1:
        return {**info, "reason": "No sellers on Kalshi right now"}
    if p > MAX_P:
        return {**info, "reason": "High rain risk — not offered"}
    ob = book or await orderbook(m["ticker"])
    contracts = math.ceil(booking_value)
    fill = walk_book(ob["asks"], contracts)
    if fill:
        avg, worst, fee_total = fill
        q = {**price_quote(avg, booking_value, margin_pct, fee=fee_total / contracts), "limit": worst}
    elif mode in ("kalshi_live", "kalshi_demo"):  # a real order would not fill below the rain-risk cap
        return {**info, **price_quote(p, booking_value, margin_pct), "depth_ok": False,
                "reason": "Not enough sellers on Kalshi right now"}
    else:  # simulated: price at the best ask, flagged as thin
        q = {**price_quote(p, booking_value, margin_pct), "limit": round(min(0.99, p + DEPTH_SLIPPAGE), 2)}
    if trading_mode() == "kalshi_live":
        spent = await spent_today()
        est = live_worst_cost(contracts, q["limit"])
        if est > DAILY_HEDGE_CAP:
            return {**info, **q, "reason": "Too large for today's hedge budget — try a smaller booking or another date"}
        if spent + est > DAILY_HEDGE_CAP:
            return {**info, **q, "reason": "Today's hedge budget is used up — back tomorrow"}
    depth = sum(s for a, s in ob["asks"] if a <= p + DEPTH_SLIPPAGE + 1e-9)
    return {**info, **q, "available": True, "depth_within_3c": round(depth, 2),
            "depth_ok": fill is not None, "reason": None}


def walk_book(asks: list, n: int, cap: float = MAX_P) -> Optional[tuple[float, float, float]]:
    """Cost of buying n contracts across ask levels up to the cap: (avg price, worst price, total fees) or None."""
    left, cost, fees, worst = n, 0.0, 0.0, 0.0
    for a, s in asks:
        if a > cap + 1e-9 or left <= 0:
            break
        take = min(s, left)
        cost += take * a
        fees += take * 0.07 * a * (1 - a)
        worst, left = a, left - take
    if left > 1e-9:
        return None
    return round(cost / n, 4), worst, fees


def live_worst_cost(contracts: int, limit: float) -> float:
    """Most a live hedge can cost: every contract at the limit (+1¢ tolerance) plus fees rounded up."""
    return round(contracts * min(0.99, limit + 0.01) * 1.07, 2) + 0.01


async def history_24h(m: dict) -> list[float]:
    """Hourly YES ask closes over the last 24h (oldest first), for the landing sparkline."""
    end = int(time.time())
    end -= end % 600  # stable cache key per 10 minutes
    try:
        series = m["event_ticker"].split("-")[0]
        cs = await kget(f"/series/{series}/markets/{m['ticker']}/candlesticks",
                        {"start_ts": end - 86400, "end_ts": end, "period_interval": 60}, ttl=600) or {}
    except HTTPException:
        return []
    out = []
    for c in cs.get("candlesticks", []):
        a = f((c.get("yes_ask") or {}).get("close_dollars"))
        if 0 < a <= 1:
            out.append(round(a, 2))
    return out


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


# ---------------------------------------------------------------- Order placement
def _signed_headers(method: str, path: str, live: bool = False) -> dict:
    access, pem = (KALSHI_PROD_ACCESS_KEY, KALSHI_PROD_PRIVATE_KEY_PEM) if live else (KALSHI_ACCESS_KEY, KALSHI_PRIVATE_KEY_PEM)
    ts = str(int(time.time() * 1000))
    key = serialization.load_pem_private_key(pem.replace("\\n", "\n").encode(), password=None)
    msg = f"{ts}{method.upper()}{path.split('?')[0]}".encode()
    if isinstance(key, Ed25519PrivateKey):
        sig = key.sign(msg)  # Ed25519 (RFC 8032), no padding
    else:
        sig = key.sign(msg, padding.PSS(mgf=padding.MGF1(hashes.SHA256()), salt_length=padding.PSS.DIGEST_LENGTH),
                       hashes.SHA256())
    return {"KALSHI-ACCESS-KEY": access, "KALSHI-ACCESS-TIMESTAMP": ts,
            "KALSHI-ACCESS-SIGNATURE": base64.b64encode(sig).decode(), "Content-Type": "application/json"}


def trading_mode() -> str:
    if KALSHI_LIVE_TRADING and KALSHI_PROD_ACCESS_KEY and KALSHI_PROD_PRIVATE_KEY_PEM:
        return "kalshi_live"
    return "mock" if MOCK_TRADING or not (KALSHI_ACCESS_KEY and KALSHI_PRIVATE_KEY_PEM) else "kalshi_demo"


async def spent_today() -> float:
    """Real dollars spent on live hedges since midnight ET."""
    start = datetime.combine(today_et(), datetime.min.time(), ET).astimezone(timezone.utc).isoformat()
    rows = await db.orders.aggregate([{"$match": {"mode": "kalshi_live", "created_at": {"$gte": start}}},
                                      {"$group": {"_id": None, "s": {"$sum": "$cost"}}}]).to_list(1)
    return float(rows[0]["s"] or 0) if rows else 0.0


class HedgeFailed(Exception):
    pass


_live_lock = asyncio.Lock()  # one real order at a time, so the daily cap can't be overshot by parallel checkouts

REJECT_REASONS = {
    "insufficient_balance": "Rainly's Kalshi account doesn't have enough funds for this order — no charge",
    "market_closed": "This rain market just closed — no charge",
}


async def _place_real(order: HedgeOrder, ticker: str, count: int, limit: float, cid: str, live: bool):
    """Buy on Kalshi (production when live, else the demo exchange). Fill-or-kill: fully covered or nothing."""
    path = "/portfolio/events/orders"
    mode, base = ("kalshi_live", KALSHI_PUBLIC) if live else ("kalshi_demo", KALSHI_DEMO)
    worst = live_worst_cost(count, limit)
    limit = min(0.99, max(0.01, round(limit + 0.01, 2)))  # 1¢ tolerance for the book moving
    payload = {"ticker": ticker, "client_order_id": cid, "side": "bid", "count": f"{count:.2f}",
               "price": f"{limit:.4f}", "time_in_force": "fill_or_kill",
               "self_trade_prevention_type": "taker_at_cross"}
    async with _live_lock:
        if live and await spent_today() + worst > DAILY_HEDGE_CAP:
            raise HedgeFailed("Today's hedge budget is used up — back tomorrow")
        try:
            r = await http.post(base + path, headers=_signed_headers("POST", "/trade-api/v2" + path, live=live), json=payload)
        except Exception as e:
            # Kalshi may have accepted it: record the worst-case cost so the cap still holds, flag for review.
            logger.error("Kalshi %s order outcome unknown (%s): %s", mode, cid, e)
            await db.orders.insert_one({**order.to_mongo(), "mode": mode, "status": "unknown", "cost": worst,
                                        "note": f"Connection lost — check Kalshi for order {cid}"})
            raise HedgeFailed("Couldn't confirm the order with Kalshi — please try again")
    if r.status_code not in (200, 201):
        logger.warning("Kalshi %s order rejected %s %s", mode, r.status_code, r.text[:300])
        try:
            e = r.json().get("error")
            err = (e.get("code") if isinstance(e, dict) else "") or ""
        except (ValueError, AttributeError):
            err = ""
        raise HedgeFailed(REJECT_REASONS.get(err, f"Kalshi didn't accept the order ({err or r.status_code}) — no charge, please try again"))
    o = r.json()
    filled = f(o.get("fill_count"))
    if filled < count:
        raise HedgeFailed("No sellers at the live price right now — no charge, please try again")
    order.mode = mode
    order.kalshi_order_id = o.get("order_id")
    order.filled = filled
    order.price = f(o.get("average_fill_price")) or limit
    order.fee = round(f(o.get("average_fee_paid")) * filled, 2)
    order.cost = round(order.price * filled + order.fee, 2)
    order.status = "filled"
    order.note = "Real order on Kalshi" if live else "Filled on Kalshi demo"


async def place_hedge(merchant_id: str, guarantee_id: Optional[str], ticker: str, count: int, p: float, fee: float,
                      limit: Optional[float] = None) -> HedgeOrder:
    """p = average expected fill price; limit = highest book level needed to fill `count` (walked book)."""
    limit = limit if limit is not None else min(0.99, p + DEPTH_SLIPPAGE)
    order = HedgeOrder(merchant_id=merchant_id, guarantee_id=guarantee_id, ticker=ticker, count=count,
                       price=p, fee=round(fee * count, 2), mode="mock", note="Simulated at live Kalshi price")
    mode = trading_mode()
    if mode in ("kalshi_live", "kalshi_demo"):  # raises HedgeFailed unless fully filled
        await _place_real(order, ticker, count, limit, f"rainly-{guarantee_id or ObjectId()}", live=mode == "kalshi_live")
    res = await db.orders.insert_one(order.to_mongo())
    order.id = str(res.inserted_id)
    return order


async def sync_demo_orders(merchant_id: Optional[str] = None):
    """Pull the latest status of resting/partial Kalshi demo orders and update the order log."""
    if not (KALSHI_ACCESS_KEY and KALSHI_PRIVATE_KEY_PEM):
        return
    q = {"mode": "kalshi_demo", "kalshi_order_id": {"$nin": [None, ""]},
         "status": {"$not": {"$regex": "^(filled|canceled|expired)"}}}
    if merchant_id:
        q["merchant_id"] = merchant_id
    async for doc in db.orders.find(q).limit(50):
        path = f"/portfolio/orders/{doc['kalshi_order_id']}"
        try:
            r = await http.get(KALSHI_DEMO + path, headers=_signed_headers("GET", "/trade-api/v2" + path))
            if r.status_code != 200:
                continue
            o = r.json().get("order") or {}
        except Exception as e:
            logger.warning("order sync failed: %s", e)
            continue
        filled = f(o.get("fill_count_fp"))
        total = f(o.get("initial_count_fp")) or doc["count"]
        ks = o.get("status")
        if ks == "executed" or filled >= total:
            status = "filled"
        elif ks == "canceled":
            status = f"canceled ({filled:g}/{total:g} filled)" if filled else "canceled"
        else:
            status = f"partial {filled:g}/{total:g}" if filled else "resting"
        upd = {"status": status, "filled": filled, "synced_at": now_iso()}
        if filled:
            upd["price"] = round((f(o.get("taker_fill_cost_dollars")) + f(o.get("maker_fill_cost_dollars"))) / filled, 4)
            upd["fee"] = round(f(o.get("taker_fees_dollars")) + f(o.get("maker_fees_dollars")), 2)
        if status.startswith("canceled"):
            upd["note"] = "Canceled on Kalshi demo"
        await db.orders.update_one({"_id": doc["_id"]}, {"$set": upd})
