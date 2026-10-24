# RainCheck (repo: rainly)

> My project for VibeCon 2026 @ Y Combinator. Finance & insurance track.

**Weather protection for small businesses, built on Kalshi prediction markets.**
When rain, heat or cold keeps customers away, a RainCheck hedge pays the owner instead.

## The problem
- A moderately bad weather day costs a store about **25% of that day's sales**, and a very bad day about **40%**. Those sales aren't made up later or online ([SF Fed, 2022](https://www.frbsf.org/research-and-insights/publications/economic-letter/2022/08/impact-of-weather-on-retail-sales/)).
- Weather variability moves about **$485B a year (3.4% of US GDP)** ([Lazo et al., BAMS 2011](https://journals.ametsoc.org/view/journals/bams/92/6/2011bams2928.1.xml)).
- Business insurance covers storm damage, not lost customers. Weather derivatives exist, but only big companies use them.

## The product
- **AI risk advisor** (Claude via Emergent): describe your shop in a sentence and get a risk report plus 1-3 hedges matched to live Kalshi weather contracts in 16 US cities
- **Hedge calculator**: "Spend $X. If it rains, it pays $Y, covering Z% of your lost sales." Kalshi's settlement rules are always shown
- **Paper trading** by default, or **real orders** on the owner's own Kalshi account (Demo or Live, keys encrypted, explicit confirmation)
- **Season plans**: approve once and every weekend is covered automatically, within a budget
- **Rain alerts**: phone push notifications when a watched hedge gets cheaper or the market's odds shift
- **Kalshi order sync** and **payout celebration** when a hedge pays
- **Installable phone app** (PWA) with bottom tabs, no App Store needed

## Business model
Free (risk report + paper hedges) · Pro $19/mo (alerts, season plans, real orders).

## Stack
React + shadcn/ui (PWA) · FastAPI · MongoDB · Kalshi Trade API v2 · Web Push (VAPID) · Emergent crons, auth and LLM key. Built and deployed on [Emergent](https://emergent.sh).

_RainCheck suggests hedges but does not give financial advice._
