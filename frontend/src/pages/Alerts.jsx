import { useEffect, useState } from "react";
import { toast } from "sonner";
import { RefreshCw, TrendingDown, CloudSun, PartyPopper, CalendarCheck, Trash2, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api, errMsg, cents, closeLabel } from "@/lib/api";
import { WeatherIcon } from "@/components/WeatherIcon";
import { PushToggle } from "@/components/PushToggle";

const ICON = { cheaper: TrendingDown, forecast: CloudSun, payout: PartyPopper, plan: CalendarCheck };
const TONE = { cheaper: "text-emerald-700 bg-emerald-50", forecast: "text-sky-700 bg-sky-50", payout: "text-amber-700 bg-amber-50", plan: "text-[#0F4C81] bg-sky-50" };

const AlertItem = ({ a }) => {
  const Icon = ICON[a.kind] || CloudSun;
  return (
    <div className={`flex gap-4 py-4 border-b border-slate-100 last:border-0 ${a.read ? "" : "bg-sky-50/40 -mx-3 px-3 rounded-lg"}`} data-testid={`alert-${a.id}`}>
      <span className={`grid place-items-center w-10 h-10 rounded-xl shrink-0 ${TONE[a.kind] || TONE.forecast}`}><Icon size={18} /></span>
      <div className="flex-1">
        <div className="font-medium">{a.title}</div>
        <div className="text-sm text-slate-600">{a.body}</div>
        <div className="text-xs text-slate-400 mt-1">{closeLabel(a.created_at)}</div>
      </div>
    </div>
  );
};

const WatchItem = ({ w, onRemove }) => (
  <div className="flex items-center gap-3 py-3 border-b border-slate-100 last:border-0" data-testid={`watch-${w.id}`}>
    <WeatherIcon kind={w.kind} size={14} />
    <div className="flex-1 min-w-0">
      <div className="font-medium truncate">{w.headline}</div>
      <div className="text-xs text-slate-500">{w.title} · {w.side.toUpperCase()} now <span className="font-num">{cents(w.last_price)}</span>{w.target_price ? <> · alert at <span className="font-num">{cents(w.target_price)}</span></> : " · alert on a 20% drop"}</div>
    </div>
    <Button variant="ghost" size="sm" onClick={() => onRemove(w.id)} data-testid={`remove-watch-${w.id}`}><Trash2 size={15} /></Button>
  </div>
);

export default function Alerts() {
  const [alerts, setAlerts] = useState(null);
  const [watches, setWatches] = useState([]);
  const [busy, setBusy] = useState(false);
  const load = () => Promise.all([api.get("/alerts"), api.get("/watches")]).then(([a, w]) => { setAlerts(a.data); setWatches(w.data); });
  useEffect(() => { load().then(() => api.post("/alerts/read")); }, []);

  const check = async () => {
    setBusy(true);
    try { const { data } = await api.post("/alerts/check"); toast.success(data.fired ? `${data.fired} new alert${data.fired > 1 ? "s" : ""}` : "Checked live prices. No big moves yet."); await load(); }
    catch (e) { toast.error(errMsg(e)); }
    finally { setBusy(false); }
  };
  const remove = async (id) => { await api.delete(`/watches/${id}`); load(); };

  return (
    <div className="max-w-3xl space-y-8" data-testid="alerts-page">
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <h1 className="text-3xl sm:text-4xl font-semibold">Alerts</h1>
          <p className="text-slate-600 mt-2">We check Kalshi every 15 minutes and tell you when a hedge you're watching gets cheaper or the forecast shifts.</p>
        </div>
        <Button variant="outline" className="rounded-full ml-auto" onClick={check} disabled={busy} data-testid="check-now-button">
          <RefreshCw size={16} className={`mr-2 ${busy ? "animate-spin" : ""}`} /> Check now
        </Button>
      </div>
      <PushToggle />
      <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
        <h2 className="text-lg font-semibold flex items-center gap-2"><Eye size={18} className="text-[#0F4C81]" /> Watching</h2>
        {watches.length === 0 ? <p className="text-sm text-slate-500 mt-2" data-testid="empty-watches">Open any hedge and tap "Alert me if it gets cheaper".</p>
          : <div className="mt-2">{watches.map((w) => <WatchItem key={w.id} w={w} onRemove={remove} />)}</div>}
      </section>
      <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
        <h2 className="text-lg font-semibold">Recent alerts</h2>
        {alerts === null ? null : alerts.length === 0 ? <p className="text-sm text-slate-500 mt-2" data-testid="empty-alerts">No alerts yet.</p>
          : <div className="mt-2" data-testid="alerts-list">{alerts.map((a) => <AlertItem key={a.id} a={a} />)}</div>}
      </section>
    </div>
  );
}
