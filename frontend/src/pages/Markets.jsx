import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Search } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { api, errMsg, cents, closeLabel, KIND_NAMES } from "@/lib/api";
import { WeatherIcon } from "@/components/WeatherIcon";
import HedgeSheet from "@/components/HedgeSheet";

const MarketRow = ({ m, onOpen }) => (
  <button onClick={() => onOpen(m)} className="w-full text-left flex flex-wrap items-center gap-4 px-6 py-4 border-b border-slate-100 last:border-0 hover:bg-sky-50/50 transition-colors" data-testid={`market-row-${m.ticker}`}>
    <WeatherIcon kind={m.kind} size={16} />
    <div className="flex-1 min-w-[220px]">
      <div className="font-medium text-slate-900">{m.outcome}</div>
      <div className="text-xs text-slate-500">{m.title} · closes {closeLabel(m.close_time)}</div>
    </div>
    <div className="w-20 text-right"><div className="text-xs text-slate-500">YES</div><div className="font-num font-semibold text-[#0F4C81]">{cents(m.yes_ask)}</div></div>
    <div className="w-20 text-right"><div className="text-xs text-slate-500">NO</div><div className="font-num font-semibold text-slate-700">{cents(m.no_ask)}</div></div>
  </button>
);

export default function Markets() {
  const [cities, setCities] = useState([]);
  const [city, setCity] = useState("Chicago");
  const [kind, setKind] = useState("all");
  const [q, setQ] = useState("");
  const [markets, setMarkets] = useState(null);
  const [open, setOpen] = useState(null);
  const [loss, setLoss] = useState(500);

  useEffect(() => {
    api.get("/cities").then(({ data }) => setCities(data));
    api.get("/businesses").then(({ data }) => { if (data[0]) { setCity(data[0].market_city); setLoss(data[0].bad_day_loss); } }).catch(() => {});
  }, []);

  useEffect(() => {
    setMarkets(null);
    api.get("/markets", { params: { city } }).then(({ data }) => setMarkets(data)).catch((e) => { toast.error(errMsg(e, "Couldn't load markets")); setMarkets([]); });
  }, [city]);

  const kinds = cities.find((c) => c.city === city)?.kinds || [];
  const shown = useMemo(() => (markets || []).filter((m) => (kind === "all" || m.kind === kind) && (!q || `${m.title} ${m.outcome}`.toLowerCase().includes(q.toLowerCase()))), [markets, kind, q]);

  return (
    <div className="space-y-8" data-testid="markets-page">
      <div>
        <h1 className="text-3xl sm:text-4xl font-semibold">Live weather markets</h1>
        <p className="text-slate-600 mt-2 max-w-2xl">Open Kalshi contracts on rain, temperature and snow. Prices are what one contract costs; each pays $1 if its outcome happens.</p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Select value={city} onValueChange={(v) => { setCity(v); setKind("all"); }}>
          <SelectTrigger className="w-48 bg-white" data-testid="markets-city-select"><SelectValue /></SelectTrigger>
          <SelectContent>{cities.map((c) => <SelectItem key={c.city} value={c.city}>{c.city}</SelectItem>)}</SelectContent>
        </Select>
        <Tabs value={kind} onValueChange={setKind}>
          <TabsList data-testid="markets-kind-tabs">
            <TabsTrigger value="all" data-testid="kind-tab-all">All</TabsTrigger>
            {kinds.map((k) => <TabsTrigger key={k} value={k} data-testid={`kind-tab-${k}`}>{KIND_NAMES[k]}</TabsTrigger>)}
          </TabsList>
        </Tabs>
        <div className="relative ml-auto w-full sm:w-64">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search outcomes" className="pl-9 bg-white" data-testid="markets-search-input" />
        </div>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden" data-testid="markets-list">
        {markets === null ? <div className="p-6 space-y-3">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-12" />)}</div>
          : shown.length === 0 ? <p className="p-8 text-slate-500" data-testid="markets-empty">No open contracts match right now.</p>
          : shown.map((m) => <MarketRow key={m.ticker} m={m} onOpen={setOpen} />)}
      </div>
      <HedgeSheet open={!!open} onOpenChange={(o) => !o && setOpen(null)} ticker={open?.ticker} defaults={{ side: "yes", loss_if_event: loss, coverage: 0.5 }} />
    </div>
  );
}
