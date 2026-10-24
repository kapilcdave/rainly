import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Activity, DollarSign, FileStack, ShieldCheck, Loader2 } from "lucide-react";
import { api, pct, usd, TYPE_LABELS } from "@/lib/api";
import { useMerchant } from "@/context/MerchantContext";
import { PnlCards } from "@/components/PnlCards";
import { OrderBookDepth } from "@/components/OrderBookDepth";
import { HedgeLog } from "@/components/HedgeLog";
import { TriggerBox } from "@/components/TriggerBox";
import { Button } from "@/components/ui/button";

const Kpi = ({ icon: Icon, label, value, sub, testid }) => (
  <div data-testid={testid} className="rounded-3xl border border-slate-200 bg-white p-5">
    <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-slate-500"><Icon className="h-4 w-4 text-sky-600" /> {label}</div>
    <p className="font-num mt-2 text-3xl font-extrabold tracking-tight text-[#091e36] sm:text-4xl">{value}</p>
    {sub && <p className="mt-1 text-xs text-slate-500">{sub}</p>}
  </div>
);

const LiveMarket = ({ live }) => (
  <div data-testid="live-market-card" className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-6">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Live · {live.label} · {live.city}</p>
        <p data-testid="live-market-price" className="font-num mt-1 text-5xl font-extrabold text-sky-600">{live.p != null ? pct(live.p) : "—"}</p>
        <p className="text-xs text-slate-500">{live.p != null ? `YES ask $${live.p.toFixed(2)} · bid $${(live.yes_bid || 0).toFixed(2)}` : live.reason}</p>
      </div>
      <div className="text-right text-xs text-slate-500">
        <p className="font-num">{live.ticker || live.event_ticker}</p>
        {live.volume != null && <p className="font-num">Vol {Math.round(live.volume).toLocaleString()} · OI {Math.round(live.open_interest).toLocaleString()}</p>}
        <p className={`mt-1 inline-block rounded-full px-2 py-0.5 font-bold ${live.available ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
          {live.available ? `Offering ${usd(live.price)}` : live.reason}
        </p>
      </div>
    </div>
    <div className="mt-5"><OrderBookDepth ticker={live.ticker} ask={live.p} /></div>
  </div>
);

export default function Dashboard() {
  const { merchant } = useMerchant();
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard", merchant?.id],
    queryFn: () => api.get(`/merchants/${merchant.id}/dashboard`).then((r) => r.data),
    enabled: !!merchant,
    refetchInterval: 30000,
  });
  if (!merchant || isLoading || !data) {
    return <div className="flex justify-center p-16"><Loader2 className="h-6 w-6 animate-spin text-sky-600" /></div>;
  }
  const k = data.kpis;
  return (
    <div data-testid="merchant-dashboard" className="mx-auto max-w-6xl space-y-8 px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-sky-600">{TYPE_LABELS[merchant.type]} · {merchant.city} · avg {usd(merchant.avg_booking)}</p>
          <h1 data-testid="dashboard-merchant-name" className="font-display mt-1 text-4xl font-extrabold tracking-tight text-[#091e36] sm:text-5xl">{merchant.name}</h1>
        </div>
        <div className="flex items-center gap-2">
          <span data-testid="trading-mode-badge" className={`rounded-full px-3 py-1 text-xs font-bold ${data.trading_mode === "live" ? "bg-emerald-100 text-emerald-700" : "bg-yellow-100 text-yellow-800"}`}>
            {data.trading_mode === "live" ? "Live Kalshi trading" : "Simulated fills at live ask"}
          </span>
          <Button asChild size="sm" className="rounded-full bg-[#0e487c]" data-testid="dashboard-open-checkout-btn"><Link to="/checkout">Open checkout</Link></Button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Kpi testid="kpi-guarantees-sold" icon={ShieldCheck} label="Guarantees sold" value={k.guarantees_sold} sub={`${k.active} active · ${k.refunded} refunded · ${k.expired} expired`} />
        <Kpi testid="kpi-total-refunds-promised" icon={DollarSign} label="Refunds promised" value={usd(k.refunds_promised, 0)} sub="open exposure" />
        <Kpi testid="kpi-contracts-held" icon={FileStack} label="Contracts held" value={k.contracts_held.toLocaleString()} sub="$1 YES each" />
        <Kpi testid="kpi-hedge-cost" icon={Activity} label="Hedge cost" value={usd(k.hedge_cost)} sub={`vs ${usd(k.premium)} collected`} />
      </div>
      <PnlCards pnl={data.pnl} />
      {data.pnl.realized !== 0 && (
        <p data-testid="realized-pnl" className="text-sm text-slate-600">Realized on settled guarantees: <span className="font-num font-bold text-[#091e36]">{usd(data.pnl.realized)}</span></p>
      )}
      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <LiveMarket live={data.live} />
        <TriggerBox rules={data.live.rules_primary || data.guarantees[0]?.rules_primary} ticker={data.live.ticker} />
      </div>
      <div className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-6">
        <h2 className="font-display mb-4 text-lg font-semibold text-[#091e36]">Hedge order log</h2>
        <HedgeLog orders={data.orders} />
      </div>
    </div>
  );
}
