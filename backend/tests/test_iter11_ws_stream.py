# Iteration 11: Kalshi WebSocket order book stream — read-only checks (NO orders, NO POST /api/guarantees)
import os
import time
import pytest
import requests

BASE_URL = (os.environ.get("EXPO_PUBLIC_BACKEND_URL") or os.environ.get("EXPO_BACKEND_URL") or "").rstrip("/")
KALSHI_REST = "https://api.elections.kalshi.com/trade-api/v2"
MERCHANT_ID = "6add11451f0373a8576b5b40"
QUOTE = "/api/quote?city=Chicago&kind=weekend&date_str=2026-10-24&booking_value="


def _rest_book(ticker):
    ob = requests.get(f"{KALSHI_REST}/markets/{ticker}/orderbook", timeout=10).json().get("orderbook_fp") or {}
    asks = sorted([(round(1 - float(p), 2), float(s)) for p, s in (ob.get("no_dollars") or []) if float(s) >= 1])
    bids = sorted([(float(p), float(s)) for p, s in (ob.get("yes_dollars") or []) if float(s) >= 1], key=lambda x: -x[0])
    return {"asks": asks, "bids": bids}


# Stream status exposed in /api/meta
class TestStreamMeta:
    def test_meta_stream_connected(self):
        s = requests.get(f"{BASE_URL}/api/meta", timeout=20).json()["stream"]
        assert s["connected"] is True
        assert s["markets"] > 0
        assert s["last_update_s"] is not None and s["last_update_s"] < 60

    def test_stream_stays_up_over_time(self):
        seen = []
        for _ in range(4):
            seen.append(requests.get(f"{BASE_URL}/api/meta", timeout=20).json()["stream"])
            time.sleep(5)
        assert all(x["connected"] for x in seen), seen
        assert all(x["markets"] > 0 for x in seen), seen


# Quotes priced from the streamed book
class TestStreamQuotes:
    def test_quote_small_uses_stream(self):
        q = requests.get(f"{BASE_URL}{QUOTE}7", timeout=20).json()
        assert q["price_source"] == "stream"
        if q["available"]:
            assert q["depth_ok"] is True and q["price"] >= 1.0 and 0 < q["p"] < 1
        else:
            assert q["reason"]

    def test_quote_large_walked_book_gate(self):
        # iter12: depth-within-3c gate replaced by walk_book up to 60c; $45 weekend walks to ~34c (~$14) > $10 cap
        q = requests.get(f"{BASE_URL}{QUOTE}45", timeout=20).json()
        assert q["price_source"] == "stream"
        assert q["available"] is False
        assert q["reason"] in ("Not enough sellers on Kalshi right now",
                               "Too large for today's hedge budget — try a smaller booking or another date")
        if q.get("limit") is not None:
            assert q["p"] <= q["limit"] <= 0.60

    def test_quote_yes_ask_matches_dashboard_best_ask(self):
        q = requests.get(f"{BASE_URL}{QUOTE}7", timeout=20).json()
        d = requests.get(f"{BASE_URL}/api/merchants/{MERCHANT_ID}/dashboard", timeout=20).json()
        if d["live"].get("ticker") == q["ticker"] and d["orderbook"]["asks"]:
            assert abs(d["orderbook"]["asks"][0][0] - q["yes_ask"]) <= 0.02


# Streamed dashboard book vs Kalshi REST book
class TestBookConsistency:
    def test_dashboard_book_matches_rest(self):
        d = requests.get(f"{BASE_URL}/api/merchants/{MERCHANT_ID}/dashboard", timeout=20).json()
        ticker = d["live"].get("ticker")
        if not ticker:
            pytest.skip("no live ticker")
        rest = _rest_book(ticker)
        ours = d["orderbook"]
        assert ours["asks"], "stream book has no asks"
        assert abs(ours["asks"][0][0] - rest["asks"][0][0]) <= 0.02, (ours["asks"][:3], rest["asks"][:3])
        if rest["bids"] and ours["bids"]:
            assert abs(ours["bids"][0][0] - rest["bids"][0][0]) <= 0.02
        # price levels within the top 8 should mostly overlap
        ours_p = {p for p, _ in ours["asks"]}
        rest_p = {p for p, _ in rest["asks"][:8]}
        assert len(ours_p & rest_p) >= max(1, len(rest_p) // 2), (ours["asks"], rest["asks"][:8])


# Landing ticker reads streamed books
class TestTicker:
    def test_ticker_shape(self):
        t = requests.get(f"{BASE_URL}/api/ticker", timeout=30).json()
        assert t["cities"]
        listed = [c for c in t["cities"] if c["ticker"]]
        assert listed and all(c["p"] is None or 0 <= c["p"] <= 1 for c in listed)

    def test_ticker_latency_ok_for_3s_poll(self):
        t0 = time.time()
        r = requests.get(f"{BASE_URL}/api/ticker", timeout=30)
        assert r.status_code == 200
        assert time.time() - t0 < 3.0, "ticker slower than its poll interval"
