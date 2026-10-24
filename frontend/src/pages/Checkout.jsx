import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, Check, Loader2 } from "lucide-react";
import { api, errMsg, pct, usd, TYPE_LABELS } from "@/lib/api";
import { useMerchant } from "@/context/MerchantContext";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { TriggerBox } from "@/components/TriggerBox";

const DateChips = ({ options, selected, onPick }) => (
  <div className="rs-scroll-x -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
    {options.map((o, i) => (
      <button key={o.event_ticker} type="button" onClick={() => onPick(i)} data-testid={`checkout-date-${o.event_ticker}`}
        className={`shrink-0 rounded-xl border px-3 py-2.5 text-left transition-colors ${
          selected === i ? "border-sky-400/60 bg-sky-400/10" : "border-white/[0.07] hover:border-white/20"
        }`}>
        <span className="block text-[10px] uppercase tracking-wider text-zinc-500">{o.product === "weekend" ? "Weekend" : "Day"}</span>
        <span className="mt-0.5 block whitespace-nowrap text-[13px] text-zinc-100">{o.label.replace("Weekend ", "")}</span>
        <span className={`font-num mt-0.5 block text-[11px] ${o.available ? "text-sky-400" : "text-zinc-600"}`}>{o.available ? `${pct(o.p)} rain` : o.reason}</span>
      </button>
    ))}
  </div>
);

const Confirmed = ({ result, onReset }) => (
  <div data-testid="checkout-confirmation" className="rs-fade-up py-6 text-center">
    <span className="mx-auto grid h-12 w-12 place-items-center rounded-full border border-emerald-400/40 text-emerald-400"><Check className="h-5 w-5" /></span>
    <p className="mt-4 text-xl font-medium text-white">Booking confirmed</p>
    {result.guarantee ? (
      <p className="mx-auto mt-2 max-w-[260px] text-[13px] font-light text-zinc-400">
        Rain refund active for {result.guarantee.label}. Hedged with{" "}
        <span className="font-num text-zinc-100">{result.order.count} YES</span> at ${result.order.fill_price.toFixed(2)} · {result.order.mode}
      </p>
    ) : <p className="mt-2 text-[13px] text-zinc-500">No rain refund added.</p>}
    <button onClick={onReset} data-testid="checkout-new-booking-btn" className="mt-6 text-sm text-sky-400 hover:text-sky-300">New booking</button>
  </div>
);

const RefundCard = ({ o, on, setOn, thinOk, setThinOk }) => (
  <div className={`rounded-xl border p-4 transition-colors ${on ? "border-sky-400/50 bg-sky-400/[0.06]" : "border-white/[0.07]"}`}>
    <div className="flex items-center gap-3">
      <div className="flex-1">
        {o.available ? (
          <p data-testid="checkout-quote-line" className="text-[13px] text-zinc-100">
            Rain chance <span className="font-num text-sky-400">{pct(o.p)}</span> · Rain refund <span className="font-num">{usd(o.price)}</span>
          </p>
        ) : (
          <p data-testid="checkout-unavailable-reason" className="text-[13px] text-zinc-400">
            {o.p != null && o.reason?.startsWith("High") && <span className="font-num">{pct(o.p)} · </span>}{o.reason}
          </p>
        )}
        <p className="mt-1 text-[11px] font-light text-zinc-500">If it rains on your date, you get your booking back.</p>
      </div>
      <Switch data-testid="checkout-guarantee-toggle" checked={on} onCheckedChange={setOn} disabled={!o.available} />
    </div>
    {on && o.available && !o.depth_ok && (
      <div data-testid="checkout-depth-warning" className="mt-3 rounded-lg border border-yellow-300/20 bg-yellow-300/[0.06] p-3 text-[11px] text-yellow-200/90">
        <p className="flex items-center gap-1.5 font-medium"><AlertTriangle className="h-3.5 w-3.5" /> Thin order book</p>
        <p className="mt-1 font-light">Only <span className="font-num">{Math.floor(o.depth_available)}</span> contracts at ≤ ${o.max_price.toFixed(2)}; need {o.contracts}. Hedge may not fully fill.</p>
        <label className="mt-2 flex items-center gap-2">
          <Checkbox data-testid="checkout-accept-thin-depth" checked={thinOk} onCheckedChange={(v) => setThinOk(!!v)} /> Try anyway
        </label>
      </div>
    )}
  </div>
);

const Stat = ({ k, v, testid }) => (
  <div className="bg-[#07090d] p-5">
    <p className="rs-label">{k}</p>
    <p data-testid={testid} className="font-num mt-2 text-2xl font-medium text-white sm:text-3xl">{v}</p>
  </div>
);

