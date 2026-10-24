import { usd } from "@/lib/api";

const Row = ({ k, v }) => (
  <div className="flex justify-between py-1 text-[13px]"><span className="text-zinc-500">{k}</span><span className="font-num text-zinc-300">{v}</span></div>
);

const Card = ({ testid, title, dot, value, rows }) => (
  <div data-testid={testid} className="rs-card p-6">
    <p className="flex items-center gap-2 rs-label"><span className={`h-1.5 w-1.5 rounded-full ${dot}`} />{title}</p>
    <p className="font-num mt-3 text-4xl font-medium tracking-tight text-white sm:text-5xl">{usd(value)}</p>
    <div className="mt-5 border-t border-white/[0.06] pt-3">{rows.map(([k, v]) => <Row key={k} k={k} v={v} />)}</div>
  </div>
);

export const PnlCards = ({ pnl }) => {
  const a = pnl.active;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Card testid="pnl-if-it-rains" title="If it rains" dot="bg-sky-400" value={pnl.rain} rows={[
        ["Refund premiums", `+${usd(a.premium)}`], ["Refunds paid", `−${usd(a.refunds)}`],
        ["Kalshi YES payout", `+${usd(a.contracts)}`], ["Hedge cost", `−${usd(a.hedge_cost)}`]]} />
      <Card testid="pnl-if-it-doesnt" title="If it doesn't" dot="bg-yellow-300" value={pnl.dry} rows={[
        ["Refund premiums", `+${usd(a.premium)}`], ["Refunds paid", "$0.00"],
        ["Kalshi YES payout", "$0.00"], ["Hedge cost", `−${usd(a.hedge_cost)}`]]} />
    </div>
  );
};
