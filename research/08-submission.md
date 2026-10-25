# Submission and demo video

Prepared 2026-10-24 for the VibeCon first round: a 2-minute screen recording of the live app with voiceover. Judges stop at 2:00.

Live app: https://rainy-refunds.preview.emergentagent.com. All numbers below were read from it on the evening of 10-24. Prices update every 15 seconds, so check them again before recording.

## Submission form

| Field | Answer |
|---|---|
| Team name / track | `[team name]` / `[track]` |
| Emails | `[the emails on your Emergent accounts]` |
| Live URL / test login | https://rainy-refunds.preview.emergentagent.com. No login needed; you pick a merchant. |
| Emergent job ID | `[from the Emergent session]` |
| Demo video | `[Google Drive link, anyone with the link can view]` |

**Customer and how they handle it today (one sentence):**
> Owners of outdoor small businesses (patio restaurants, food trucks, boat tours) lose bookings whenever rain is forecast, and today they just absorb the loss or refund out of pocket, because rain insurance starts around a $250 premium with five-figure limits, far too big for a $45 booking.

**What we built (two sentences):**
> Rainly lets a small business offer customers a "rain refund" at checkout, priced live from Kalshi's daily and weekend rain markets for 35 US cities. Each refund sold is hedged with matching Kalshi contracts that settle on the same official weather station, so when it rains the customer is refunded and emailed automatically and the hedge covers the cost exactly.

