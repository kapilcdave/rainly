# Emergent build prompt

The prompt used to build Rainly in Emergent (renamed from RainSure). The app's current state is in [`memory/PRD.md`](../memory/PRD.md).

**Not built yet:** merchants connecting their own Kalshi keys (see [05](05-why-rainly-vs-self-hedging.md)). The app currently uses one server-wide demo key from environment variables.

```
Build "Rainly": a web app (mobile-first responsive) that lets small outdoor businesses offer customers a "rain refund" at checkout, priced live from Kalshi rain markets and hedged automatically on Kalshi.

## Core concept
- Merchant (e.g. a patio restaurant) offers customers an add-on: "Rain refund +$X — if it rains on your date, you get your booking back."
- Rainly prices that add-on from the live Kalshi probability of rain, sells it, buys matching Kalshi YES contracts ($1 payout each), and when the market settles YES, refunds are triggered automatically.
- The refund trigger is the SAME official station data the Kalshi contract settles on, so the hedge is exact (no basis risk). Show this on screen.

## Kalshi API (public market data, no auth needed)
Base: https://api.elections.kalshi.com/trade-api/v2
- Weekend rain (Sat OR Sun, listed every Monday): GET /events/KXRAINWKND-{YYMONDD of Saturday}?with_nested_markets=true   e.g. KXRAINWKND-26OCT24
- Daily rain (listed ~1 day ahead): GET /events/KXRAIN-{YYMONDD}?with_nested_markets=true   e.g. KXRAIN-26OCT25
- Each event has ~35 city markets. Identify the city by the market's `yes_sub_title` (e.g. "Chicago") — do NOT hardcode ticker suffixes.
- Market fields are strings: `yes_ask_dollars`, `yes_bid_dollars`, `last_price_dollars`, `volume_fp`, `open_interest_fp`, `status`, `result` ("yes"/"no" when settled), `rules_primary` (show this text as the official trigger).
- Order book depth: GET /markets/{ticker}/orderbook → `orderbook_fp.yes_dollars` and `orderbook_fp.no_dollars` are BID lists of [price, size], ascending (best = last). Best YES ask = 1 − best NO bid. Sizes available at the YES ask come from the NO bids.
- Settled history for the replay screen: GET /markets?series_ticker=KXRAIN&status=settled&limit=200
- Contract rule: resolves YES if total precipitation at the city's official station is > 0 inches that day (weekend: on either day).

## Order placement
- Use Kalshi DEMO environment for orders: https://demo-api.kalshi.co/trade-api/v2 (POST /portfolio/orders, signed headers KALSHI-ACCESS-KEY / KALSHI-ACCESS-TIMESTAMP / KALSHI-ACCESS-SIGNATURE per Kalshi docs).
- All signing happens SERVER-SIDE. API key + private key live in backend env vars only, never sent to the browser.
- Add a MOCK_TRADING=true toggle (default ON) that simulates fills at the live ask so the demo never breaks.

## Pricing
- p = live yes_ask for that city/date
- fee_per_contract = 0.07 * p * (1 - p)   (Kalshi taker fee)
- guarantee_price = booking_value * (p + fee_per_contract) * 1.20   (20% margin), minimum $1
- contracts_needed = ceil(booking_value)   (each contract pays $1)
- Unavailable if p > 0.60 ("High rain chance — refund not offered") or if the market isn't listed yet ("Opens Monday" for weekends).
- Before buying, check order book depth; if not enough size at <= p + 0.03, show a warning.

## Screens
1. Landing: Rainly hero, "Rain shouldn't cost you customers", how-it-works in 3 steps, live ticker of rain odds in 5 cities.
2. Merchant onboarding: business name, type (patio restaurant, food truck, outdoor event, boat tour, car wash, mini golf), city (dropdown populated from live Kalshi city list), average booking value.
3. Customer checkout widget (phone-sized card): pick date → shows "Rain chance 12% · Rain refund $5.70" → toggle on → confirm. Shows official trigger text from `rules_primary`.
4. Merchant dashboard: guarantees sold, total refunds promised, contracts held, hedge cost, "If it rains / If it doesn't" P&L cards, live price + order book depth for their city, hedge order log.
5. Settlement replay: pick a past settled date where the city resolved YES; animate: market settled YES → N refunds issued → hedge paid $N → merchant net. Also show a NO example.
6. Pitch footer: "Settled on official Weather Company / NWS station data via Kalshi, a CFTC-regulated exchange. Rain refund is a promotion offered by the merchant."

## Seed demo data
- Merchant: "Maria's Patio Taqueria", Chicago, avg booking $45, 40 weekend bookings with guarantees.
- Second merchant: "Bayfront Boat Tours", Miami.

## Style
Clean, friendly, rain/blue palette with sunny yellow accent, big numbers, works at 375px width. No login required for the demo (merchant picker instead).
```
