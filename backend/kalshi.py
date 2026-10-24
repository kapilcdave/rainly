import asyncio
import base64
import os
import time
from urllib.parse import urlsplit

import httpx
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, ed25519, rsa

PUBLIC_URL = os.environ["KALSHI_PUBLIC_URL"]
ENV_URLS = {"demo": os.environ["KALSHI_DEMO_URL"], "live": os.environ["KALSHI_LIVE_URL"]}

# city -> {kind: series_ticker}
CITY_SERIES = {
    "New York": {"heat": "KXHIGHNY", "cold": "KXLOWTNYC", "rain": "KXRAINNYCM"},
    "Chicago": {"heat": "KXHIGHCHI", "cold": "KXLOWTCHI", "rain": "KXRAINCHIM", "snow": "KXCHISNOWM"},
    "Miami": {"heat": "KXHIGHMIA", "cold": "KXLOWTMIA", "rain": "KXRAINMIAM"},
    "Austin": {"heat": "KXHIGHAUS", "cold": "KXLOWAUS", "rain": "KXRAINAUSM"},
    "Houston": {"heat": "KXHIGHTHOU", "rain": "KXRAINHOUM"},
    "Dallas": {"heat": "KXHIGHTDAL"},
    "Denver": {"heat": "KXHIGHDEN"},
    "Los Angeles": {"heat": "KXHIGHLAX", "rain": "KXRAINLAXM"},
    "San Francisco": {"heat": "KXHIGHTSFO", "rain": "KXRAINSFOM"},
    "Seattle": {"heat": "KXHIGHTSEA", "cold": "KXLOWTSEA", "rain": "KXRAINSEAM"},
    "Philadelphia": {"heat": "KXHIGHPHIL", "cold": "KXLOWPHIL"},
    "Boston": {"heat": "KXHIGHTBOS"},
    "Washington DC": {"heat": "KXHIGHTDC"},
    "Atlanta": {"heat": "KXHIGHTATL", "cold": "KXLOWTATL"},
    "Las Vegas": {"heat": "KXHIGHTLV", "cold": "KXLOWTLV"},
    "Phoenix": {"heat": "KXHIGHTPHX", "cold": "KXLOWTPHX"},
}
KIND_LABEL = {"heat": "Daily high temperature", "cold": "Daily low temperature", "rain": "Monthly rainfall", "snow": "Monthly snowfall"}

_cache: dict = {}
_sem = asyncio.Semaphore(8)
TTL = 60


def _f(v):
    try:
        return float(v) if v not in (None, "") else None
    except (TypeError, ValueError):
        return None


async def public_get(path: str, params: dict | None = None):
    key = (path, tuple(sorted((params or {}).items())))
    hit = _cache.get(key)
    if hit and time.time() - hit[0] < TTL:
        return hit[1]
    async with _sem:
        async with httpx.AsyncClient(timeout=15) as c:
            r = await c.get(PUBLIC_URL + path, params=params)
    r.raise_for_status()
    data = r.json()
    _cache[key] = (time.time(), data)
    return data


def normalize(m: dict, city: str | None = None, kind: str | None = None) -> dict:
    return {
        "ticker": m["ticker"],
        "event_ticker": m.get("event_ticker"),
        "city": city,
        "kind": kind,
        "kind_label": KIND_LABEL.get(kind, "Weather"),
        "title": m.get("title"),
        "outcome": m.get("yes_sub_title") or m.get("subtitle") or "",
        "strike_type": m.get("strike_type"),
        "floor_strike": m.get("floor_strike"),
        "cap_strike": m.get("cap_strike"),
        "yes_ask": _f(m.get("yes_ask_dollars")),
        "yes_bid": _f(m.get("yes_bid_dollars")),
        "no_ask": _f(m.get("no_ask_dollars")),
        "no_bid": _f(m.get("no_bid_dollars")),
        "last_price": _f(m.get("last_price_dollars")),
        "volume": _f(m.get("volume_fp")),
        "close_time": m.get("close_time"),
        "status": m.get("status"),
        "result": m.get("result") or "",
        "rules_primary": m.get("rules_primary", ""),
        "rules_secondary": m.get("rules_secondary", ""),
    }


