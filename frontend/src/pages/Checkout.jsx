import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, CloudRain, Loader2, Umbrella } from "lucide-react";
import { api, errMsg, pct, usd, typeImage, TYPE_LABELS } from "@/lib/api";
import { useMerchant } from "@/context/MerchantContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { TriggerBox } from "@/components/TriggerBox";

const DateChips = ({ options, selected, onPick }) => (
  <div className="rs-scroll-x -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
    {options.map((o, i) => (
      <button key={o.event_ticker} type="button" onClick={() => onPick(i)} data-testid={`checkout-date-${o.event_ticker}`}
        className={`shrink-0 rounded-2xl border px-3 py-2 text-left transition-colors ${
          selected === i ? "border-[#0e487c] bg-[#0e487c] text-white" : "border-slate-200 bg-white hover:border-sky-300"
        }`}>
        <span className="block text-[10px] font-bold uppercase tracking-wider opacity-70">{o.product === "weekend" ? "Weekend" : "Day"}</span>
        <span className="block whitespace-nowrap text-sm font-semibold">{o.label.replace("Weekend ", "")}</span>
        <span className={`font-num block text-xs ${o.available ? "" : "opacity-60"}`}>{o.available ? `${pct(o.p)} rain` : o.reason}</span>
      </button>
    ))}
  </div>
);

const Confirmed = ({ result, onReset }) => (
  <div data-testid="checkout-confirmation" className="rs-fade-up space-y-3 text-center">
    <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500" />
    <p className="font-display text-2xl font-bold text-[#091e36]">Booking confirmed</p>
    {result.guarantee ? (
      <p className="text-sm text-slate-600">
        Rain refund active for <b>{result.guarantee.label}</b>. Hedged with{" "}
        <span className="font-num font-bold">{result.order.count} YES</span> at ${result.order.fill_price.toFixed(2)} ({result.order.mode}).
      </p>
    ) : <p className="text-sm text-slate-600">No rain refund added.</p>}
    <Button variant="outline" onClick={onReset} data-testid="checkout-new-booking-btn" className="rounded-full">New booking</Button>
  </div>
);

export default function Checkout() {
  const { merchant } = useMerchant();
  const qc = useQueryClient();
  const [value, setValue] = useState("");
  const [sel, setSel] = useState(null);
  const [on, setOn] = useState(false);
  const [name, setName] = useState("");
  const [thinOk, setThinOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (merchant) {
      setValue(String(merchant.avg_booking));
      setSel(null);
      setResult(null);
    }
  }, [merchant]);

  const bv = Number(value) || 0;
  const { data, isFetching } = useQuery({
    queryKey: ["checkout", merchant?.id, bv],
    queryFn: () => api.get("/checkout/options", { params: { merchant_id: merchant.id, booking_value: bv } }).then((r) => r.data),
    enabled: !!merchant && bv > 0,
    refetchInterval: 30000,
  });
  const options = data?.options || [];

  useEffect(() => {
    if (sel === null && options.length) {
      const first = options.findIndex((o) => o.available);
      setSel(first >= 0 ? first : 0);
    }
  }, [options, sel]);

  const o = sel !== null ? options[sel] : null;
  useEffect(() => {
    setOn(false);
    setThinOk(false);
  }, [sel]);

  const confirm = async () => {
    if (!on) {
      setResult({ guarantee: null });
      return;
    }
    setBusy(true);
    try {
      const { data: r } = await api.post("/guarantees", {
        merchant_id: merchant.id, product: o.product, date: o.date, customer_name: name || "Guest",
        booking_value: bv, accept_thin_depth: thinOk,
      });
      setResult(r);
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success(`Hedged: bought ${r.order.count} YES contracts on ${r.order.ticker}`);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  if (!merchant) return <div className="p-10 text-center text-slate-500">Loading merchant…</div>;

  return (
    <div className="mx-auto grid max-w-6xl gap-10 px-4 py-10 sm:px-6 lg:grid-cols-[400px_1fr] lg:py-16">
      <div data-testid="checkout-widget" className="mx-auto w-full max-w-[375px] overflow-hidden rounded-[2.2rem] border-[6px] border-[#091e36] bg-white shadow-2xl shadow-sky-900/20">
        <div className="relative h-32">
          <img src={typeImage(merchant.type)} alt={merchant.name} className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#091e36]/90 to-transparent" />
          <div className="absolute bottom-3 left-4 text-white">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-yellow-300">{TYPE_LABELS[merchant.type]} · {merchant.city}</p>
            <p className="font-display text-xl font-bold" data-testid="checkout-merchant-name">{merchant.name}</p>
          </div>
        </div>
        <div className="space-y-4 p-4">
          {result ? <Confirmed result={result} onReset={() => setResult(null)} /> : (
            <>
              <div className="flex gap-2">
                <Input data-testid="checkout-customer-name-input" placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} className="h-10" />
                <div className="relative w-28 shrink-0">
                  <span className="absolute left-3 top-2.5 text-sm text-slate-400">$</span>
                  <Input data-testid="checkout-booking-value-input" type="number" min="1" value={value} onChange={(e) => setValue(e.target.value)} className="font-num h-10 pl-6" />
                </div>
              </div>
              <div>
                <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">Pick your date {isFetching && <Loader2 className="ml-1 inline h-3 w-3 animate-spin" />}</p>
                <DateChips options={options} selected={sel} onPick={setSel} />
              </div>
              {o && <RefundCard o={o} on={on} setOn={setOn} thinOk={thinOk} setThinOk={setThinOk} />}
              <div className="flex items-center justify-between border-t border-slate-100 pt-3">
                <span className="text-sm text-slate-500">Total</span>
                <span className="font-num text-2xl font-extrabold text-[#091e36]" data-testid="checkout-total">{usd(bv + (on && o?.available ? o.price : 0))}</span>
              </div>
              <Button data-testid="checkout-confirm-btn" onClick={confirm}
                disabled={busy || !o || (on && o && !o.depth_ok && !thinOk)}
                className="h-12 w-full rounded-full bg-[#0e487c] text-base font-bold hover:bg-[#0b3862]">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm booking"}
              </Button>
              {o && <TriggerBox rules={o.rules_primary} compact />}
            </>
          )}
        </div>
      </div>
      <HedgeExplainer o={o} />
    </div>
  );
}

