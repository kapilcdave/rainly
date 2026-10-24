import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Loader2, RefreshCw, ShieldCheck, Trash2, CalendarRange } from "lucide-react";
import PlanBuilder from "@/components/PlanBuilder";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api, errMsg, usd, cents, closeLabel } from "@/lib/api";
import { WeatherIcon } from "@/components/WeatherIcon";
import HedgeSheet from "@/components/HedgeSheet";
import { PositionRow } from "@/pages/Dashboard";

const SEV = { high: "bg-rose-50 text-rose-700 border-rose-200", medium: "bg-amber-50 text-amber-700 border-amber-200", low: "bg-slate-100 text-slate-600 border-slate-200" };

const RiskCard = ({ r, i }) => (
  <div className="rounded-xl border border-slate-200 bg-white p-6 rise" style={{ animationDelay: `${i * 0.08}s` }} data-testid={`risk-card-${i}`}>
    <div className="flex items-center gap-3"><WeatherIcon kind={r.type} /><span className={`text-xs rounded-full border px-2.5 py-0.5 ${SEV[r.severity] || SEV.low}`}>{r.severity} risk</span></div>
    <h3 className="text-lg font-semibold mt-4">{r.title}</h3>
    <p className="text-sm text-slate-600 mt-2 leading-relaxed">{r.explanation}</p>
  </div>
);

const HedgeCard = ({ h, i, onOpen }) => {
  const contracts = Math.max(1, Math.round(h.loss_if_event * h.coverage));
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 flex flex-col rise" style={{ animationDelay: `${i * 0.1}s` }} data-testid={`hedge-card-${i}`}>
      <div className="flex items-center gap-3"><WeatherIcon kind={h.market.kind} /><div className="text-xs text-slate-500">{h.market.city} · closes {closeLabel(h.market.close_time)}</div></div>
      <h3 className="text-lg font-semibold mt-4">{h.headline}</h3>
      <p className="text-sm text-slate-600 mt-2 leading-relaxed flex-1">{h.rationale}</p>
      <div className="grid grid-cols-3 gap-3 mt-6 text-sm">
        <div><div className="text-xs text-slate-500">Buy</div><div className="font-semibold">{h.side.toUpperCase()} @ <span className="font-num">{cents(h.price)}</span></div></div>
        <div><div className="text-xs text-slate-500">Cost</div><div className="font-num font-semibold">{usd(contracts * h.price, 2)}</div></div>
        <div><div className="text-xs text-slate-500">Pays</div><div className="font-num font-semibold text-emerald-600">{usd(contracts)}</div></div>
      </div>
      <p className="text-xs text-slate-400 mt-2">Prices as of the report. Live price shown when you review.</p>
      <Button className="mt-4 rounded-full bg-[#0F4C81] hover:bg-[#0A3860]" onClick={() => onOpen(h)} data-testid={`review-hedge-button-${i}`}>
        <ShieldCheck size={16} className="mr-2" /> Review this hedge
      </Button>
    </div>
  );
};

const PlanCTA = ({ biz }) => {
  const [open, setOpen] = useState(false);
  const [kalshi, setKalshi] = useState(false);
  const navigate = useNavigate();
  useEffect(() => { api.get("/kalshi/status").then(({ data }) => setKalshi(data.connected)).catch(() => {}); }, []);
  return (
    <section className="rounded-2xl bg-[#0F4C81] text-white p-6 sm:p-8 flex flex-wrap items-center gap-6" data-testid="plan-cta">
      <CalendarRange size={32} className="text-sky-200" />
      <div className="flex-1 min-w-[220px]">
        <h2 className="text-xl font-semibold">Cover every weekend in one tap</h2>
        <p className="text-sky-100 text-sm mt-1">Approve a season plan once. We place each weekend's hedge as its market opens, within your budget.</p>
      </div>
      <Button className="rounded-full bg-white text-[#0F4C81] hover:bg-sky-50" onClick={() => setOpen(true)} data-testid="open-plan-builder-button">Build season plan</Button>
      <PlanBuilder open={open} onOpenChange={setOpen} businesses={[biz]} defaultBusinessId={biz.id} kalshiConnected={kalshi} onCreated={() => navigate("/plans")} />
    </section>
  );
};

