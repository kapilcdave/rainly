# Rainly — PRD

## Original problem statement
Build "Rainly": mobile-first app that lets small outdoor businesses offer customers a "rain refund" at checkout, priced live from Kalshi rain markets (KXRAINWKND weekend / KXRAIN daily, public API) and hedged automatically on Kalshi (demo env, server-side RSA-PSS signing, MOCK_TRADING toggle). Pricing: p = live yes_ask, fee = 0.07·p·(1−p), contracts = ceil(booking), unavailable if p > 0.60 or not listed ("Opens Monday"), depth check within p+0.03. Screens: Landing (hero, how it works, 5-city live ticker), Merchant onboarding, Customer checkout widget, Merchant dashboard (P&L, order book, hedge log), Settlement replay (YES and NO), pitch footer. Seed: Maria's Patio Taqueria (Chicago, $45, 40 weekend guarantees), Bayfront Boat Tours (Miami). Rain/blue palette, 375px, no login. The logo is the user's umbrella bar-chart SVG, shown in the app's blue.

## User choices
- Name: Rainly
- Pricing: hedge cost + fees, and each merchant picks a 20% margin or at cost (0%). Minimum price $1.
- Trading: mock fills by default. Real Kalshi demo orders are used when KALSHI_ACCESS_KEY and KALSHI_PRIVATE_KEY_PEM are set and MOCK_TRADING=false. If a demo order fails, it falls back to a mock fill.

## Architecture
- Backend: FastAPI (`/app/backend/server.py`), MongoDB collections merchants, guarantees and orders. Public Kalshi data is cached in memory (15s, and stale data is served if Kalshi fails). Guarantees settle lazily when the dashboard loads (YES → refunded, NO → expired).
- Frontend: Expo Router stack: `/`, `/merchants`, `/onboarding`, `/merchant/[id]`, `/merchant/[id]/checkout`, `/merchant/[id]/replay`. Fonts: Space Grotesk and Plus Jakarta Sans. Icons: Ionicons. The logo is drawn from Views (`src/components/Logo.tsx`), and the app icon, favicon and splash were regenerated in blue.

## Implemented (Oct 24 2026)
- All 6 screens, live pricing, depth warning, official trigger text (`rules_primary`), mock and demo hedge orders, P&L, order book, settlement replay with real entry prices from candlesticks, seed data, the blue logo, and input validation.
- Testing iteration 1: all flows passed. The validation, navigation and UI issues it found are fixed.

## Backlog
- P1: Add the Kalshi demo API keys and verify real demo order fills.
- P1: Background settlement job and refund notifications to customers.
- P2: Embeddable checkout widget link or QR for merchants' own sites. Batch hedging. Track daily markets per merchant.
