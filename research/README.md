# Rainly research

Research behind Rainly, done 2026-10-24 at VibeCon (YC × Emergent hackathon).

**Rainly in one line:** outdoor small businesses offer customers a "rain refund" at checkout. Rainly prices it live from Kalshi's rain markets, hedges it automatically in the merchant's own Kalshi account, and pays the refunds when the market settles YES.

| File | What's in it |
|---|---|
| [01-rain-hits-small-business.md](01-rain-hits-small-business.md) | Which small businesses rain hurts, how much, and who benefits |
| [02-kalshi-weather-markets.md](02-kalshi-weather-markets.md) | Every Kalshi rain and disaster contract: tickers, rules, listing timing, liquidity, API gotchas |
| [03-competition-and-prior-art.md](03-competition-and-prior-art.md) | Blanket, Sensible Weather, Vortex RainSure, 28 Wishes, and where the gap is |
| [04-compute-markets.md](04-compute-markets.md) | Kalshi GPU and token markets, and why we didn't build on them (yet) |
| [05-why-rainly-vs-self-hedging.md](05-why-rainly-vs-self-hedging.md) | Why a business can't just trade Kalshi itself, and the bring-your-own-keys architecture |
| [06-pitch-and-judge-qa.md](06-pitch-and-judge-qa.md) | Pitch, demo tips, and answers to the questions judges will ask |
| [07-emergent-build-prompt.md](07-emergent-build-prompt.md) | The prompt used to build the app in Emergent |
| [08-submission.md](08-submission.md) | Submission form answers, demo click path, 2-minute script, Emergent polish prompt |
| [data/](data/) | Kalshi API snapshots from 2026-10-24 (CSV) |
| [scripts/pull_kalshi_snapshot.py](scripts/pull_kalshi_snapshot.py) | Re-pulls the snapshots from Kalshi's public API |

All market numbers come from Kalshi's public API on 2026-10-24 unless a source is cited. Prices go stale fast, so re-run the script before quoting a number on stage.