export default function BusinessReport() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const [biz, setBiz] = useState(null);
  const [positions, setPositions] = useState([]);
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState(null);
  const started = useRef(false);

  const loadPositions = useCallback(() => api.get("/positions").then(({ data }) => setPositions(data.filter((p) => p.business_id === id))), [id]);

  const analyze = useCallback(async () => {
    setBusy(true);
    try {
      const { data } = await api.post(`/businesses/${id}/report`);
      setBiz((b) => ({ ...b, report: data }));
    } catch (e) { toast.error(errMsg(e, "Couldn't generate report")); }
    finally { setBusy(false); }
  }, [id]);

  useEffect(() => {
    api.get(`/businesses/${id}`).then(({ data }) => {
      setBiz(data);
      if (params.get("analyze") && !started.current) { started.current = true; setParams({}, { replace: true }); analyze(); }
    }).catch(() => navigate("/dashboard"));
    loadPositions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const del = async () => { await api.delete(`/businesses/${id}`); toast.success("Business removed"); navigate("/dashboard"); };

  if (!biz) return <Skeleton className="h-64" />;
  const rep = biz.report;

  return (
    <div className="space-y-12" data-testid="business-report-page">
      <div className="flex flex-wrap items-start gap-4">
        <div>
          <div className="text-sm text-slate-500">{biz.business_type} · {biz.city}{biz.market_city !== biz.city ? ` (using ${biz.market_city} markets)` : ""}</div>
          <h1 className="text-3xl sm:text-4xl font-semibold mt-1" data-testid="business-name">{biz.name}</h1>
          <p className="text-slate-600 mt-2">Good day <span className="font-num font-semibold">{usd(biz.daily_revenue)}</span> · bad-weather day costs <span className="font-num font-semibold text-rose-600">{usd(biz.bad_day_loss)}</span></p>
        </div>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" className="rounded-full" onClick={analyze} disabled={busy} data-testid="generate-report-button">
            {busy ? <Loader2 size={16} className="mr-2 animate-spin" /> : <RefreshCw size={16} className="mr-2" />} {rep ? "Refresh with live prices" : "Analyze my risks"}
          </Button>
          <Button variant="ghost" onClick={del} data-testid="delete-business-button"><Trash2 size={16} /></Button>
        </div>
      </div>

      {busy && !rep && (
        <div className="rounded-2xl border border-sky-200 bg-sky-50 p-8 flex items-center gap-4" data-testid="report-loading">
          <Loader2 className="animate-spin text-[#0F4C81]" /> <p className="text-slate-700">Reading live Kalshi weather markets for {biz.market_city} and matching them to your risks…</p>
        </div>
      )}

      {rep && (
        <>
          <section>
            <h2 className="text-2xl font-semibold">Your weather risks</h2>
            <p className="text-slate-600 mt-2 max-w-3xl" data-testid="report-summary">{rep.summary}</p>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mt-6">{rep.risks.map((r, i) => <RiskCard key={i} r={r} i={i} />)}</div>
          </section>
          <section>
            <h2 className="text-2xl font-semibold">Suggested hedges</h2>
            <p className="text-slate-600 mt-2">Each one is a live Kalshi contract that pays when the bad weather happens.</p>
            {rep.hedges.length === 0 ? <p className="mt-6 text-slate-500">No good matches right now. Try refreshing later.</p> : (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mt-6">{rep.hedges.map((h, i) => <HedgeCard key={i} h={h} i={i} onOpen={setSheet} />)}</div>
            )}
          </section>
        </>
      )}

      <PlanCTA biz={biz} />

      <section className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
        <h2 className="text-xl font-semibold">Hedges for this business</h2>
        {positions.length === 0 ? <p className="text-slate-500 mt-3">None yet.</p> : <div className="mt-2">{positions.map((p) => <PositionRow key={p.id} p={p} />)}</div>}
      </section>

      <HedgeSheet
        open={!!sheet}
        onOpenChange={(o) => !o && setSheet(null)}
        ticker={sheet?.ticker}
        defaults={sheet ? { side: sheet.side, loss_if_event: sheet.loss_if_event, coverage: sheet.coverage, headline: sheet.headline, business_id: id } : {}}
        onPlaced={loadPositions}
      />
    </div>
  );
}
