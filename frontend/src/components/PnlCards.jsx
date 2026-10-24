import { CloudRain, Sun } from "lucide-react";
import { usd } from "@/lib/api";

const Row = ({ k, v }) => (
  <div className="flex justify-between text-sm"><span className="opacity-80">{k}</span><span className="font-num">{v}</span></div>
);

export const PnlCards = ({ pnl }) => {
  const a = pnl.active;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div data-testid="pnl-if-it-rains" className="relative overflow-hidden rounded-3xl bg-[#0e487c] p-6 text-white">
        <CloudRain className="absolute -right-4 -top-4 h-28 w-28 text-sky-400/20" />
        <p className="text-xs font-bold uppercase tracking-widest text-sky-200">If it rains</p>
        <p className="font-num mt-2 text-4xl font-extrabold sm:text-5xl">{usd(pnl.rain)}</p>
        <div className="mt-4 space-y-1">
          <Row k="Refund premiums" v={`+${usd(a.premium)}`} />
          <Row k="Refunds paid out" v={`−${usd(a.refunds)}`} />
          <Row k="Kalshi YES payout" v={`+${usd(a.contracts)}`} />
          <Row k="Hedge cost" v={`−${usd(a.hedge_cost)}`} />
        </div>
      </div>
      <div data-testid="pnl-if-it-doesnt" className="relative overflow-hidden rounded-3xl bg-yellow-300 p-6 text-[#091e36]">
        <Sun className="absolute -right-4 -top-4 h-28 w-28 text-yellow-500/40" />
        <p className="text-xs font-bold uppercase tracking-widest text-yellow-900/70">If it doesn't</p>
        <p className="font-num mt-2 text-4xl font-extrabold sm:text-5xl">{usd(pnl.dry)}</p>
        <div className="mt-4 space-y-1">
          <Row k="Refund premiums" v={`+${usd(a.premium)}`} />
          <Row k="Refunds paid out" v="$0.00" />
          <Row k="Kalshi YES payout" v="$0.00" />
          <Row k="Hedge cost" v={`−${usd(a.hedge_cost)}`} />
        </div>
      </div>
    </div>
  );
};