async def series_markets(city: str, kind: str, series: str):
    try:
        data = await public_get("/markets", {"series_ticker": series, "status": "open", "limit": 200})
    except httpx.HTTPError:
        return []
    return [normalize(m, city, kind) for m in data.get("markets", [])]


async def weather_markets(city: str | None = None, kind: str | None = None):
    jobs = []
    for c, kinds in CITY_SERIES.items():
        if city and c != city:
            continue
        for k, s in kinds.items():
            if kind and k != kind:
                continue
            jobs.append(series_markets(c, k, s))
    results = await asyncio.gather(*jobs)
    out = [m for r in results for m in r]
    out.sort(key=lambda m: (m["city"], m["kind"], m["close_time"] or "", m["floor_strike"] or m["cap_strike"] or 0))
    return out


def city_kind_for_ticker(ticker: str):
    series = ticker.split("-")[0]
    for c, kinds in CITY_SERIES.items():
        for k, s in kinds.items():
            if s == series:
                return c, k
    return None, None


async def market_detail(ticker: str, fresh: bool = False):
    if fresh:
        _cache.pop((f"/markets/{ticker}", ()), None)
    data = await public_get(f"/markets/{ticker}")
    city, kind = city_kind_for_ticker(ticker)
    m = normalize(data["market"], city, kind)
    try:
        s = await public_get(f"/series/{ticker.split('-')[0]}")
        ser = s.get("series", {})
        m["settlement_sources"] = ser.get("settlement_sources", [])
        m["contract_url"] = ser.get("contract_terms_url") or ser.get("contract_url")
    except httpx.HTTPError:
        m["settlement_sources"] = []
        m["contract_url"] = None
    return m


class KalshiClient:
    def __init__(self, environment: str, key_id: str, private_pem: str):
        self.base_url = ENV_URLS[environment]
        self.path_prefix = urlsplit(self.base_url).path
        self.key_id = key_id
        self.key = serialization.load_pem_private_key(private_pem.encode(), password=None)
        if not isinstance(self.key, (rsa.RSAPrivateKey, ed25519.Ed25519PrivateKey)):
            raise ValueError("Key must be RSA or Ed25519")

    def _sign(self, msg: bytes) -> bytes:
        if isinstance(self.key, ed25519.Ed25519PrivateKey):
            return self.key.sign(msg)
        return self.key.sign(
            msg,
            padding.PSS(mgf=padding.MGF1(hashes.SHA256()), salt_length=padding.PSS.DIGEST_LENGTH),
            hashes.SHA256(),
        )

    def _headers(self, method: str, path: str):
        ts = str(int(time.time() * 1000))
        full = self.path_prefix + urlsplit(path).path
        sig = self._sign(f"{ts}{method.upper()}{full}".encode())
        return {
            "KALSHI-ACCESS-KEY": self.key_id,
            "KALSHI-ACCESS-TIMESTAMP": ts,
            "KALSHI-ACCESS-SIGNATURE": base64.b64encode(sig).decode(),
        }

    async def request(self, method: str, path: str, **kw):
        async with httpx.AsyncClient(timeout=15) as c:
            r = await c.request(method, self.base_url + path, headers=self._headers(method, path), **kw)
        if r.status_code >= 400:
            raise RuntimeError(f"Kalshi {r.status_code}: {r.text[:300]}")
        return r.json()

    async def balance(self):
        return await self.request("GET", "/portfolio/balance")

    async def buy(self, ticker: str, side: str, contracts: int, price: float, client_order_id: str):
        # Buying NO == selling YES at (1 - no price) on the V2 book.
        book_side, yes_price = ("bid", price) if side == "yes" else ("ask", round(1 - price, 4))
        body = {
            "ticker": ticker,
            "side": book_side,
            "count": f"{contracts:.2f}",
            "price": f"{yes_price:.4f}",
            "time_in_force": "immediate_or_cancel",
            "client_order_id": client_order_id,
            "post_only": False,
            "reduce_only": False,
            "cancel_order_on_pause": True,
            "self_trade_prevention_type": "taker_at_cross",
        }
        return await self.request("POST", "/portfolio/events/orders", json=body)
