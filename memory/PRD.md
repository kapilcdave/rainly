# RainCheck: PRD

## Original problem statement
VibeCon hackathon (finance/insurance track): help small businesses hedge weather volatility on prediction markets (mainly Kalshi). Example: an ice cream shop buys "will it rain" contracts so the hedge pays when rain keeps customers away.
Follow-up: it should be a phone app. The website is mainly for getting the app → user chose an installable phone app (PWA, Add to Home Screen) with a phone-first bottom-tab layout.

## Architecture
- FastAPI (`server.py`, `kalshi.py` public market data + RSA/Ed25519 signing client, `advisor.py` Claude Sonnet 5.5 via Emergent key) + MongoDB
- React + shadcn; PWA (manifest.json, sw.js, apple meta tags, icons); Emergent Google Auth
- Kalshi: public prod data for browsing and paper trades; user's own keys (Fernet-encrypted) for Demo or Live orders via V2 `/portfolio/events/orders` (IOC)

## Implemented (Oct 2026)
- Google sign-in, AI onboarding profile draft, AI risk report with 1-3 hedges matched to live markets in 16 cities
- Market browser (city/kind/search), hedge sheet with calculator, settlement rules, paper trade, Kalshi order confirmation
- Settings: connect, verify and remove Kalshi keys (Demo by default)
- Dashboard: protected revenue, spent, payouts, net; positions auto-settle from Kalshi results
- PWA: Get-the-app page (iOS steps, Android prompt, desktop QR), standalone welcome screen, bottom tab bar, bottom-sheet hedges

## Backlog
- P1: forecast or price alerts (push), season-long hedge plans, syncing order fills and cancels from Kalshi
- P2: sales-history upload, non-weather risks, multiple locations, Polymarket, season reports
- Note: real Kalshi orders are untested (no keys). Google login inside the iOS home-screen app should be checked on a real iPhone.
