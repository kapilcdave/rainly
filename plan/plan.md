# RainCheck: Weather Hedging for Small Businesses

A hedging tool that helps weather-sensitive small businesses, like ice cream shops, patios and landscapers, protect their revenue by buying Kalshi weather contracts that pay out on the days bad weather keeps customers away.
An AI risk advisor turns a plain description of the business into a specific hedge using live Kalshi prices. The owner can then try it as a paper trade or place it for real on their own Kalshi account.

## Who it's for
- Small business owners whose sales depend on the weather (ice cream shops, food trucks, outdoor venues, landscapers, car washes, event rentals) and who have no trading background.
- Hackathon judges at VibeCon (finance and insurance track), who need to see the full path from "my business loses money when it rains" to "here is my hedge" in under two minutes.

## Core features and experience
- **Google sign-in.** Each owner has a private account. Their businesses, hedges and Kalshi keys are visible only to them.
- **Business profile.** The owner enters the business name, type, city, typical daily revenue, and how much a bad-weather day costs them. Example: "a rainy Saturday costs me about $800." The AI can fill in suggested numbers, and the owner can change them.
- **AI risk advisor.** The owner describes the business in their own words. The AI then:
  - Names the weather risks that matter, such as rain, extreme heat, cold snaps or snow.
  - Explains each risk in plain language.
  - Matches each risk to live Kalshi weather markets for the nearest supported city.
  - Suggests which side to buy, how many contracts, the maximum cost, and the expected payout if the bad weather happens.
- **Live weather markets.** The app shows open Kalshi rain, high/low temperature and snow markets with:
  - the current YES/NO price
  - close time
  - Kalshi's own settlement rules and weather source, shown in full before any order
- **Hedge calculator.** The owner sees the trade-off clearly: "Spend $X on this contract. If it rains, it pays $Y, which covers Z% of your lost sales." They can change the coverage level and the numbers update live.
- **Paper trading (default).** The owner can place any hedge as a simulated position at the live price. When the market settles, the app records the result and shows the profit or loss.
- **Real Kalshi orders.** In Settings, the owner connects their own Kalshi API Key ID and private key (RSA or Ed25519) and chooses Demo or Live:
  - Keys are stored encrypted, are never shown again after saving, and can be removed at any time.
  - Every real order needs an explicit confirmation screen showing contract, side, quantity, price, maximum cost and environment.
- **Hedge dashboard.** One screen shows active hedges (paper and real), money spent on protection, payouts received, and a simple "protected revenue" figure for the season.

## User flow
1. The owner lands on the homepage and reads the pitch. They sign in with Google.
2. Onboarding: they describe the business in a sentence ("Ice cream shop in Chicago, rainy weekends kill sales"), and the AI drafts a business profile for them to confirm.
3. The AI advisor shows a risk report and 1–3 suggested hedges, each linked to a live Kalshi market.
4. The owner opens a suggestion, reads the settlement rules, and adjusts the coverage in the hedge calculator.
5. The owner chooses "Paper trade" or "Place on Kalshi". The real-order option needs connected keys and a confirmation step.
6. The dashboard tracks the position until it settles, then shows the payout and how much revenue it protected.

## UI/UX feel
Calm and trustworthy, like an insurance product rather than a trading terminal. The language is plain, and terms like "contract", "YES" and "settlement" are explained right where they appear. Numbers are large and clear, weather icons make each risk easy to spot, and money is always shown in dollars, not cents-per-contract jargon. Placing a real trade is a deliberate step with a clear confirmation, never one click.

## Implementation phases
**Phase 1: MVP (built now)**
- Google sign-in, business profile and AI-assisted onboarding
- AI risk advisor that suggests weather hedges using live Kalshi market data
- Weather market browser with prices and settlement rules
- Hedge calculator showing cost, payout and coverage
- Paper trading with positions tracked until settlement
- Connecting Kalshi keys (Demo or Live), with real order placement and confirmation
- Hedge dashboard

**Phase 2**
- Alerts when a forecast shifts or a good hedge price appears
- Season-long hedge plans (for example, "cover every summer weekend") that the owner approves in one batch
- Real order status, fills and cancellations synced from Kalshi
- Uploading sales history so the AI can estimate how weather actually affects revenue

**Phase 3**
- Economy and policy risks (gas prices, interest rates, tariffs) for non-weather businesses
- Multiple locations per business and team access
- Polymarket as a second market source
- Season-end protection reports for owners and lenders

## Assumptions
- Phase 1 covers weather only (rain, heat, cold, snow), as requested.
- Prices come from Kalshi's live public market data. No key is needed to browse or paper trade.
- Paper trading is the default. Real orders happen only after the owner connects their own Kalshi keys and confirms each order.
- The owner chooses Demo or Live when connecting keys. Demo is preselected so a first real test uses no real money.
- Real orders are limit orders at the shown price that fill immediately or cancel. Nothing is left open on Kalshi by accident.
- The AI advisor uses Claude Sonnet through the Emergent universal key. No AI key is needed from the user.
- If a business's city has no Kalshi weather market, the app suggests the nearest city that does and says so clearly.
- The app suggests hedges but does not give financial advice. A short disclaimer appears near any trade action.
- The working name is "RainCheck" and can be changed.
- The app is in English and uses US dollars, since Kalshi is a US market.
