"""Public market data: meta, cities, landing ticker, quotes, QR codes and settlement replay."""
import io
import base64
from datetime import date
from typing import Optional

import qrcode
from fastapi import APIRouter, HTTPException
from fastapi.responses import Response

from core import MAX_P, TICKER_CITIES, BUSINESS_TYPES
from services import kalshi_ws
from services.kalshi import (build_quote, check_kind, date_options, entry_price, event_ticker, f, find_market,
                             get_event_markets, history_24h, kget, parse_code, parse_day, price_quote,
                             settled_markets, today_et, trading_mode, weekend_saturday)

router = APIRouter()


@router.get("/")
async def root():
    return {"app": "Rainly", "mode": trading_mode()}


@router.get("/meta")
async def meta():
    opts = date_options()
    for o in opts:  # open = Kalshi has listed this date's market and it is still trading
        try:
            ms = await get_event_markets(o["kind"], date.fromisoformat(o["date"]))
        except HTTPException:
            ms = None
        o["open"] = bool(ms) and any(m.get("status") in ("active", "open") for m in ms)
    return {"mode": trading_mode(), "mock_trading": trading_mode() == "mock", "max_p": MAX_P,
            "stream": kalshi_ws.status(),
            "business_types": BUSINESS_TYPES, "date_options": opts}


@router.get("/cities")
async def cities():
    t = today_et()
    markets = await get_event_markets("weekend", weekend_saturday(t)) or await get_event_markets("daily", t) or []
    return {"cities": sorted({m.get("yes_sub_title") for m in markets if m.get("yes_sub_title")})}


@router.get("/ticker")
async def ticker():
    sat = weekend_saturday(today_et())
    markets = await get_event_markets("weekend", sat)
    out = []
    for c in TICKER_CITIES:
        m = find_market(markets or [], c)
        prev = f(m.get("previous_yes_ask_dollars")) if m else 0
        p_now = f(m.get("yes_ask_dollars")) if m else 0
        live = kalshi_ws.book(m["ticker"]) if m else None
        if live and live["asks"]:
            p_now = live["asks"][0][0]
        out.append({"city": c, "p": p_now if m else None,
                    "change": round((p_now - prev) * 100) if m and prev > 0 else None,  # points vs ~24h ago
                    "history": await history_24h(m) if m else [],
                    "last": f(m.get("last_price_dollars")) if m else None,
                    "ticker": m.get("ticker") if m else None, "status": m.get("status") if m else None})
    return {"event_ticker": event_ticker("weekend", sat), "weekend_of": sat.isoformat(), "listed": markets is not None, "cities": out}


@router.get("/quote")
async def quote(city: str, booking_value: float, kind: str = "weekend", date_str: Optional[str] = None, margin_pct: float = 20.0):
    check_kind(kind)
    if not (0 < booking_value <= 10000):
        raise HTTPException(400, "booking_value must be between 0 and 10000")
    if not (0 <= margin_pct <= 100):
        raise HTTPException(400, "margin_pct must be between 0 and 100")
    d = parse_day(date_str) or weekend_saturday(today_et())
    return await build_quote(city, kind, d, booking_value, margin_pct)


@router.get("/qr")
async def qr_png(data: str, as_json: bool = False):
    if not data or len(data) > 500:
        raise HTTPException(400, "data must be 1-500 characters")
    img = qrcode.make(data, box_size=10, border=2)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    if as_json:  # base64 for embedding in printable HTML
        return {"png_base64": base64.b64encode(buf.getvalue()).decode()}
    return Response(content=buf.getvalue(), media_type="image/png", headers={"Cache-Control": "public, max-age=86400"})


@router.get("/replay")
async def replay_list(city: str):
    ms = [m for m in await settled_markets() if (m.get("yes_sub_title") or "").lower() == city.lower()]
    items = []
    for m in ms:
        d = parse_code(m["event_ticker"].split("-")[-1])
        if d and m.get("result") in ("yes", "no"):
            items.append({"ticker": m["ticker"], "date": d.isoformat(), "result": m["result"],
                          "rules_primary": m.get("rules_primary"), "expiration_value": m.get("expiration_value")})
    items.sort(key=lambda x: x["date"], reverse=True)
    items = items[:40]
    # Default each tab to the newest date Rainly would actually have sold (entry price within the cap).
    recommended = {}
    for res in ("yes", "no"):
        for it in [i for i in items if i["result"] == res][:10]:
            m = ((await kget(f"/markets/{it['ticker']}", ttl=3600)) or {}).get("market")
            entry = await entry_price(m) if m else None
            if entry is not None and entry <= MAX_P:
                recommended[res] = it["ticker"]
                break
    return {"city": city, "items": items, "recommended": recommended}


@router.get("/replay/detail")
async def replay_detail(ticker: str, bookings: int = 40, booking_value: float = 45, margin_pct: float = 20.0):
    m = ((await kget(f"/markets/{ticker}", ttl=3600)) or {}).get("market")
    if not m:
        raise HTTPException(404, "Market not found")
    entry = await entry_price(m)
    entry_source = "first listed YES ask (hourly candle)"
    if entry is None:
        entry, entry_source = 0.20, "assumed (no price history)"
    q = price_quote(entry, booking_value, margin_pct)
    contracts = q["contracts"] * bookings
    premiums = q["price"] * bookings
    hedge = q["hedge_cost"] * bookings
    rained = m.get("result") == "yes"
    refunds = booking_value * bookings if rained else 0.0
    payout = float(contracts) if rained else 0.0
    d = parse_code(m["event_ticker"].split("-")[-1])
    return {
        "ticker": ticker, "city": m.get("yes_sub_title"), "date": d.isoformat() if d else None,
        "result": m.get("result"), "rules_primary": m.get("rules_primary"),
        "precip_inches": m.get("expiration_value"), "settled_at": m.get("settlement_ts"),
        "entry_p": entry, "entry_source": entry_source, "would_offer": entry <= MAX_P, "bookings": bookings, "booking_value": booking_value,
        "price_each": q["price"], "contracts": contracts, "premiums": round(premiums, 2), "hedge_cost": round(hedge, 2),
        "refunds": round(refunds, 2), "payout": round(payout, 2), "net": round(premiums - hedge - refunds + payout, 2),
    }
