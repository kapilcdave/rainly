"""Re-pull the Kalshi weather and compute snapshots in research/data/.

Uses only Kalshi's public market-data API (no auth). Run from the repo root:

    python3 research/scripts/pull_kalshi_snapshot.py
"""
import csv
import datetime as dt
import json
import time
import urllib.request

BASE = "https://api.elections.kalshi.com/trade-api/v2"
OUT = "research/data/"
COMPUTE_SERIES = [
    "KXB200MS", "KXH100MAX", "KXH200MAX", "KXB200MAX",
    "KXOPUS48Y", "KXGPT55Y", "KXDRAMAY",
]


def get(path):
    with urllib.request.urlopen(BASE + path) as r:
        return json.load(r)


def open_weather_events():
    events, cursor = [], ""
    while True:
        q = "/events?status=open&limit=200&with_nested_markets=true"
        d = get(q + (f"&cursor={cursor}" if cursor else ""))
        events += [e for e in d.get("events", []) if e.get("category") == "Climate and Weather"]
        cursor = d.get("cursor")
        if not cursor:
            return events
        time.sleep(0.4)


def main():
    today = dt.date.today().isoformat()

    series = get("/series?category=Climate%20and%20Weather")["series"]
    with open(f"{OUT}kalshi_weather_series_{today}.csv", "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["ticker", "title", "frequency", "settlement_source"])
        for s in sorted(series, key=lambda s: s["ticker"]):
            src = (s.get("settlement_sources") or [{}])[0].get("name")
            w.writerow([s["ticker"], s.get("title"), s.get("frequency"), src])

    with open(f"{OUT}kalshi_weather_open_markets_{today}.csv", "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["series", "event", "event_title", "market", "option", "yes_bid", "yes_ask",
                    "last", "volume", "open_interest", "created", "close", "rule"])
        for e in open_weather_events():
            for m in e["markets"]:
                w.writerow([e["series_ticker"], e["event_ticker"], e["title"], m["ticker"],
                            m.get("yes_sub_title"), m.get("yes_bid_dollars"), m.get("yes_ask_dollars"),
                            m.get("last_price_dollars"), m.get("volume_fp"), m.get("open_interest_fp"),
                            m.get("created_time", "")[:16], m.get("close_time", "")[:16],
                            (m.get("rules_primary") or "").replace("\n", " ")])

    with open(f"{OUT}kalshi_compute_open_markets_{today}.csv", "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["series", "event", "market", "option", "yes_bid", "yes_ask", "volume",
                    "open_interest", "close", "rule"])
        for s in COMPUTE_SERIES:
            for m in get(f"/markets?series_ticker={s}&status=open&limit=200").get("markets", []):
                w.writerow([s, m["event_ticker"], m["ticker"], m.get("yes_sub_title"),
                            m.get("yes_bid_dollars"), m.get("yes_ask_dollars"), m.get("volume_fp"),
                            m.get("open_interest_fp"), m.get("close_time", "")[:16],
                            (m.get("rules_primary") or "").replace("\n", " ")])
            time.sleep(0.25)


if __name__ == "__main__":
    main()
