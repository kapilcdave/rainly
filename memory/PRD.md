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
- Merchant rain-chance alerts (optional contact_email; once a day when the weekend chance rises 10+ points and is still ≤60%). Customer coverage page /coverage/[gid] plus GET /api/guarantees/{id}, linked from checkout success. Attach-rate stats: declines are logged only when a refund was offered; the report shows uptake plus 3 upsell tips. Multi-location brands: "Add a location" and "All locations" rows, and /brand/[brand] with combined earnings.
- Live order status: resting/partial Kalshi demo orders are synced on dashboard load and every 5 minutes (GET /portfolio/orders/{id}), giving filled, partial, resting or canceled, with real fill price and fees.
- Printable table card (expo-print, A5) from the share screen, with an embedded QR from /api/qr?as_json=true.
- Weekly earnings report (/api/merchants/{id}/report, /merchant/[id]/report): last 8 weeks with bar chart and per-week rows.
- Morning-of reminder email from 7am ET with the live rain chance, once per booking. Skipped for bookings made the same day.
- Calmer redesign: landing is a plain white page with a small logo wordmark, a big ink headline, rain odds as a watchlist (city · sparkline · % · 24h change), and how-it-works as 3 text lines. Dashboard: big profit number, hairline split for if-rains/if-dry, settings-style action rows (checkout, share, replay), plain sections. Checkout lost its fake phone frame. Merchant picker is a hairline list.
- Real Kalshi demo hedging ON (MOCK_TRADING=false, Ed25519 demo key). Uses Create Order V2 POST /portfolio/events/orders, side=bid, GTC limit at live ask + 3¢. Demo books are empty, so orders usually rest (status 'resting'). Rejections or network errors fall back to a simulated fill with a note.
- Landing ticker: 24h change arrows plus a 24h sparkline per city. Share screen per merchant: QR code (/api/qr) plus app link (rainly:// scheme) and a Share button. Booking confirmation email sent at checkout when an email is given. Ed25519 and RSA Kalshi signing supported (demo key still pending).
- UI simplification: dashboard profit hero, net-only P&L cards, details behind "See the math", "Official trigger" and "Order book" disclosures, 3 orders + "Show all". Checkout: name and email appear only after the toggle, trigger and pricing behind disclosures. Shorter replay copy. Fixed the hero sign, filtered zero-size asks, hid pricing on the success screen.
- Recording prep: name set back to Rainly. "Diddy's Den" test merchant removed (also on any environment at backend start). Replay defaults to the newest date Rainly would actually have sold (Chicago YES: Oct 13, 38%, net +$142.80; NO: Oct 23). Selected date chip scrolls into view. Dashboard shows a "Same profit rain or shine" banner when both outcomes net the same.
- Refund alert emails (Emergent managed email, from "Rainly"): optional customer email at checkout (shown when the refund is toggled on). When a market settles YES, guarantees flip to refunded and emails send in the background, with retry up to 3 attempts across 5-minute passes and no duplicates. The dashboard shows a refund-emails-sent count.
- Landing redesign: solid blue hero with a large logo, shorter copy, "Get started" button, no "demo" wording.
- All 6 screens, live pricing, depth warning, official trigger text (`rules_primary`), mock and demo hedge orders, P&L, order book, settlement replay with real entry prices from candlesticks, seed data, the blue logo, and input validation.
- Testing iteration 1: all flows passed. The validation, navigation and UI issues it found are fixed.

## Backlog
- P1: Sync resting demo order fills/cancels back into the order log.
- P1: Background settlement job and refund notifications to customers.
- P2: Embeddable checkout widget link or QR for merchants' own sites. Batch hedging. Track daily markets per merchant.

## Backend refactor + email retries (Jun 2026)
- server.py split: core.py (env/db/http), models.py, seed.py, services/{kalshi,notifications,settlement,reports}.py, routers/{markets,merchants,guarantees}.py. API paths unchanged.
- All emails (confirm, reminder, refund, merchant price alert) retry automatically: brief in-place retries on provider rate limits, then backoff 5m → 15m → 1h → 4h, `gave_up` after 5 attempts. Fields: `<kind>_email_status|attempts|retry_at`. Interrupted sends recovered on startup.
- Tests: tests/test_email_retry.py (unit), legacy tests updated for kalshi_demo mode.

## Demo polish (Jun 2026)
- MOCK_TRADING=true: hedges simulated at live Kalshi ask, note "Simulated at live Kalshi price" (demo-order code kept, switched off).
- Dashboard actions: only Open checkout + Settlement replay (share/report/locations screens still exist, rows removed).
- Checkout: no "Check my coverage" button; hedge line "(simulated at live price)"; date chips only for open markets (/api/meta date_options[].open).
- Morning reminder emails off (REMINDER_EMAILS=False in services/notifications.py).

## Real-money Kalshi trading (Jun 2026)
- Mode `kalshi_live` when KALSHI_LIVE_TRADING=true + KALSHI_PROD_ACCESS_KEY/KALSHI_PROD_PRIVATE_KEY_PEM set (verified, prod balance $25.85). Falls back to demo/mock otherwise.
- Orders: fill-or-kill at live ask + 3¢ on api.elections.kalshi.com; failed hedge → booking deleted, 409. Lock serializes live orders; DAILY_HEDGE_CAP=$10/ET day (worst-case cost checked in quote and inside the lock). Lost-connection orders recorded as status "unknown" with worst-case cost.
- Quote unavailable in live mode when orderbook depth < contracts ("Not enough sellers on Kalshi right now").
- No real test order placed (user declined).
