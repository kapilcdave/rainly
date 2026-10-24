# Why Rainly, and not the business trading Kalshi itself

**One line for judges:** 28 Wishes pays for its hedge out of its own pocket and guesses how much bad weather costs it. With Rainly, the customer pays for the hedge, and the amount is exact.

## What a business trading on its own has to do

1. **Estimate its loss.** "How much does a rainy Saturday cost me?" Most owners don't know. Too high wastes money; too low leaves them under-covered.
2. **Pay for it themselves.** Every hedge comes straight out of the business's cash.
3. **Know how Kalshi works:** which station settles their city; that daily markets list ~1 day ahead and weekend markets on Monday; how to read a thin book and the fee math; when to buy; checking settlement afterward. 28 Wishes is two brothers who enjoy trading. Most owners won't do this.
4. **Live with basis risk.** It rains but sales only drop 20%, or it's dry and sales drop anyway.

## What Rainly changes

1. **It hedges a promise, not a guess.** 40 refunds of $45 = $1,800 of contracts. No estimating, no basis risk.
2. **The customer pays.** The add-on covers the hedge plus a margin. The business makes money and gets bookings it would otherwise lose to a bad forecast.
3. **It's automatic.** Rainly prices, trades on time, checks settlement, and sends refunds. The owner never opens Kalshi.
4. **The product is the checkout widget and automatic refunds,** which a Kalshi account alone doesn't give you.

## Architecture: bring your own Kalshi account

Merchants connect their own Kalshi account; Rainly trades in it automatically.

- **Legal:** Rainly never holds customer money or positions. If Rainly held trades for many merchants in its own account, that would likely raise CFTC questions about acting as a broker or pool operator. That's a read, not legal advice: get counsel before launch.
- **Same posture as Blanket,** which also holds no funds. Rainly adds the execution layer Blanket doesn't have.
- **Pitch line:** "Your Kalshi account, your money. Rainly is the autopilot plus the checkout product."

### Security: merchant API keys

Merchant Kalshi keys can trade the merchant's money.

- Encrypt them at rest; keep them server-side only, never in the browser.
- Never log them.
- Let merchants delete them.
- For the demo: mock trading on by default, and one demo key for the "Connect your Kalshi account" step.