const HedgeExplainer = ({ o }) => (
  <div className="space-y-8 lg:pt-6">
    <div>
      <p className="rs-label">Behind the toggle</p>
      <h1 className="mt-3 text-3xl font-medium tracking-[-0.03em] text-white sm:text-4xl">Every refund is pre-funded on Kalshi.</h1>
      <p className="mt-4 max-w-md text-sm font-light leading-relaxed text-zinc-500 sm:text-base">
        Turning on the refund buys $1 YES contracts on that city's rain market, so the payout exactly covers the booking.
      </p>
    </div>
    {o && o.p != null ? (
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.07]">
        <Stat k="Live YES ask" v={`$${o.p.toFixed(2)}`} testid="explainer-yes-ask" />
        <Stat k="Fee / contract" v={`$${o.fee_per_contract.toFixed(4)}`} testid="explainer-fee" />
        <Stat k="Contracts" v={o.contracts} testid="explainer-contracts" />
        <Stat k="Customer pays" v={usd(o.price)} testid="explainer-price" />
      </div>
    ) : (
      <div className="rs-card p-6 text-sm text-zinc-500">{o?.reason || "Pick a date to see live pricing."}</div>
    )}
    <div className="space-y-1 text-xs text-zinc-600">
      {o?.ticker && <p className="font-num">{o.ticker} · {o.status}</p>}
      <p>Price = booking × (rain odds + fee) × 1.20, min $1. Not offered above 60%.</p>
    </div>
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
      const first = options.findIndex((x) => x.available);
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
      toast.success(`Hedged: bought ${r.order.count} YES on ${r.order.ticker}`);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  if (!merchant) return <div className="p-16 text-center text-zinc-500">Loading merchant…</div>;

  return (
    <div className="mx-auto grid max-w-6xl gap-12 px-4 py-12 sm:px-6 lg:grid-cols-[380px_1fr] lg:gap-20 lg:py-20">
      <div data-testid="checkout-widget" className="mx-auto w-full max-w-[375px] overflow-hidden rounded-[2rem] border border-white/10 bg-[#0b0e14] shadow-[0_40px_120px_-40px_rgba(56,189,248,0.25)]">
        <div className="border-b border-white/[0.06] px-5 pb-4 pt-6">
          <p className="rs-label">{TYPE_LABELS[merchant.type]} · {merchant.city}</p>
          <p className="mt-1.5 text-xl font-medium tracking-tight text-white" data-testid="checkout-merchant-name">{merchant.name}</p>
        </div>
        <div className="space-y-5 p-5">
          {result ? <Confirmed result={result} onReset={() => { setResult(null); setOn(false); setThinOk(false); setName(""); }} /> : (
            <>
              <div className="flex gap-2">
                <Input data-testid="checkout-customer-name-input" placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} className="h-10 border-white/10 bg-transparent" />
                <div className="relative w-28 shrink-0">
                  <span className="absolute left-3 top-2.5 text-sm text-zinc-600">$</span>
                  <Input data-testid="checkout-booking-value-input" type="number" min="1" value={value} onChange={(e) => setValue(e.target.value)} className="font-num h-10 border-white/10 bg-transparent pl-6" />
                </div>
              </div>
              <div>
                <p className="mb-2.5 flex items-center gap-1.5 rs-label">Date {isFetching && <Loader2 className="h-3 w-3 animate-spin" />}</p>
                <DateChips options={options} selected={sel} onPick={setSel} />
              </div>
              {o && <RefundCard o={o} on={on} setOn={setOn} thinOk={thinOk} setThinOk={setThinOk} />}
              <div className="flex items-baseline justify-between border-t border-white/[0.06] pt-4">
                <span className="text-[13px] text-zinc-500">Total</span>
                <span className="font-num text-3xl font-medium text-white" data-testid="checkout-total">{usd(bv + (on && o?.available ? o.price : 0))}</span>
              </div>
              <button data-testid="checkout-confirm-btn" onClick={confirm}
                disabled={busy || !o || (on && o && !o.depth_ok && !thinOk)}
                className="flex h-11 w-full items-center justify-center rounded-full bg-white text-sm font-medium text-black transition-colors hover:bg-sky-300 disabled:opacity-40">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm booking"}
              </button>
              {o && <TriggerBox rules={o.rules_primary} compact />}
            </>
          )}
        </div>
      </div>
      <HedgeExplainer o={o} />
    </div>
  );
}
