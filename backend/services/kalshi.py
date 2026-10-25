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

_cache: dict[str, tuple[float, Any]] = {}


async def kget(path: str, params: Optional[dict] = None, ttl: int = 15):
    key = path + str(sorted((params or {}).items()))
    hit = _cache.get(key)
    if hit and time.time() - hit[0] < ttl:
        return hit[1]
    try:
        r = await http.get(KALSHI_PUBLIC + path, params=params)
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


def date_options() -> list[dict]:
    t = today_et()
    sat = weekend_saturday(t)
    nxt = sat + timedelta(days=7)
    tom = t + timedelta(days=1)
    return [
        {"kind": "weekend", "date": sat.isoformat(), "label": wk_label(sat)},
        {"kind": "weekend", "date": nxt.isoformat(), "label": wk_label(nxt)},
        {"kind": "daily", "date": t.isoformat(), "label": f"Today {t.strftime('%b %-d')}"},
        {"kind": "daily", "date": tom.isoformat(), "label": f"Tomorrow {tom.strftime('%b %-d')}"},
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
    data = await kget(f"/markets/{ticker}/orderbook", ttl=10) or {}
    ob = data.get("orderbook_fp") or {}
    yes_bids = [(f(p), f(s)) for p, s in (ob.get("yes_dollars") or [])]
    no_bids = [(f(p), f(s)) for p, s in (ob.get("no_dollars") or [])]
    # YES asks come from NO bids: ask = 1 - no_bid. Best NO bid is last.
    asks = sorted([(round(1 - p, 2), s) for p, s in no_bids if s >= 1], key=lambda x: x[0])
    bids = sorted([b for b in yes_bids if b[1] >= 1], key=lambda x: -x[0])
    return {"asks": asks, "bids": bids}


def price_quote(p: float, booking_value: float, margin_pct: float) -> dict:
    fee = 0.07 * p * (1 - p)
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
    p = f(m.get("yes_ask_dollars"))
    info = {
        **base,
        "ticker": m["ticker"],
        "title": m.get("title"),
        "rules_primary": m.get("rules_primary"),
        "status": m.get("status"),
        "result": m.get("result") or None,
        "yes_ask": p,
        "yes_bid": f(m.get("yes_bid_dollars")),
        "last_price": f(m.get("last_price_dollars")),
        "volume": f(m.get("volume_fp")),
        "open_interest": f(m.get("open_interest_fp")),
        "close_time": m.get("close_time"),
    }
    if m.get("status") not in ("active", "open"):
        return {**info, "reason": "Rain already recorded — closed" if m.get("result") == "yes" else "Market closed"}
    if p <= 0 or p >= 1:
        return {**info, "reason": "No sellers right now"}
    if p > MAX_P:
        return {**info, "reason": "High rain risk — not offered"}
    q = price_quote(p, booking_value, margin_pct)
    if trading_mode() == "kalshi_live":
        spent = await spent_today()
        est = q["contracts"] * min(0.99, p + DEPTH_SLIPPAGE) * 1.07 + 0.01  # worst-case fill incl. fees
        if spent + est > DAILY_HEDGE_CAP:
            return {**info, **q, "reason": "Today's hedge budget is used up — back tomorrow"}
    ob = await orderbook(m["ticker"])
    limit = p + DEPTH_SLIPPAGE + 1e-9
    depth = sum(s for a, s in ob["asks"] if a <= limit)
    if trading_mode() == "kalshi_live" and depth < q["contracts"]:  # a real hedge would not fill
        return {**info, **q, "depth_within_3c": round(depth, 2), "depth_ok": False,
                "reason": "Not enough sellers on Kalshi right now"}
    return {**info, **q, "available": True, "depth_within_3c": round(depth, 2),
            "depth_ok": depth >= q["contracts"], "reason": None}


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


async def _place_live(order: HedgeOrder, ticker: str, count: int, p: float, cid: str):
    """Real-money buy on Kalshi production. Fill-or-kill: fully hedged or nothing, never left resting."""
    path = "/portfolio/events/orders"
    limit = min(0.99, max(0.01, math.ceil(round((p + DEPTH_SLIPPAGE) * 100, 4)) / 100))
    worst = round(count * limit * 1.07, 2) + 0.01  # Kalshi rounds fees up to the cent
    payload = {"ticker": ticker, "client_order_id": cid, "side": "bid", "count": f"{count:.2f}",
               "price": f"{limit:.4f}", "time_in_force": "fill_or_kill",
               "self_trade_prevention_type": "taker_at_cross"}
    async with _live_lock:
        if await spent_today() + worst > DAILY_HEDGE_CAP:
            raise HedgeFailed("Today's hedge budget is used up — back tomorrow")
        try:
            r = await http.post(KALSHI_PUBLIC + path, headers=_signed_headers("POST", "/trade-api/v2" + path, live=True), json=payload)
        except Exception as e:
            # Kalshi may have accepted it: record the worst-case cost so the cap still holds, flag for review.
            logger.error("Kalshi live order outcome unknown (%s): %s", cid, e)
            await db.orders.insert_one({**order.to_mongo(), "mode": "kalshi_live", "status": "unknown", "cost": worst,
                                        "note": f"Connection lost — check Kalshi for order {cid}"})
            raise HedgeFailed("Couldn't confirm the hedge with Kalshi — please try again")
    if r.status_code not in (200, 201):
        logger.warning("Kalshi live order rejected %s %s", r.status_code, r.text[:300])
        raise HedgeFailed("No sellers at the live price right now — no charge, please try again")
    o = r.json()
    filled = f(o.get("fill_count"))
    if filled < count:
        raise HedgeFailed("No sellers at the live price right now — no charge, please try again")
    order.mode = "kalshi_live"
    order.kalshi_order_id = o.get("order_id")
    order.filled = filled
    order.price = f(o.get("average_fill_price")) or limit
    order.fee = round(f(o.get("average_fee_paid")) * filled, 2)
    order.cost = round(order.price * filled + order.fee, 2)
    order.status = "filled"
    order.note = "Real order on Kalshi"


async def place_hedge(merchant_id: str, guarantee_id: Optional[str], ticker: str, count: int, p: float, fee: float) -> HedgeOrder:
    order = HedgeOrder(merchant_id=merchant_id, guarantee_id=guarantee_id, ticker=ticker, count=count,
                       price=p, fee=round(fee * count, 2), mode="mock", note="Simulated at live Kalshi price")
    if trading_mode() == "kalshi_live":
        await _place_live(order, ticker, count, p, f"rainly-{guarantee_id or ObjectId()}")  # raises HedgeFailed
    elif trading_mode() == "kalshi_demo":
        path = "/portfolio/events/orders"  # Create Order V2 (legacy /portfolio/orders is deprecated)
        signed_path = "/trade-api/v2" + path
        cid = f"rainly-{guarantee_id or ObjectId()}"
        limit = min(0.99, max(0.01, math.ceil(round((p + DEPTH_SLIPPAGE) * 100, 4)) / 100))
        payload = {"ticker": ticker, "client_order_id": cid, "side": "bid", "count": f"{count:.2f}",
                   "price": f"{limit:.4f}", "time_in_force": "good_till_canceled",
                   "self_trade_prevention_type": "taker_at_cross"}
        try:
            r = await http.post(KALSHI_DEMO + path, headers=_signed_headers("POST", signed_path), json=payload)
            if r.status_code in (200, 201):
                o = r.json()
                filled = f(o.get("fill_count"))
                order.kalshi_order_id = o.get("order_id")
                order.mode = "kalshi_demo"
                if filled > 0:
                    order.price = f(o.get("average_fill_price")) or p
                    order.fee = round(f(o.get("average_fee_paid")) * filled, 2)
                    order.status = "filled" if filled >= count else f"partial {filled:g}/{count}"
                else:
                    # Demo books are often empty: the limit bid rests on the demo exchange until a seller arrives.
                    order.price = limit
                    order.fee = 0.0
                    order.status = "resting"
                    order.note = f"Resting limit bid at {round(limit * 100)}¢ on Kalshi demo"
            else:
                order.note = f"Demo rejected ({r.status_code}); simulated fill at live ask"
                logger.warning("Kalshi demo order rejected %s %s", r.status_code, r.text[:300])
        except Exception as e:  # network / key errors → simulated fill so the demo never breaks
            order.note = "Demo unreachable; simulated fill at live ask"
            logger.warning("Kalshi demo order failed: %s", e)
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