**Research and data, with sources:**
- One bad-weather day moves retail sales about 10% over the following four weeks, and most of it is never recovered (Roth Tran, *Management Science* 2023): [FRBSF working paper](https://www.frbsf.org/research-and-insights/publications/working-papers/2022/02/sellin-in-the-rain-weather-climate-and-retail-sales/)
- Two-thirds of UK small businesses have lost revenue to bad weather: [Moorfields](https://moorfieldscr.com/media-centre/business-insights/uk-small-businesses-dangerously-exposed-to-the-weather)
- Customers pay for rain refunds: Sensible Weather has sold 1M+ rain guarantees through 8,000+ partners, using insurance capital and selling to big travel platforms: [Fintech Global](https://fintech.global/2025/08/25/sensible-unveils-high-wind-weather-protection/)
- Rain insurance doesn't fit small tickets: Vortex RainSure has a $250 minimum premium and $10k–$500k limits: [Business Insurance](https://www.businessinsurance.com/agency-unveils-parametric-rain-coverage/)
- Kalshi weather volume is up about 500% year over year, on pace for ~$1.1B a year, and Kalshi partnered with The Weather Company on 2026-08-28: [Artemis](https://artemis.bm/news/prediction-market-kalshi-partners-with-the-weather-company-for-weather-hedge-settlements)
- Kalshi lists daily and weekend rain contracts for 35 cities, each settled on one official station. We pulled prices, order books and settlement history from Kalshi's public API: [research/](https://github.com/kapilcdave/rainly/tree/main/research)

## Click path for the video (all live)

1. **Landing page.** The live ticker shows the weekend: Chicago 2%, NYC 1%, Miami 99%, Seattle 93%, Austin 3%. Click **Get started**.
2. **Merchant picker.** Click **Maria's Patio Taqueria** (Chicago).
3. **Dashboard.** Click **Open checkout**.
4. **Checkout.** Pick **Tomorrow Oct 25**: Chicago is 1% and the book is deep, so the refund is $1.00 on a $45 booking. (The weekend tab works too, at 2% for $1.15, but it shows a thin-book warning.) Turn on the toggle. The official trigger text names station CLIORD. Type an email, then **Confirm with rain refund**. The "You're covered" screen shows "Bought 45 YES @ 1¢ … Mock fill at live ask."
5. **View dashboard.** It shows 41+ guarantees, 1,845+ contracts held, about $137 hedge cost and about $164 in fees. **The If-it-rains and If-it-doesn't cards show the same number (+$27.28).** That's the point: Maria earns the margin either way.
6. **Replay.** Tap the **Oct 13** chip. Rain chance at listing was 38%, so the refund was priced at $21.41. It settled YES with 0.11", 40 refunds = $1,800, the hedge paid +$1,800, and Maria nets **+$142.80**. Optional: the "Stayed dry" tab with **Sep 27** (14%, nets +$53.60).
7. Optional, 3 seconds: Bayfront Boat Tours (Miami, 99%) shows the refund as **unavailable**. Above 60% we don't sell it.

The replay now opens on Oct 13 by default (fixed in round 1).

## Script (about 270 words, aim for 1:50)

**[0:00–0:05] Title card:** "Rainly: rain refunds for small businesses, hedged on Kalshi"

**[0:05–0:25] Customer and problem** (landing page on screen)
> "Maria runs a patio taqueria in Chicago. When the weekend forecast says rain, people don't book. Today she either eats the loss, refunds out of her own pocket, or buys rain insurance that starts around $250 with paperwork. A Fed study found one bad-weather day cuts sales about 10% over the next month. Rainly replaces all of that with one checkout toggle: a micro-hedge that prices, hedges and refunds automatically."

**[0:25–0:35] Live odds**
> "These are live Kalshi rain markets. Miami's at 99% this weekend; Chicago's at 2%."

**[0:35–1:00] Checkout**
> "Here's what Maria's customer sees. Pick a date, and Rainly prices the refund from the live Kalshi number: one dollar to protect a $45 booking. The trigger is the official weather station Kalshi settles on, so the refund and the hedge always match. Confirm, and Rainly buys 45 matching contracts behind the scenes. That fill is simulated at the live price for this demo."

**[1:00–1:15] Dashboard**
> "Maria's dashboard: every refund promised, every contract held, the live order book. And look at these two cards: if it rains, she makes $27; if it doesn't, she makes $27. The customer paid for the hedge."

**[1:15–1:30] Replay**
> "Here's a real day: October 13th in Chicago. Kalshi priced rain at 38%, it rained, 40 customers got refunded automatically, the hedge paid $1,800, and Maria still came out $142 ahead."

**[1:30–1:50] Why this wins**
> "Over a million people have already bought rain guarantees, but on insurance built for big travel platforms. Kalshi's daily rain markets let us sell a one-dollar refund for one Saturday, hedged exactly, to any patio, food truck or boat tour. Rain shouldn't cost you customers."

## Polish prompt for Emergent (round 2: cut, don't add)

The round 1 fixes are done (Rainly name, Diddy's Den removed, replay opens on Oct 13, same-profit banner). Round 2:

```
No new features. Polish only, so the core flow makes sense in a 2-minute demo:
1. Set MOCK_TRADING=true. Kalshi demo rain books are empty, so every hedge sits "resting" and never fills, while the dashboard still counts those contracts and says "profit rain or shine". That claim is false unless the hedge fills. Simulated fills at the live production ask, labelled "Simulated at live Kalshi price", are honest and consistent. Keep the demo-order code, just switch it off.
2. Dashboard action list: show only "Open checkout" and "Settlement replay". Hide "Share checkout link", "Weekly earnings", "Add a location" and "All locations" (keep the code, remove the rows).
3. Checkout success screen: remove the "Check my coverage" button. Keep "New booking" and "View dashboard". The hedge line should read "Hedged: 45 contracts @ 1¢ on Kalshi (simulated at live price)".
4. Checkout dates: show only dates whose market is open now (today, tomorrow, this weekend). Hide "Opens Monday" weekends from the chips; the 60% "not offered" state stays.
5. Turn off the morning reminder emails. Keep the booking confirmation and refund emails.
Don't touch pricing, the replay, the landing ticker or the visual design.
```

## Before recording

- Open the live URL in a private window and check that the ticker loads.
- Kalshi lists daily markets about a day ahead, and the weekend contract lists the Monday before. After Sunday the "Weekend Oct 24–25" option goes away and "Oct 31" reads "Opens Monday."
- The seeded weekend guarantees settle after Sunday. If you record after that, the dashboard will show them as settled.
- Make two takes and keep the better one. Show the screen only, plus the title card.
- Upload to Google Drive, set sharing to "Anyone with the link can view," and test the link in a private window.
- Don't claim real Kalshi orders. The app says "Mock fill at live ask," so say "simulated at the live price."
