import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { ShieldCheck, FlaskConical, Zap, Info, ExternalLink } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api, errMsg, usd, cents, closeLabel } from "@/lib/api";
import { WeatherIcon } from "@/components/WeatherIcon";
import { useIsSmallScreen } from "@/lib/pwa";

const Stat = ({ label, value, tone = "text-slate-900", testid, hint }) => (
  <div className="rounded-xl border border-slate-200 bg-white p-4">
    <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
    <div className={`font-num text-2xl font-semibold mt-1 ${tone}`} data-testid={testid}>{value}</div>
    {hint && <div className="text-xs text-slate-500 mt-1">{hint}</div>}
  </div>
);

const SideToggle = ({ side, setSide, market }) => (
  <div className="grid grid-cols-2 gap-2" data-testid="side-toggle">
    {["yes", "no"].map((s) => (
      <button
        key={s}
        onClick={() => setSide(s)}
        data-testid={`side-${s}-button`}
        className={`rounded-xl border p-3 text-left transition-colors ${side === s ? "border-[#0F4C81] bg-sky-50" : "border-slate-200 hover:bg-slate-50"}`}
      >
        <div className="text-sm font-semibold">{s === "yes" ? "YES" : "NO"} · <span className="font-num">{cents(s === "yes" ? market.yes_ask : market.no_ask)}</span></div>
        <div className="text-xs text-slate-600 mt-0.5">Pays $1 if it {s === "yes" ? "happens" : "does NOT happen"}</div>
      </button>
    ))}
  </div>
);

const useKalshiStatus = (open) => {
  const [status, setStatus] = useState(null);
  useEffect(() => {
    if (open) api.get("/kalshi/status").then(({ data }) => setStatus(data)).catch(() => setStatus({ connected: false }));
  }, [open]);
  return status;
};

