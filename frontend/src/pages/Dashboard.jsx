import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { api, pct, usd, TYPE_LABELS } from "@/lib/api";
import { useMerchant } from "@/context/MerchantContext";
import { PnlCards } from "@/components/PnlCards";
import { OrderBookDepth } from "@/components/OrderBookDepth";
import { HedgeLog } from "@/components/HedgeLog";
import { TriggerBox } from "@/components/TriggerBox";

const Kpi = ({ label, value, sub, testid }) => (
  <div data-testid={testid} className="bg-[#07090d] p-5 sm:p-6">
    <p className="rs-label">{label}</p>
    <p className="font-num mt-3 text-3xl font-medium tracking-tight text-white sm:text-4xl">{value}</p>
    {sub && <p className="mt-1.5 text-[11px] text-zinc-600">{sub}</p>}
  </div>
);

const LiveMarket = ({ live }) => (
  <div data-testid="live-market-card" className="rs-card p-5 sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <p className="rs-label flex items-center gap-2"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />{live.label} · {live.city}</p>
        <p data-testid="live-market-price" className="font-num mt-3 text-5xl font-medium tracking-tight text-sky-400">{live.p != null ? pct(live.p) : "—"}</p>
        <p className="font-num mt-1 text-xs text-zinc-500">{live.p != null ? `ask ${live.p.toFixed(2)} · bid ${(live.yes_bid || 0).toFixed(2)}` : live.reason}</p>
      </div>
      <div className="text-right">
        <p className="font-num text-[11px] text-zinc-500">{live.ticker || live.event_ticker}</p>
        {live.volume != null && <p className="font-num text-[11px] text-zinc-600">vol {Math.round(live.volume).toLocaleString()} · oi {Math.round(live.open_interest).toLocaleString()}</p>}
        <p className={`mt-2 text-xs ${live.available ? "text-emerald-400" : "text-zinc-500"}`}>
          {live.available ? `Offering ${usd(live.price)}` : live.reason}
        </p>
      </div>
    </div>
    <div className="mt-6"><OrderBookDepth ticker={live.ticker} ask={live.p} /></div>
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
    return <div className="flex justify-center p-20"><Loader2 className="h-5 w-5 animate-spin text-zinc-500" /></div>;
  }
  const k = data.kpis;
  const live = data.trading_mode === "live";
  return (
    <div data-testid="merchant-dashboard" className="mx-auto max-w-6xl space-y-6 px-4 py-12 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4 pb-4">
        <div>
          <p className="rs-label">{TYPE_LABELS[merchant.type]} · {merchant.city} · avg {usd(merchant.avg_booking)}</p>
          <h1 data-testid="dashboard-merchant-name" className="mt-3 text-4xl font-medium tracking-[-0.03em] text-white sm:text-5xl">{merchant.name}</h1>
        </div>
        <div className="flex items-center gap-4">
          <span data-testid="trading-mode-badge" className="flex items-center gap-2 text-xs text-zinc-400">
            <span className={`h-1.5 w-1.5 rounded-full ${live ? "bg-emerald-400" : "bg-yellow-300"}`} />
            {live ? "Live Kalshi trading" : "Simulated fills at live ask"}
          </span>
          <Link to="/checkout" data-testid="dashboard-open-checkout-btn" className="rounded-full border border-white/15 px-4 py-1.5 text-xs text-zinc-200 transition-colors hover:border-white/40">Open checkout</Link>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.07] lg:grid-cols-4">
        <Kpi testid="kpi-guarantees-sold" label="Guarantees sold" value={k.guarantees_sold} sub={`${k.active} active · ${k.refunded} refunded · ${k.expired} expired`} />
        <Kpi testid="kpi-total-refunds-promised" label="Refunds promised" value={usd(k.refunds_promised, 0)} sub="open exposure" />
        <Kpi testid="kpi-contracts-held" label="Contracts held" value={k.contracts_held.toLocaleString()} sub="$1 YES each" />
        <Kpi testid="kpi-hedge-cost" label="Hedge cost" value={usd(k.hedge_cost)} sub={`vs ${usd(k.premium)} collected`} />
      </div>
      <PnlCards pnl={data.pnl} />
      {data.pnl.realized !== 0 && (
        <p data-testid="realized-pnl" className="text-[13px] text-zinc-500">Realized on settled guarantees <span className="font-num ml-1 text-white">{usd(data.pnl.realized)}</span></p>
      )}
      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <LiveMarket live={data.live} />
        <TriggerBox rules={data.live.rules_primary || data.guarantees[0]?.rules_primary} ticker={data.live.ticker} />
      </div>
      <div className="rs-card p-5 sm:p-6">
        <p className="rs-label mb-5">Hedge order log</p>
        <HedgeLog orders={data.orders} />
      </div>
    </div>
  );
}
