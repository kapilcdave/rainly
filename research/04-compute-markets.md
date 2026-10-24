# Compute markets on Kalshi (considered, not built)

We looked at hedging GPU rental costs instead of rain. Verdict: real price swings, but the markets can't support a clean demo yet. Kept as Rainly's "next vertical" slide.

## What's listed (2026-10-24)

| Market | Status | Activity |
|---|---|---|
| **B200 monthly average $/hr** (`KXB200MS`), Oct 2026 – Aug 2027 | Open | ~210k contracts traded. Only Oct–Dec have real prices; from Jan on, bids are 0 and asks 99–100¢. |
| H100 / H200 / B200 "highest price by Dec 31" (`KX*MAX`) | Open | 9k–35k contracts each, very wide spreads |
| H200 / B200 weekly (`KXH200WS`, `KXB200WS`) | **Stopped after Oct 9** | 250k–340k traded while running (Aug 21 – Oct 9) |
| H100 monthly | Settled once (Aug 31 at $2.97/hr) | none since |
| Token prices: Opus 4.8 input ≤ $4/MTok, GPT-5.5 input ≤ $4 | Open | 13k–22k contracts traded; Opus ≤ $4 at 32–36¢ |
| Ornn token-price dashboard markets | Settled | ~20 contracts total |
| DRAM (DDR5) year-end price | Open | tiny |

All GPU markets settle on the **Ornn** compute price index (OCPI).

## The price story

B200 rental: **$4.22/hr** late June (press) → **$6.04** August average → **$7.25** September average → **~$8** October (Kalshi settlements and today's strip). Roughly a doubling in four months.

H200 weekly settlements: $5.09, $4.49, $4.63, $5.12, $5.60, $5.08, $6.23, $5.70 (Aug 21 – Oct 9).

## Why we didn't build it

1. **Liquidity runs out after ~2 months.** The November $9 strike was 24¢ bid / 65¢ ask: ~40¢ lost just crossing the spread. Nobody quotes January onward.
2. **The index may not match your bill.** Same H100: $2.74/hr at neoclouds vs $7.20/hr at hyperscalers in August (Silicon Data), a 2.6× spread.
3. **Crowded with big players:** CME + Silicon Data (H100 and B200 rental-index futures, slated for Oct 5, launch unconfirmed), ICE + Ornn, Nodal + Compute Desk, Polymarket (Ornn-settled), and Kalshi's own forward curve (July 2026).
4. **Hackathon startups mostly pay for API tokens, not B200 rentals,** and token prices mostly fall.

## The shared engine

Both ideas reduce to: **turn a business's exposure into a ladder of Kalshi binary contracts.**

Compute example, a cap on one B200 for November (720 hours): buy 360 contracts at each $0.50 strike from $9 to $12. At 10-24 asks that cost ~$700 per GPU. If the average comes in at $10.20, the $9, $9.50 and $10 strikes pay $1,080 against $864 of actual overage.

## Sources

- [The Next Web: Kalshi compute forward curve](https://thenextweb.com/news/kalshi-compute-forward-curve-gpu-ai) · [Bloomberg Law](https://news.bloomberglaw.com/capital-markets/kalshi-ramps-up-effort-to-build-markets-for-ai-computing-power) · [Crypto Briefing](https://cryptobriefing.com/kalshi-gpu-compute-price-prediction-markets/) · [KuCoin](https://www.kucoin.com/news/flash/kalshi-launches-prediction-markets-for-gpu-compute-power-prices) · [AI Weekly](https://aiweekly.co/alerts/kalshi-launches-gpu-compute-forward-curves-for-ai-hedging)
- [Ornn OCPI (Innermost Loop)](https://theinnermostloop.substack.com/p/the-first-tradable-compute-price) · [Allium GPU rental report](https://webflow.allium.so/reports/gpu-rental-prediction-markets) · [ICE + Ornn](https://www.mondovisione.com/media-and-resources/news/ice-and-ornn-to-launch-gpu-compute-futures-contracts-offers-new-price-discover-2026519/)
- [CME + Silicon Data press release](https://www.cmegroup.com/content/cmegroup/en/media-room/press-releases/2026/5/12/cme_group_and_silicondatapartnertolaunchfirstcomputefutures.html) · [Crypto Briefing: CME Oct 5](https://cryptobriefing.com/cme-group-compute-futures-launch/) · [Spheron](https://www.spheron.network/blog/compute-futures-cme-gpu-contracts-ai-buyers/) · [FOW: Nodal](https://www.fow.com/insights/nodal-exchange-enters-gpu-compute-futures-race-with-compute-desk-partnership) · [Blockspace](https://blockspace.media/short/future-gpu-rental-prices-are-more-expensive-than-spot-heres-why/)
