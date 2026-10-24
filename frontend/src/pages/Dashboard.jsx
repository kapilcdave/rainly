import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Plus, Trash2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api, usd, cents, closeLabel, errMsg } from "@/lib/api";
import { WeatherIcon, ModeBadge } from "@/components/WeatherIcon";

const StatCard = ({ label, value, tone = "text-slate-900", testid, hint }) => (
  <div className="rounded-xl border border-slate-200 bg-white p-4 md:p-6 shadow-sm">
    <div className="text-xs md:text-sm text-slate-500">{label}</div>
    <div className={`font-num text-2xl md:text-3xl font-semibold mt-2 ${tone}`} data-testid={testid}>{value}</div>
    {hint && <div className="text-xs text-slate-500 mt-2">{hint}</div>}
  </div>
);

const StatusPill = ({ p }) => {
  if (p.status === "open") return <span className="text-xs rounded-full bg-sky-50 text-sky-700 border border-sky-200 px-2.5 py-0.5">Active</span>;
  return p.won
    ? <span className="text-xs rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-0.5">Paid {usd(p.payout)}</span>
    : <span className="text-xs rounded-full bg-slate-100 text-slate-600 border border-slate-200 px-2.5 py-0.5">Expired</span>;
};

export const PositionRow = ({ p, onDelete }) => (
  <div className="grid grid-cols-[auto_1fr] md:flex md:flex-wrap items-center gap-x-4 gap-y-3 py-4 border-b border-slate-100 last:border-0" data-testid={`position-row-${p.id}`}>
    <WeatherIcon kind={p.kind} size={16} />
    <div className="md:flex-1 min-w-0 md:min-w-[200px]">
      <div className="font-medium text-slate-900">{p.headline || p.outcome}</div>
      <div className="text-xs text-slate-500">{p.title} · {p.side.toUpperCase()} · {p.contracts} × {cents(p.price)} · closes {closeLabel(p.close_time)}</div>
    </div>
    <div className="col-span-2 flex flex-nowrap items-center gap-3 md:gap-4 md:contents">
    <ModeBadge mode={p.mode} environment={p.environment} />
    <div className="md:text-right md:w-28"><div className="text-xs text-slate-500">Spent</div><div className="font-num">{usd(p.cost, 2)}</div></div>
    <div className="md:text-right md:w-28"><div className="text-xs text-slate-500">Max payout</div><div className="font-num text-emerald-700">{usd(p.max_payout)}</div></div>
    <div className="md:w-24 ml-auto md:ml-0 text-right"><StatusPill p={p} /></div>
    {onDelete && p.mode === "paper" && (
      <Button variant="ghost" size="sm" onClick={() => onDelete(p.id)} data-testid={`delete-position-${p.id}`}><Trash2 size={15} /></Button>
    )}
    </div>
  </div>
);

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [positions, setPositions] = useState([]);
  const [biz, setBiz] = useState([]);

  const load = () =>
    Promise.all([api.get("/dashboard"), api.get("/positions"), api.get("/businesses")])
      .then(([s, p, b]) => { setStats(s.data); setPositions(p.data); setBiz(b.data); })
      .catch((e) => toast.error(errMsg(e, "Couldn't load dashboard")));
  useEffect(() => { load(); }, []);

  const remove = async (id) => { await api.delete(`/positions/${id}`); toast.success("Paper hedge removed"); load(); };

  if (!stats) return <div className="grid md:grid-cols-4 gap-6">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-32" />)}</div>;

  return (
    <div className="space-y-10" data-testid="dashboard-page">
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <h1 className="text-3xl sm:text-4xl font-semibold">Your weather protection</h1>
          <p className="text-slate-600 mt-2">Every hedge you hold, what it cost, and what it's paid back.</p>
        </div>
        <Link to="/onboarding" className="ml-auto hidden md:block"><Button className="rounded-full bg-[#0F4C81] hover:bg-[#0A3860]" data-testid="add-business-button"><Plus size={16} className="mr-1" /> Add a business</Button></Link>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6">
        <StatCard label="Revenue protected now" value={usd(stats.protected)} tone="text-[#0F4C81]" testid="stat-protected" hint={`${stats.active_count} active hedges`} />
        <StatCard label="Spent on protection" value={usd(stats.spent, 2)} testid="stat-spent" />
        <StatCard label="Payouts received" value={usd(stats.payouts, 2)} tone="text-emerald-600" testid="stat-payouts" hint={`${stats.settled_count} settled`} />
        <StatCard label="Net result" value={usd(stats.net, 2)} tone={stats.net >= 0 ? "text-emerald-600" : "text-rose-600"} testid="stat-net" hint="on settled hedges" />
      </div>

      <section>
        <h2 className="text-xl font-semibold mb-4">Your businesses</h2>
        {biz.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center" data-testid="empty-businesses">
            <p className="text-slate-600">Add your business and our AI will map out your weather risks in under a minute.</p>
            <Link to="/onboarding"><Button className="mt-5 rounded-full bg-[#0F4C81]" data-testid="empty-add-business-button">Get started</Button></Link>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {biz.map((b) => (
              <Link key={b.id} to={`/business/${b.id}`} className="group rounded-xl border border-slate-200 bg-white p-6 shadow-sm hover:shadow-md transition-shadow" data-testid={`business-card-${b.id}`}>
                <div className="text-xs text-slate-500">{b.business_type} · {b.city}</div>
                <div className="font-display text-lg font-semibold mt-1">{b.name}</div>
                <div className="text-sm text-slate-600 mt-3">Bad-weather day costs <span className="font-num font-semibold">{usd(b.bad_day_loss)}</span></div>
                <div className="flex items-center gap-1 text-sm text-[#0F4C81] mt-4 font-medium">{b.report ? "View risk report" : "Analyze risks"} <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" /></div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
        <h2 className="text-xl font-semibold">Hedges</h2>
        {positions.length === 0 ? (
          <p className="text-slate-500 mt-3" data-testid="empty-positions">No hedges yet. Open a risk report or browse weather markets to place your first paper trade.</p>
        ) : (
          <div className="mt-2" data-testid="positions-list">{positions.map((p) => <PositionRow key={p.id} p={p} onDelete={remove} />)}</div>
        )}
      </section>
    </div>
  );
}
