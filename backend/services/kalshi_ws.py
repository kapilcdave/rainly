"""Live Kalshi order books over WebSocket.

One authenticated connection streams `orderbook_delta` for every market Rainly prices (merchant cities
and landing-ticker cities, this weekend + today/tomorrow). Quotes and hedges read the in-memory books;
REST is only the fallback while the stream is down or before a market's snapshot arrives.
"""
import asyncio
import json
import time
from typing import Optional

import websockets

from core import db, logger, KALSHI_PROD_ACCESS_KEY, KALSHI_PROD_PRIVATE_KEY_PEM, TICKER_CITIES

WS_URL = "wss://api.elections.kalshi.com/trade-api/ws/v2"
WS_PATH = "/trade-api/ws/v2"
REFRESH_SECONDS = 300  # re-check which markets to watch (new dates list, new merchants)

_books: dict[str, dict[str, dict[float, float]]] = {}  # ticker -> {"yes": {price: size}, "no": {...}}
_watch: set[str] = set()
_resubscribe = asyncio.Event()
_state = {"connected": False, "last_msg": 0.0}


def enabled() -> bool:
    return bool(KALSHI_PROD_ACCESS_KEY and KALSHI_PROD_PRIVATE_KEY_PEM)


def book(ticker: str) -> Optional[dict]:
    """Live {asks, bids} like the REST orderbook(), or None if the stream doesn't have this market."""
    if not _state["connected"] or ticker not in _books:
        return None
    b = _books[ticker]
    asks = sorted([(round(1 - p, 2), s) for p, s in b["no"].items() if s >= 1], key=lambda x: x[0])
    bids = sorted([(p, s) for p, s in b["yes"].items() if s >= 1], key=lambda x: -x[0])
    return {"asks": asks, "bids": bids}


def watch(ticker: str):
    if enabled() and ticker and ticker not in _watch:
        _watch.add(ticker)
        _resubscribe.set()


def status() -> dict:
    return {"connected": _state["connected"], "markets": len(_books),
            "last_update_s": round(time.time() - _state["last_msg"], 1) if _state["last_msg"] else None}


async def _wanted() -> set[str]:
    from services.kalshi import date_options, find_market, get_event_markets
    from datetime import date
    cities = set(TICKER_CITIES) | set(await db.merchants.distinct("city"))
    out = set()
    for o in date_options():
        try:
            ms = await get_event_markets(o["kind"], date.fromisoformat(o["date"])) or []
        except Exception:
            continue
        for c in cities:
            m = find_market(ms, c)
            if m and m.get("status") in ("active", "open"):
                out.add(m["ticker"])
    return out


def _apply(msg: dict, kind: str):
    m = msg["msg"]
    t = m["market_ticker"]
    if kind == "orderbook_snapshot":
        _books[t] = {side: {float(p): float(s) for p, s in (m.get(f"{side}_dollars_fp") or [])} for side in ("yes", "no")}
    elif t in _books:
        levels = _books[t][m["side"]]
        p = float(m["price_dollars"])
        size = levels.get(p, 0.0) + float(m["delta_fp"])
        if size > 1e-9:
            levels[p] = size
        else:
            levels.pop(p, None)


async def _session(tickers: list[str]):
    from services.kalshi import _signed_headers
    headers = _signed_headers("GET", WS_PATH, live=True)
    headers.pop("Content-Type", None)
    async with websockets.connect(WS_URL, additional_headers=headers, ping_interval=20, max_size=2 ** 22) as ws:
        await ws.send(json.dumps({"id": 1, "cmd": "subscribe",
                                  "params": {"channels": ["orderbook_delta"], "market_tickers": tickers}}))
        _state["connected"] = True
        logger.info("Kalshi stream connected, %d markets", len(tickers))
        seq = None
        while True:
            recv = asyncio.ensure_future(ws.recv())
            change = asyncio.ensure_future(_resubscribe.wait())
            done, pending = await asyncio.wait({recv, change}, timeout=REFRESH_SECONDS, return_when=asyncio.FIRST_COMPLETED)
            for p in pending:
                p.cancel()
            if recv not in done:
                return  # new market to watch, or quiet for a long time: reconnect with a fresh list
            msg = json.loads(recv.result())
            kind = msg.get("type")
            if kind == "error":
                logger.warning("Kalshi stream error: %s", msg.get("msg"))
                continue
            if kind not in ("orderbook_snapshot", "orderbook_delta"):
                continue
            if seq is not None and msg.get("seq") != seq + 1:
                logger.warning("Kalshi stream gap (%s -> %s), resyncing", seq, msg.get("seq"))
                return  # missed an update: reconnect for fresh snapshots
            seq = msg.get("seq")
            _apply(msg, kind)
            _state["last_msg"] = time.time()


async def run():
    """Keep the stream up forever: reconnect with backoff, refresh the watched markets every few minutes."""
    if not enabled():
        logger.info("Kalshi stream off (no production key); using REST")
        return
    backoff = 1
    while True:
        _resubscribe.clear()  # before reading the list, so a watch() arriving meanwhile still triggers a resubscribe
        try:
            _watch.update(await _wanted())
            if not _watch:
                await asyncio.sleep(60)
                continue
            _books.clear()
            await asyncio.wait_for(_session(sorted(_watch)), timeout=REFRESH_SECONDS * 2)
            backoff = 1
        except asyncio.TimeoutError:
            backoff = 1  # scheduled refresh
        except Exception as e:
            logger.warning("Kalshi stream dropped: %s", e)
            backoff = min(backoff * 2, 60)
        finally:
            _state["connected"] = False
        await asyncio.sleep(backoff)
