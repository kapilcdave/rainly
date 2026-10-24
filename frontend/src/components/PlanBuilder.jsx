import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CalendarRange, Loader2, ShieldCheck } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, errMsg, usd } from "@/lib/api";

const RISKS = [["rain", "Wet months", "Monthly rainfall contracts"], ["cool", "Cool weekend days", "Pays if a Sat/Sun is colder than usual"], ["hot", "Scorching weekend days", "Pays if a Sat/Sun is extra hot"]];
const Chip = ({ on, onClick, children, testid }) => (
  <button onClick={onClick} data-testid={testid} className={`rounded-xl border p-3 text-left transition-colors ${on ? "border-[#0F4C81] bg-sky-50" : "border-slate-200 hover:bg-slate-50"}`}>{children}</button>
);

const Preview = ({ p }) => (
  <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 space-y-2" data-testid="plan-preview">
    <div className="grid grid-cols-2 gap-3">
      <div><div className="text-xs text-slate-500">Spent today (max)</div><div className="font-num text-xl font-semibold" data-testid="plan-now-cost">{usd(p.now_cost, 2)}</div></div>
      <div><div className="text-xs text-slate-500">Today's hedges could pay</div><div className="font-num text-xl font-semibold text-emerald-600">{usd(p.max_payout)}</div></div>
    </div>
    <p className="text-xs text-slate-600">{p.now_count} hedges can be placed now. {p.later} more get placed automatically when Kalshi opens those days' markets (usually 1–2 days ahead), always within your budget.</p>
  </div>
);

export default function PlanBuilder({ open, onOpenChange, businesses, defaultBusinessId, onCreated, kalshiConnected }) {
  const [bid, setBid] = useState(defaultBusinessId);
  const [weekends, setWeekends] = useState("8");
  const [risks, setRisks] = useState(["rain", "cool"]);
  const [coverage, setCoverage] = useState(40);
  const [budget, setBudget] = useState(500);
  const [mode, setMode] = useState("paper");
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (open) setBid(defaultBusinessId || businesses[0]?.id); }, [open, defaultBusinessId, businesses]);
  const body = { business_id: bid, weekends: Number(weekends), risks, coverage: coverage / 100, budget: Number(budget) || 0, mode };
  const key = JSON.stringify(body);
  useEffect(() => {
    if (!open || !bid || !risks.length || !(Number(budget) > 0)) { setPreview(null); return; }
    const t = setTimeout(() => api.post("/plans/preview", body).then(({ data }) => setPreview(data)).catch((e) => { setPreview(null); toast.error(errMsg(e)); }), 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, key]);

  const toggle = (r) => setRisks((rs) => (rs.includes(r) ? rs.filter((x) => x !== r) : [...rs, r]));
  const approve = async () => {
    setBusy(true);
    try {
      const { data } = await api.post("/plans", body);
      const placed = data.legs.filter((l) => l.status === "placed").length;
      toast.success("Season plan approved", { description: `${placed} hedges placed now. The rest are on autopilot.` });
      onOpenChange(false); onCreated?.(data);
    } catch (e) { toast.error(errMsg(e, "Couldn't create plan")); }
    finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg w-[calc(100%-2rem)] rounded-2xl max-h-[90vh] overflow-y-auto" data-testid="plan-builder">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl flex items-center gap-2"><CalendarRange className="text-[#0F4C81]" /> Cover every weekend</DialogTitle>
          <DialogDescription>Approve once. RainCheck places each weekend's hedge for you, never going over your budget.</DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          {businesses.length > 1 && (
            <Select value={bid} onValueChange={setBid}>
              <SelectTrigger data-testid="plan-business-select"><SelectValue /></SelectTrigger>
              <SelectContent>{businesses.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
            </Select>
          )}
          <div>
            <div className="text-sm font-medium mb-2">How long?</div>
            <div className="grid grid-cols-3 gap-2">
              {[["4", "4 weekends"], ["8", "8 weekends"], ["13", "Whole season"]].map(([v, l]) => (
                <Chip key={v} on={weekends === v} onClick={() => setWeekends(v)} testid={`plan-weekends-${v}`}><div className="text-sm font-medium">{l}</div></Chip>
              ))}
            </div>
          </div>
          <div>
            <div className="text-sm font-medium mb-2">What should it cover?</div>
            <div className="grid gap-2">
              {RISKS.map(([r, l, d]) => (
                <Chip key={r} on={risks.includes(r)} onClick={() => toggle(r)} testid={`plan-risk-${r}`}><div className="text-sm font-medium">{l}</div><div className="text-xs text-slate-600">{d}</div></Chip>
              ))}
            </div>
          </div>
          <div>
            <div className="flex justify-between text-sm"><span className="font-medium">Coverage of each bad day</span><span className="font-num">{coverage}%</span></div>
            <Slider value={[coverage]} min={10} max={100} step={5} onValueChange={(v) => setCoverage(v[0])} className="mt-3" data-testid="plan-coverage-slider" />
          </div>
          <label className="block"><span className="text-sm font-medium">Season budget (most you'll spend)</span>
            <div className="relative mt-1.5"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">$</span>
              <Input type="number" min="1" value={budget} onChange={(e) => setBudget(e.target.value)} className="pl-7 font-num" data-testid="plan-budget-input" /></div>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <Chip on={mode === "paper"} onClick={() => setMode("paper")} testid="plan-mode-paper"><div className="text-sm font-medium">Paper</div><div className="text-xs text-slate-600">No real money</div></Chip>
            <Chip on={mode === "kalshi"} onClick={() => (kalshiConnected ? setMode("kalshi") : toast.info("Connect Kalshi in Settings to run plans for real"))} testid="plan-mode-kalshi"><div className="text-sm font-medium">On Kalshi</div><div className="text-xs text-slate-600">{kalshiConnected ? "Real orders, auto-placed" : "Connect in Settings"}</div></Chip>
          </div>
          {preview && <Preview p={preview} />}
          <Button className="w-full h-12 rounded-xl bg-[#0F4C81] hover:bg-[#0A3860]" disabled={busy || !preview} onClick={approve} data-testid="plan-approve-button">
            {busy ? <Loader2 size={18} className="mr-2 animate-spin" /> : <ShieldCheck size={18} className="mr-2" />} Approve plan{mode === "kalshi" ? " (real money)" : ""}
          </Button>
          <p className="text-xs text-slate-500">You can cancel the plan at any time. Hedges already placed stay open. RainCheck does not give financial advice.</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