export default function HedgeSheet({ open, onOpenChange, ticker, defaults = {}, onPlaced }) {
  const small = useIsSmallScreen();
  const [market, setMarket] = useState(null);
  const [side, setSide] = useState("yes");
  const [loss, setLoss] = useState(500);
  const [coverage, setCoverage] = useState(50);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const coid = useRef(null);
  const kalshi = useKalshiStatus(open);

  useEffect(() => {
    if (!open || !ticker) return;
    setMarket(null);
    setSide(defaults.side || "yes");
    setLoss(Math.round(defaults.loss_if_event || 500));
    setCoverage(Math.round((defaults.coverage || 0.5) * 100));
    api.get(`/markets/${ticker}`).then(({ data }) => setMarket(data)).catch((e) => toast.error(errMsg(e, "Couldn't load market")));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, ticker]);

  const price = market ? (side === "yes" ? market.yes_ask : market.no_ask) : null;
  const calc = useMemo(() => {
    const contracts = Math.max(1, Math.round((Number(loss) || 0) * (coverage / 100)));
    const cost = price ? contracts * price : 0;
    return { contracts, cost, payout: contracts, covers: loss > 0 ? Math.min(999, (contracts / loss) * 100) : 0 };
  }, [loss, coverage, price]);

  const place = async (mode) => {
    setBusy(true);
    try {
      const { data } = await api.post("/positions", {
        ticker, side, contracts: calc.contracts, mode,
        business_id: defaults.business_id || null, loss_if_event: Number(loss) || 0,
        headline: defaults.headline || market.outcome, client_order_id: mode === "kalshi" ? coid.current : null,
      });
      toast.success(mode === "paper" ? "Paper hedge placed" : "Order filled on Kalshi", {
        description: `${data.contracts} contracts for ${usd(data.cost, 2)}. Pays up to ${usd(data.max_payout)}.`,
      });
      setConfirm(false);
      onOpenChange(false);
      onPlaced?.(data);
    } catch (e) {
      toast.error(errMsg(e, "Order failed"));
    } finally {
      setBusy(false);
    }
  };

  const openConfirm = () => { coid.current = crypto.randomUUID(); setConfirm(true); };
  const priceGone = market && (!price || price >= 1);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={small ? "bottom" : "right"}
        className={small ? "max-h-[92vh] overflow-y-auto rounded-t-3xl px-5 pb-[calc(env(safe-area-inset-bottom)+24px)]" : "w-full sm:max-w-xl overflow-y-auto"}
        data-testid="hedge-sheet"
      >
        {small && <div className="mx-auto -mt-2 mb-4 h-1.5 w-10 rounded-full bg-slate-300" />}
        {!market ? (
          <div className="space-y-4 mt-8"><Skeleton className="h-8 w-3/4" /><Skeleton className="h-40" /><Skeleton className="h-24" /></div>
        ) : (
          <div className="space-y-6">
            <SheetHeader className="text-left">
              <div className="flex items-center gap-3">
                <WeatherIcon kind={market.kind} />
                <div className="text-xs text-slate-500">{market.city} · {market.kind_label}</div>
              </div>
              <SheetTitle className="font-display text-2xl" data-testid="hedge-sheet-title">{market.title}</SheetTitle>
              <SheetDescription>
                Outcome: <span className="font-medium text-slate-800">{market.outcome}</span> · Closes {closeLabel(market.close_time)}
              </SheetDescription>
            </SheetHeader>

            <div className="rounded-xl bg-sky-50 border border-sky-100 p-4 text-sm text-slate-700 flex gap-3">
              <Info size={18} className="text-sky-700 shrink-0 mt-0.5" />
              <p>A <b>contract</b> costs a few cents to a dollar and pays exactly <b>$1.00</b> if your chosen outcome happens. If it doesn't, you lose what you paid — just like an insurance premium.</p>
            </div>

            <SideToggle side={side} setSide={setSide} market={market} />

            <div className="space-y-4">
              <label className="block">
                <span className="text-sm font-medium">How much would this weather cost you?</span>
                <div className="relative mt-1.5">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">$</span>
                  <Input type="number" min="0" value={loss} onChange={(e) => setLoss(e.target.value)} className="pl-7 font-num" data-testid="loss-input" />
                </div>
              </label>
              <div>
                <div className="flex justify-between text-sm"><span className="font-medium">Coverage level</span><span className="font-num" data-testid="coverage-value">{coverage}%</span></div>
                <Slider value={[coverage]} min={10} max={100} step={5} onValueChange={(v) => setCoverage(v[0])} className="mt-3" data-testid="coverage-slider" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Stat label="You spend" value={usd(calc.cost, 2)} testid="calc-cost" hint={`${calc.contracts} contracts × ${cents(price)}`} />
              <Stat label="Payout if it hits" value={usd(calc.payout)} tone="text-emerald-600" testid="calc-payout" />
            </div>
            <p className="text-sm text-slate-700" data-testid="calc-sentence">
              Spend <b className="font-num">{usd(calc.cost, 2)}</b>. If {side === "yes" ? `"${market.outcome}" happens` : `"${market.outcome}" does not happen`}, it pays <b className="font-num text-emerald-700">{usd(calc.payout)}</b>, covering <b className="font-num">{calc.covers.toFixed(0)}%</b> of your lost sales.
            </p>

            <Accordion type="single" collapsible defaultValue="rules" className="rounded-xl border border-slate-200 px-4">
              <AccordionItem value="rules" className="border-none">
                <AccordionTrigger data-testid="settlement-rules-toggle">How Kalshi decides the result (settlement)</AccordionTrigger>
                <AccordionContent className="text-sm text-slate-700 space-y-3" data-testid="settlement-rules">
                  <p>{market.rules_primary}</p>
                  <p className="whitespace-pre-line text-slate-600">{market.rules_secondary}</p>
                  {market.settlement_sources?.map((s) => (
                    <a key={s.url} href={s.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sky-700 underline mr-3">{s.name} <ExternalLink size={12} /></a>
                  ))}
                </AccordionContent>
              </AccordionItem>
            </Accordion>

            {priceGone ? (
              <p className="text-sm text-amber-700">No one is selling this side right now. Try the other side or another contract.</p>
            ) : (
              <div className="space-y-3">
                <Button className="w-full h-12 rounded-xl bg-[#0F4C81] hover:bg-[#0A3860]" disabled={busy} onClick={() => place("paper")} data-testid="paper-trade-button">
                  <FlaskConical size={18} className="mr-2" /> Paper trade (no real money)
                </Button>
                {kalshi?.connected ? (
                  <Button variant="outline" className="w-full h-12 rounded-xl" disabled={busy} onClick={openConfirm} data-testid="place-kalshi-button">
                    <Zap size={18} className="mr-2" /> Place on Kalshi ({kalshi.environment === "live" ? "Live" : "Demo"})
                  </Button>
                ) : (
                  <p className="text-sm text-slate-600 text-center">Want to place it for real? <Link to="/settings" className="text-sky-700 underline" data-testid="connect-kalshi-link">Connect your Kalshi account</Link></p>
                )}
              </div>
            )}
            <p className="text-xs text-slate-500">RainCheck suggests hedges but does not give financial advice. Prices are live from Kalshi and may change.</p>
          </div>
        )}

        <AlertDialog open={confirm} onOpenChange={setConfirm}>
          <AlertDialogContent data-testid="confirm-order-dialog">
            <AlertDialogHeader>
              <AlertDialogTitle className="font-display flex items-center gap-2"><ShieldCheck className="text-[#0F4C81]" /> Confirm your Kalshi order</AlertDialogTitle>
              <AlertDialogDescription>This places a real order on your Kalshi account. It fills immediately at this price or is cancelled.</AlertDialogDescription>
            </AlertDialogHeader>
            {market && (
              <dl className="grid grid-cols-2 gap-y-2 text-sm" data-testid="confirm-order-details">
                <dt className="text-slate-500">Contract</dt><dd className="font-num text-xs break-all">{ticker}</dd>
                <dt className="text-slate-500">Outcome</dt><dd>{market.outcome}</dd>
                <dt className="text-slate-500">Side</dt><dd className="font-semibold">Buy {side.toUpperCase()}</dd>
                <dt className="text-slate-500">Quantity</dt><dd className="font-num">{calc.contracts}</dd>
                <dt className="text-slate-500">Price each</dt><dd className="font-num">{usd(price, 2)}</dd>
                <dt className="text-slate-500">Max cost</dt><dd className="font-num font-semibold">{usd(calc.cost, 2)}</dd>
                <dt className="text-slate-500">Environment</dt>
                <dd className={kalshi?.environment === "live" ? "text-rose-600 font-semibold" : "text-teal-700 font-semibold"} data-testid="confirm-environment">
                  {kalshi?.environment === "live" ? "LIVE — real money" : "Demo — test money"}
                </dd>
              </dl>
            )}
            <AlertDialogFooter>
              <AlertDialogCancel data-testid="confirm-order-cancel">Cancel</AlertDialogCancel>
              <AlertDialogAction disabled={busy} onClick={(e) => { e.preventDefault(); place("kalshi"); }} className="bg-[#0F4C81]" data-testid="confirm-order-submit">
                {busy ? "Placing…" : "Place order"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SheetContent>
    </Sheet>
  );
}
