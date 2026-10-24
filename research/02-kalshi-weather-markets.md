# Kalshi rain and disaster markets

Pulled from Kalshi's public API on 2026-10-24: **458 weather series, 261 open events.** Raw snapshots are in [data/](data/).

## Rain

| Contract | Series | Pays YES if | Listed | Activity (10-24) |
|---|---|---|---|---|
| Daily: "Where will it rain on [date]?" | `KXRAIN` | > 0 inches at the city's station that day | ~1 day ahead (09:00 UTC the day before) | ~224k contracts traded on the Oct 24 event; the most active rain market |
| Weekend: "Where will it rain this weekend?" | `KXRAINWKND` | > 0 inches on Saturday or Sunday | The Monday before | ~86k contracts on Oct 24–25 |
| Monthly totals per city | `KXRAIN<CITY>M`, e.g. `KXRAINLAXM` | Month total above 1, 2, … 7 inches | ~1 month ahead (November already open) | LA 143k for October; most cities 10–25k |
| One-offs | `KXRAINNAPAM`, `KXRAINSNYC`, `KXRAINHOLIDAY` | Napa Nov–Mar season total; "NYC rainstorm > 5 in. over 2 days"; holiday rain | varies | small |

**Daily and weekend cities (35):** NYC, Chicago, Austin, Miami, Denver, Philadelphia, Los Angeles, Las Vegas, New Orleans, San Francisco, Washington DC, Seattle, Boston, Phoenix, Atlanta, Minneapolis, Dallas, San Antonio, Houston, Oklahoma City, Newark, Trenton, Detroit, Milwaukee, Lexington, Columbus, Providence, College Station, Pittsburgh, Albuquerque, Springfield, Indianapolis, St. Louis, Tampa, West Palm Beach.

The daily rain series has settled history back to mid-July 2026 (96 settled events as of 10-24).

### Example rule text (from `rules_primary`)

> If the total precipitation at CLINYC in New York City in Oct 24, 2026 is strictly greater than 0 inches, then the market resolves to Yes.

> If the total precipitation at CLINYC in New York City on any day within October 24, 2026 through October 25, 2026 is strictly greater than 0 inches, then the market resolves to Yes.

## Natural disasters

- **Hurricane landfall:** Florida Cat 4+, Northeast Cat 3+, Tampa Cat 3/4/5, Hawaii, North Carolina.
- **Per named storm:** category (`KXHURCAT-26<NAME>`).
- **Season counts:** Atlantic hurricanes, major hurricanes, tropical storms; Pacific named storms.
- **Earthquakes:** magnitude 8.0+ in California before 2027 (515k contracts traded, the largest in this group); Japan 8.0+ before 2030; biggest quake each day.
- **Monthly US tornado count**, volcano eruptions (VEI 4, supervolcano).
- **"Natural disaster hits <city>"** series exist for Houston, Miami, LA, SF, St. Louis, New Orleans, and others, but none currently has a listing.

## Other weather contracts a business could use

- Daily high and low temperature for ~20 US cities, plus hourly and weekly temperature.
- Monthly snow by city; ski-resort snowfall and opening dates.
- Cincinnati heating degree days.

## How a contract works

- Each contract pays **$1** if it resolves YES. The price is the market's probability (e.g. Denver rain on Oct 25: 59–63¢; Miami: 89–91¢).
- **Taker fee:** about `0.07 × price × (1 − price)` per contract, rounded up. That's at most about 1.75¢, at a 50¢ price.
- **One station per city.** NYC = Central Park (CLINYC); LA = the LAX station (CLILAX). Kalshi moved settlement data to The Weather Company on 2026-08-28, after a suspected tampering case at a Paris weather station.
- **Liquidity is thin.** Near the current price, books hold a few hundred contracts: a few hundred dollars of payout per city per day. A $5k order would move the price against you.

## Problems for a small-business hedge

1. **Price equals the forecast.** Daily rain lists ~24 hours out, so "rain tomorrow" costs whatever the forecast says. At a 90% forecast, $1 of protection costs ~90¢. You can only hedge forecast surprises, not the season. Monthly contracts list a month out and price closer to climatology, but pay on total inches, which isn't how businesses lose.
2. **Contracts don't match how businesses lose.** There is no rain-in-certain-hours contract (Kalshi's own example is a crew pouring concrete at 3pm), no count of rain days per month, and no "rainy Saturdays in July." The weekend contract is the best fit for patios and events.
3. **Coverage:** 35 cities, one station each.

Rainly gets around 1 and 2 by hedging the **refund promise** instead of the business's loss: the refund triggers on the same station data the contract settles on, so the hedge is exact.

## API notes (for builders)

- Base: `https://api.elections.kalshi.com/trade-api/v2`. Market data needs no auth.
- Event: `GET /events/KXRAINWKND-26OCT24?with_nested_markets=true` (weekend events are named by the Saturday's date). Daily: `KXRAIN-26OCT25`.
- Find a city by the market's `yes_sub_title` (e.g. "Chicago"). Don't hardcode ticker suffixes.
- Number fields are **strings** with new names: `yes_ask_dollars`, `yes_bid_dollars`, `last_price_dollars`, `volume_fp`, `open_interest_fp`, `volume_24h_fp`. The old `volume` / `open_interest` integer fields read as 0.
- Order book: `GET /markets/{ticker}/orderbook` returns `orderbook_fp.yes_dollars` and `orderbook_fp.no_dollars`, both **bid** lists of `[price, size]`, ascending (best = last). The best YES ask is `1 − best NO bid`.
- Settled history: `GET /markets?series_ticker=KXRAIN&status=settled&limit=200`; `result` is `"yes"` or `"no"`.
- Orders go to the demo environment `https://demo-api.kalshi.co/trade-api/v2` with signed headers `KALSHI-ACCESS-KEY`, `KALSHI-ACCESS-TIMESTAMP`, `KALSHI-ACCESS-SIGNATURE`. Sign server-side only.

## Sources

- [Kalshi weather hub](https://kalshi.com/hub/weather) · [Kalshi rain contract terms (PDF)](https://assets.kalshi.com/regulatory/product-certifications/RAINGLOBALPERIOD.pdf) · [CFTC filing](https://www.cftc.gov/filings/orgrules/rules08242619356.pdf)
- [Artemis, Kalshi × Weather Company](https://artemis.bm/news/prediction-market-kalshi-partners-with-the-weather-company-for-weather-hedge-settlements) · [Insurance Journal](https://www.insurancejournal.com/news/international/2026/08/28/883211.htm)
