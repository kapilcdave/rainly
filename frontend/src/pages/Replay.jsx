import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Loader2, RotateCcw } from "lucide-react";
import { api, usd } from "@/lib/api";
import { useMerchant } from "@/context/MerchantContext";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TriggerBox } from "@/components/TriggerBox";

const BOOKINGS = 40;

const Step = ({ i, title, value, dot, run }) => (
  <motion.div
    key={`${run}-${i}`}
    initial={{ opacity: 0, y: 8 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay: i * 0.7, duration: 0.45 }}
    className="flex items-center gap-4 border-t border-white/[0.06] py-4"
  >
    <span className="font-num w-5 text-xs text-zinc-600">0{i + 1}</span>
    <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
    <p className="flex-1 text-[13px] text-zinc-300">{title}</p>
    <p className="font-num text-lg text-white">{value}</p>
  </motion.div>
);

const Timeline = ({ ticker, value, testid }) => {
  const [run, setRun] = useState(0);
  const { data, isLoading } = useQuery({
    queryKey: ["replay", ticker, value],
    queryFn: () => api.get(`/replay/${ticker}`, { params: { bookings: BOOKINGS, booking_value: value } }).then((r) => r.data),
    enabled: !!ticker,
  });
  if (!ticker) return <p className="text-sm text-zinc-500">No settled market of this kind for this city.</p>;
  if (isLoading || !data) return <Loader2 className="h-4 w-4 animate-spin text-zinc-500" />;
  const yes = data.result === "yes";
  return (
    <div data-testid={testid}>
      <p className="mb-4 text-xs font-light text-zinc-500">{data.title} · priced at <span className="font-num text-zinc-300">${data.p.toFixed(2)}</span> → refund {usd(data.price)} each</p>
      {!data.offered && (
        <p data-testid={`${testid}-not-offered`} className="mb-4 rounded-lg border border-yellow-300/20 bg-yellow-300/[0.05] p-3 text-[11px] text-yellow-200/90">
          Rain odds were above 60% when priced — Rainly would not have offered this refund. Shown for illustration.
        </p>
      )}
      <Step run={run} i={0} dot={yes ? "bg-sky-400" : "bg-yellow-300"} title={`Market settled ${yes ? "YES — it rained" : "NO — stayed dry"}`} value={data.result.toUpperCase()} />
      <Step run={run} i={1} dot="bg-rose-400" title={yes ? `${data.bookings} refunds issued` : "Refunds issued"} value={yes ? `−${usd(data.refunds, 0)}` : "$0"} />
      <Step run={run} i={2} dot="bg-emerald-400" title={yes ? `Hedge paid ${(data.bookings * data.contracts).toLocaleString()} × $1` : "Hedge expired"} value={yes ? `+${usd(data.hedge_payout, 0)}` : "$0"} />
      <motion.div key={`net-${run}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 2.1, duration: 0.5 }}
        className="flex items-end justify-between border-t border-white/[0.12] pt-5">
        <span className="rs-label">Merchant net</span>
        <span data-testid={`${testid}-net`} className={`font-num text-4xl font-medium tracking-tight ${yes ? "text-sky-400" : "text-yellow-300"}`}>{usd(data.net)}</span>
      </motion.div>
      <p className="mt-3 text-[11px] text-zinc-600">Premiums {usd(data.premium)} − hedge {usd(data.hedge_cost)}{yes ? ` + payout ${usd(data.hedge_payout, 0)} − refunds ${usd(data.refunds, 0)}` : ""}</p>
      <button className="mt-4 inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white" onClick={() => setRun((r) => r + 1)} data-testid={`${testid}-replay-btn`}>
        <RotateCcw className="h-3.5 w-3.5" /> Replay
      </button>
      <div className="mt-5"><TriggerBox rules={data.rules_primary} ticker={data.ticker} compact /></div>
    </div>
  );
};

const Column = ({ title, list, value, testid }) => {
  const [ticker, setTicker] = useState("");
  useEffect(() => {
    setTicker(list[0]?.ticker || "");
  }, [list]);
  return (
    <div className="rs-card p-5 sm:p-6">
      <div className="mb-5 flex items-center justify-between gap-3">
        <h2 className="text-base font-medium text-white">{title}</h2>
        {list.length > 0 && (
          <Select value={ticker} onValueChange={setTicker}>
            <SelectTrigger data-testid={`${testid}-date-select`} className="font-num h-8 w-[170px] border-white/10 bg-transparent text-xs"><SelectValue /></SelectTrigger>
            <SelectContent className="max-h-72">
              {list.map((m) => <SelectItem key={m.ticker} value={m.ticker}>{m.product === "weekend" ? "Wknd " : "Day "}{m.ticker.split("-")[1]}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </div>
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
    <div data-testid="replay-page" className="mx-auto max-w-6xl space-y-10 px-4 py-12 sm:px-6">
      <div>
        <p className="rs-label">Settlement replay · {city}</p>
        <h1 className="mt-3 text-4xl font-medium tracking-[-0.03em] text-white sm:text-5xl">What actually happened.</h1>
        <p className="mt-4 max-w-lg text-sm font-light text-zinc-500 sm:text-base">
          Real settled Kalshi rain markets, replayed for {BOOKINGS} bookings at {usd(merchant?.avg_booking)} — {merchant?.name}.
        </p>
      </div>
      {isLoading ? <Loader2 className="h-5 w-5 animate-spin text-zinc-500" /> : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Column title="It rained" list={yes} value={merchant?.avg_booking} testid="replay-yes" />
          <Column title="It stayed dry" list={no} value={merchant?.avg_booking} testid="replay-no" />
        </div>
      )}
    </div>
  );
}
