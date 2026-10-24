# RainSure — PRD

## Original problem statement
Build "Rainsure": a web app (mobile-first responsive) that lets small outdoor businesses offer customers a "rain refund" at checkout, priced live from Kalshi rain markets and hedged automatically on Kalshi. Merchant offers "Rain refund +$X — if it rains on your date, you get your booking back." Price from live Kalshi probability, buy matching YES contracts ($1 payout each), auto-refund when market settles YES. Refund trigger = same official station data the contract settles on (no basis risk), shown on screen.
Kalshi public data: /events/KXRAINWKND-{Sat}, /events/KXRAIN-{date}, /markets/{ticker}/orderbook (best YES ask = 1 − best NO bid), settled history via /markets?series_ticker=...&status=settled. Identify city by yes_sub_title. Orders: production Kalshi (user: "dont do demo ship with prod"), signed server-side, MOCK_TRADING toggle.
Pricing: p = live yes_ask; fee = 0.07·p·(1−p); guarantee_price = booking_value·(p+fee)·1.20, min $1; contracts = ceil(booking_value); unavailable if p > 0.60 ("High rain chance — refund not offered") or not listed ("Opens Monday" for weekends); depth warning if not enough size at ≤ p + 0.03.
Screens: Landing (hero, 3 steps, 5-city ticker), Merchant onboarding (name, type, live Kalshi city, avg booking), Checkout widget (phone card, date → rain chance + refund, toggle, confirm, rules_primary), Merchant dashboard (guarantees sold, refunds promised, contracts held, hedge cost, If it rains / If it doesn't P&L, live price + order book depth, hedge order log), Settlement replay (YES and NO examples, animated), Pitch footer.
Seed: Maria's Patio Taqueria (Chicago, $45, 40 weekend guarantees), Bayfront Boat Tours (Miami). Style: originally rain/blue + sunny yellow; user later asked for dark, premium, minimal fintech. Works at 375px. No login (merchant picker).

## User choices
- App renamed to "Rainly" (2026-10-24)
- Real production Kalshi orders, simulated at live ask until API keys are added
- Price = contracts × (rain odds + fee) × 1.20
- Dark, premium, minimal look

## Architecture
- Backend FastAPI: `kalshi.py` (cached public client, orderbook→asks, RSA-PSS signer, place_yes_order FOK limit at p+0.03; simulated when no KALSHI_API_KEY_ID/KALSHI_PRIVATE_KEY or MOCK_TRADING=true), `server.py` (quotes, checkout options, merchants, guarantees, dashboard, replay, startup seed, 10-min settlement loop + on dashboard load)
- Mongo collections: merchants, guarantees, orders
- Frontend React + react-query, Geist/Geist Mono, pages Landing/Onboarding/Checkout/Dashboard/Replay

## Implemented (2026-10-24)
- All 6 screens, live Kalshi data, pricing rules, depth warning, auto settlement (Bayfront seed shows 12 refunded from a past YES Miami weekend)
- Dark minimal redesign
- Fixes after test iteration 1: checkout reset bug, quote validation, orderbook 404, replay "not offered >60%" flag, hedge log collapse

## Backlog
- P0: add Kalshi production API key (KALSHI_API_KEY_ID, KALSHI_PRIVATE_KEY) to turn on live orders; verify /portfolio/orders vs /portfolio/events/orders on the account
- P1: actual customer refund payout (payments), embeddable widget snippet for merchant sites
- P2: replay default to an offered (≤60%) YES date, per-customer refund notifications
