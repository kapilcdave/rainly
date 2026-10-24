import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { CloudRain, Sun, Undo2, Landmark, Wallet, Play, Loader2 } from "lucide-react";
import { api, usd } from "@/lib/api";
import { useMerchant } from "@/context/MerchantContext";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TriggerBox } from "@/components/TriggerBox";

const BOOKINGS = 40;

const Step = ({ i, icon: Icon, title, value, tone, run }) => (
  <motion.div
    key={`${run}-${i}`}
    initial={{ opacity: 0, x: -16 }}
    animate={{ opacity: 1, x: 0 }}
    transition={{ delay: i * 0.7, duration: 0.45 }}
    className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4"
  >
    <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${tone}`}><Icon className="h-5 w-5" /></span>
    <p className="flex-1 text-sm font-semibold text-slate-700">{title}</p>
    <p className="font-num text-xl font-extrabold text-[#091e36]">{value}</p>
  </motion.div>
);

const Timeline = ({ ticker, value, testid }) => {
  const [run, setRun] = useState(0);
  const { data, isLoading } = useQuery({
    queryKey: ["replay", ticker, value],
    queryFn: () => api.get(`/replay/${ticker}`, { params: { bookings: BOOKINGS, booking_value: value } }).then((r) => r.data),
    enabled: !!ticker,
  });
  if (!ticker) return <p className="text-sm text-slate-500">No settled market of this kind for this city.</p>;
  if (isLoading || !data) return <Loader2 className="h-5 w-5 animate-spin text-sky-600" />;
  const yes = data.result === "yes";
  return (
    <div data-testid={testid} className="space-y-3">
      <p className="text-xs text-slate-500">{data.title} · priced at <span className="font-num">${data.p.toFixed(2)}</span> → refund {usd(data.price)} each</p>
      <Step run={run} i={0} icon={yes ? CloudRain : Sun} tone={yes ? "bg-sky-100 text-sky-700" : "bg-yellow-100 text-yellow-700"}
        title={`Market settled ${yes ? "YES — it rained" : "NO — stayed dry"}`} value={data.result.toUpperCase()} />
      <Step run={run} i={1} icon={Undo2} tone="bg-rose-100 text-rose-600"
        title={yes ? `${data.bookings} refunds issued` : "Refunds issued"} value={yes ? `−${usd(data.refunds, 0)}` : "$0"} />
      <Step run={run} i={2} icon={Landmark} tone="bg-emerald-100 text-emerald-700"
        title={yes ? `Hedge paid ${(data.bookings * data.contracts).toLocaleString()} × $1` : "Hedge expired worthless"} value={yes ? `+${usd(data.hedge_payout, 0)}` : "$0"} />
      <motion.div key={`net-${run}`} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 2.1 }}
        className={`flex items-center justify-between rounded-2xl p-5 ${yes ? "bg-[#0e487c] text-white" : "bg-yellow-300 text-[#091e36]"}`}>
        <span className="flex items-center gap-2 text-sm font-bold"><Wallet className="h-5 w-5" /> Merchant net</span>
        <span data-testid={`${testid}-net`} className="font-num text-3xl font-extrabold">{usd(data.net)}</span>
      </motion.div>
      <p className="text-xs text-slate-500">Premiums {usd(data.premium)} − hedge cost {usd(data.hedge_cost)}{yes ? ` + payout ${usd(data.hedge_payout, 0)} − refunds ${usd(data.refunds, 0)}` : ""}</p>
      <Button variant="outline" size="sm" className="rounded-full" onClick={() => setRun((r) => r + 1)} data-testid={`${testid}-replay-btn`}>
        <Play className="mr-1 h-3.5 w-3.5" /> Replay
      </Button>
      <TriggerBox rules={data.rules_primary} ticker={data.ticker} compact />
    </div>
  );
};

const Column = ({ title, list, value, testid }) => {
  const [ticker, setTicker] = useState("");
  useEffect(() => {
    setTicker(list[0]?.ticker || "");
  }, [list]);
  return (
    <div className="space-y-4 rounded-3xl bg-slate-100/70 p-4 sm:p-6">
      <h2 className="font-display text-lg font-semibold text-[#091e36]">{title}</h2>
      {list.length > 0 && (
        <Select value={ticker} onValueChange={setTicker}>
          <SelectTrigger data-testid={`${testid}-date-select`} className="h-11 bg-white"><SelectValue /></SelectTrigger>
          <SelectContent className="max-h-72">
            {list.map((m) => <SelectItem key={m.ticker} value={m.ticker}>{m.product === "weekend" ? "Weekend · " : "Day · "}{m.ticker.split("-")[1]}</SelectItem>)}
          </SelectContent>
        </Select>
      )}
      <Timeline ticker={ticker} value={value} testid={testid} />
    </div>
  );
};

export default function Replay() {
  const { merchant } = useMerchant();
  const city = merchant?.city;
  const { data, isLoading } = useQuery({
    queryKey: ["replay-markets", city],
    queryFn: () => api.get("/replay/markets", { params: { city } }).then((r) => r.data),
    enabled: !!city,
  });
  const markets = data?.markets || [];
  const yes = markets.filter((m) => m.result === "yes");
  const no = markets.filter((m) => m.result === "no");
  return (
    <div data-testid="replay-page" className="mx-auto max-w-6xl space-y-8 px-4 py-10 sm:px-6">
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-sky-600">Settlement replay · {city}</p>
        <h1 className="font-display mt-2 text-4xl font-extrabold tracking-tight text-[#091e36] sm:text-5xl">What actually happened.</h1>
        <p className="mt-3 max-w-xl text-sm text-slate-600 sm:text-base">
          Real settled Kalshi rain markets for {city}, replayed for {BOOKINGS} bookings at {usd(merchant?.avg_booking)} — {merchant?.name}.
        </p>
      </div>
      {isLoading ? <Loader2 className="h-6 w-6 animate-spin text-sky-600" /> : (
        <div className="grid gap-6 lg:grid-cols-2">
          <Column title="It rained (YES)" list={yes} value={merchant?.avg_booking} testid="replay-yes" />
          <Column title="It stayed dry (NO)" list={no} value={merchant?.avg_booking} testid="replay-no" />
        </div>
      )}
    </div>
  );
}
