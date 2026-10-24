import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CalendarRange, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { api, errMsg, usd, cents } from "@/lib/api";
import { WeatherIcon, ModeBadge } from "@/components/WeatherIcon";
import PlanBuilder from "@/components/PlanBuilder";

const LEG_STYLE = { placed: "text-emerald-700", scheduled: "text-slate-500", missed: "text-slate-400 line-through", over_budget: "text-amber-700", removed: "text-slate-400 line-through" };
const LEG_LABEL = { placed: "Placed", scheduled: "On autopilot", missed: "Market closed", over_budget: "Over budget", removed: "Removed" };

const PlanCard = ({ p, onCancel }) => {
  const placed = p.legs.filter((l) => l.status === "placed").length;
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6" data-testid={`plan-card-${p.id}`}>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[180px]">
          <div className="text-xs text-slate-500">{p.business_name}</div>
          <div className="font-display text-lg font-semibold">{p.name}</div>
        </div>
        <ModeBadge mode={p.mode} environment={p.mode === "kalshi" ? undefined : null} />
        <span className={`text-xs rounded-full border px-2.5 py-0.5 ${p.status === "active" ? "bg-sky-50 text-sky-700 border-sky-200" : "bg-slate-100 text-slate-600 border-slate-200"}`}>{p.status}</span>
      </div>
      <div className="mt-4 flex justify-between text-sm"><span>{placed} of {p.legs.length} hedges placed</span><span className="font-num">{usd(p.spent, 2)} / {usd(p.budget)}</span></div>
      <Progress value={(p.spent / p.budget) * 100} className="mt-2 h-2" />
      <div className="mt-4 grid sm:grid-cols-2 gap-x-6">
        {p.legs.map((l) => (
          <div key={l.key} className="flex items-center gap-2 py-1.5 text-sm" data-testid={`plan-leg-${l.key}`}>
            <WeatherIcon kind={l.kind} size={12} boxed={false} />
            <span className="flex-1">{l.label}{l.outcome ? <span className="text-slate-500"> · {l.outcome}</span> : null}</span>
            <span className={`text-xs ${LEG_STYLE[l.status]}`}>{LEG_LABEL[l.status]}{l.price && l.status === "placed" ? ` ${cents(l.price)}` : ""}</span>
          </div>
        ))}
      </div>
      {p.status === "active" && <Button variant="ghost" size="sm" className="mt-3 text-rose-600" onClick={() => onCancel(p.id)} data-testid={`cancel-plan-${p.id}`}>Cancel plan</Button>}
    </div>
  );
};

export default function Plans() {
  const [plans, setPlans] = useState(null);
  const [biz, setBiz] = useState([]);
  const [open, setOpen] = useState(false);
  const [kalshi, setKalshi] = useState(false);
  const load = () => Promise.all([api.get("/plans"), api.get("/businesses"), api.get("/kalshi/status")]).then(([p, b, k]) => { setPlans(p.data); setBiz(b.data); setKalshi(k.data.connected); });
  useEffect(() => { load(); }, []);
  const cancel = async (id) => { try { await api.post(`/plans/${id}/cancel`); toast.success("Plan cancelled"); load(); } catch (e) { toast.error(errMsg(e)); } };

  return (
    <div className="max-w-4xl space-y-8" data-testid="plans-page">
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <h1 className="text-3xl sm:text-4xl font-semibold">Season plans</h1>
          <p className="text-slate-600 mt-2">Approve once and every weekend is covered. We place each hedge as soon as its market opens.</p>
        </div>
        <Button className="rounded-full bg-[#0F4C81] hover:bg-[#0A3860] ml-auto" disabled={!biz.length} onClick={() => setOpen(true)} data-testid="new-plan-button"><Plus size={16} className="mr-1" /> New plan</Button>
      </div>
      {plans === null ? null : plans.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center" data-testid="empty-plans">
          <CalendarRange className="mx-auto text-[#0F4C81]" />
          <p className="text-slate-600 mt-3">{biz.length ? "No plans yet. Cover your next 8 weekends in one tap." : "Add a business first, then build a season plan."}</p>
        </div>
      ) : plans.map((p) => <PlanCard key={p.id} p={p} onCancel={cancel} />)}
      <PlanBuilder open={open} onOpenChange={setOpen} businesses={biz} onCreated={load} kalshiConnected={kalshi} />
    </div>
  );
}