const RefundCard = ({ o, on, setOn, thinOk, setThinOk }) => (
  <div className={`rounded-2xl border p-4 transition-colors ${on ? "border-yellow-300 bg-yellow-50" : "border-slate-200 bg-slate-50"}`}>
    <div className="flex items-center gap-3">
      <Umbrella className="h-6 w-6 shrink-0 text-[#0e487c]" />
      <div className="flex-1">
        {o.available ? (
          <p data-testid="checkout-quote-line" className="text-sm font-semibold text-[#091e36]">
            Rain chance <span className="font-num">{pct(o.p)}</span> · Rain refund <span className="font-num">{usd(o.price)}</span>
          </p>
        ) : (
          <p data-testid="checkout-unavailable-reason" className="text-sm font-semibold text-slate-500">
            {o.p != null && o.reason?.startsWith("High") && <span className="font-num">{pct(o.p)} · </span>}{o.reason}
          </p>
        )}
        <p className="text-xs text-slate-500">If it rains on your date, you get your booking back.</p>
      </div>
      <Switch data-testid="checkout-guarantee-toggle" checked={on} onCheckedChange={setOn} disabled={!o.available} />
    </div>
    {on && o.available && !o.depth_ok && (
      <div data-testid="checkout-depth-warning" className="mt-3 rounded-xl bg-amber-100 p-3 text-xs text-amber-900">
        <p className="flex items-center gap-1.5 font-bold"><AlertTriangle className="h-3.5 w-3.5" /> Thin order book</p>
        <p className="mt-1">Only <span className="font-num">{Math.floor(o.depth_available)}</span> contracts at ≤ ${o.max_price.toFixed(2)}; need {o.contracts}. The hedge may not fully fill.</p>
        <label className="mt-2 flex items-center gap-2">
          <Checkbox data-testid="checkout-accept-thin-depth" checked={thinOk} onCheckedChange={(v) => setThinOk(!!v)} /> Try anyway
        </label>
      </div>
    )}
  </div>
);

const Stat = ({ k, v, testid }) => (
  <div className="rounded-2xl border border-slate-200 bg-white p-4">
    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{k}</p>
    <p data-testid={testid} className="font-num mt-1 text-2xl font-extrabold text-[#091e36] sm:text-3xl">{v}</p>
  </div>
);

const HedgeExplainer = ({ o }) => (
  <div className="space-y-6">
    <div>
      <p className="text-xs font-bold uppercase tracking-widest text-sky-600">Behind the toggle</p>
      <h1 className="font-display mt-2 text-3xl font-extrabold tracking-tight text-[#091e36] sm:text-4xl">Every refund is pre-funded on Kalshi.</h1>
      <p className="mt-3 max-w-lg text-sm text-slate-600 sm:text-base">When a customer turns on the rain refund, RainSure buys $1 YES contracts on that city's rain market so the payout exactly covers the booking.</p>
    </div>
    {o && o.p != null ? (
      <div className="grid grid-cols-2 gap-3">
        <Stat k="Live YES ask" v={`$${o.p.toFixed(2)}`} testid="explainer-yes-ask" />
        <Stat k="Kalshi fee / contract" v={`$${o.fee_per_contract.toFixed(4)}`} testid="explainer-fee" />
        <Stat k="Contracts needed" v={o.contracts} testid="explainer-contracts" />
        <Stat k="Customer pays" v={usd(o.price)} testid="explainer-price" />
      </div>
    ) : (
      <div className="flex items-center gap-3 rounded-2xl border border-dashed border-slate-300 p-6 text-sm text-slate-500">
        <CloudRain className="h-5 w-5" /> {o?.reason || "Pick a date to see live pricing."}
      </div>
    )}
    {o?.ticker && <p className="font-num text-xs text-slate-500">Market: {o.ticker} · status {o.status}</p>}
    <p className="text-xs text-slate-500">Price = booking × (rain odds + fee) × 1.20, minimum $1. Not offered above 60% rain odds.</p>
  </div>
);
