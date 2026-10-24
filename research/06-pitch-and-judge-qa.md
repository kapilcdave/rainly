# Pitch, demo tips, and judge Q&A

## Platform

Web app, mobile-first. Judges watch on a projector, merchants use a laptop dashboard, customers see the add-on in web checkout, and there's no App Store review. Make checkout look good at phone width.

## Name

**Rainly.** We dropped "RainSure" because Vortex Insurance Agency already sells parametric rain insurance under that name, in the same niche.

## Tips for winning

1. **Demo with live Kalshi prices.** Market data needs no login, so the number on screen is real ("Chicago rain this weekend: 12¢"). Place the hedge on Kalshi's demo environment.
2. **Show a real past payout.** Pick a city and date where the market actually settled YES and show "40 customers refunded, hedge paid $X." Daily rain history goes back to mid-July 2026.
3. **One business.** "Maria's patio taqueria in Chicago." Don't demo five business types or the disaster markets; disasters get one slide at most.
4. **Hedge math on screen:** refunds promised, contracts bought, cost, payout if it rains.
5. **Raise "isn't this insurance?" yourself.**
6. **Record a backup video of the demo.**
7. **Don't make up a market size.** Real numbers: Sensible Weather sold 50k+ guarantees; Kalshi weather is on pace for ~$1.1B a year, up ~500%.
8. **Last slide:** "Same engine, next market: capping GPU costs as compute markets mature." See [04](04-compute-markets.md).

## Questions judges will ask

**"Isn't this just insurance? Is it legal?"**
It's the merchant's own refund promotion, like Sensible Weather's checkout "guarantee." The risk is hedged on a CFTC-regulated exchange, in the merchant's own Kalshi account. Before real launch: legal review, or partner with a licensed carrier the way RainSure works with Mitsui Sumitomo.

**"Doesn't Blanket already do this?"**
No. Blanket recommends contracts and stops; it doesn't trade, and its own Gaps page lists weather as unsolved. Rainly is a product the business sells, and it places the hedge.

**"Why not Sensible Weather?"**
Sensible serves big travel platforms with insurance capital. Rainly serves the local patio or food truck and uses Kalshi to carry the risk, at fees of at most ~1.75¢ per $1 of payout.

**"Basis risk: it rained at my place but not at the station?"**
The refund triggers on the **same official station data the contract settles on**, so the hedge always matches the refunds owed.

**"How do you price it?"**
Live Kalshi probability + Kalshi fee + margin. A $40 booking at a 12% rain chance is ~$4.80 of risk; with fee and margin the customer pays ~$6.

**"What if the forecast says 90% rain?"**
Then the refund costs ~90% of the booking, or we stop selling it (cutoff above 60%). Sales close ~24 hours ahead. Customers who book early, when the weekend contract lists on Monday, get a cheaper price, like airline pricing. Because the price always follows the forecast, customers who know it'll rain gain nothing.

**"Is there enough liquidity?"**
A few hundred contracts near the current price per city per day: a few hundred to low thousands of dollars of payout, which fits small businesses.

**"What if it only rains at 6am?"**
v1 uses the daily contract: any measurable rain counts, and that's written into the refund terms. Hourly triggers come later as data allows.

**"How do you make money?"**
Margin on each guarantee, plus Kalshi's Builders Program fee share on the volume we bring.

**"Why now?"**
Daily rain contracts in 35 cities launched mid-2026; Kalshi partnered with The Weather Company on 2026-08-28; weather volume is up ~500%.

**"Why would a business bother?"**
Today a rainy forecast means customers don't book. A refund turns maybe-customers into bookings. Sensible's guarantee sells up to 5× as often as travel insurance.

**"Why can't the business just trade Kalshi itself?"**
See [05](05-why-rainly-vs-self-hedging.md): it'd have to guess its loss, pay out of pocket, and learn Kalshi. Rainly hedges an exact promise the customer pays for.
