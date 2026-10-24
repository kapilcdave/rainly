import { useQuery } from "@tanstack/react-query";
import { CloudRain, Sun } from "lucide-react";
import { api, pct } from "@/lib/api";

const Chip = ({ c, i }) => {
  const p = c.weekend ?? c.today;
  const wet = p != null && p >= 0.5;
  return (
    <div
      data-testid={i < 5 ? `ticker-city-${c.city.toLowerCase().replace(/\s+/g, "-")}` : undefined}
      className="mx-2 flex items-center gap-3 rounded-2xl border border-white/15 bg-white/10 px-4 py-2.5 backdrop-blur-md"
    >
      {wet ? <CloudRain className="h-5 w-5 text-sky-300" /> : <Sun className="h-5 w-5 text-yellow-300" />}
      <span className="font-semibold text-white">{c.city}</span>
      <span className="font-num text-lg font-extrabold text-yellow-300">{pct(c.weekend)}</span>
      <span className="text-xs text-sky-200/80">wknd</span>
      {c.today != null && <span className="font-num text-sm text-sky-100">{pct(c.today)} today</span>}
    </div>
  );
};

export const RainTicker = () => {
  const { data } = useQuery({
    queryKey: ["ticker"],
    queryFn: () => api.get("/ticker").then((r) => r.data),
    refetchInterval: 30000,
  });
  const cities = data?.cities || [];
  return (
    <div data-testid="live-rain-ticker" className="relative overflow-hidden border-y border-white/10 bg-[#0b2a4a] py-3">
      <div className="absolute left-0 top-0 z-10 flex h-full items-center bg-[#0b2a4a] pl-4 pr-3">
        <span className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-yellow-300">
          <span className="h-2 w-2 animate-pulse rounded-full bg-yellow-300" /> Live Kalshi
        </span>
      </div>
      <div className="rs-marquee pl-32">
        {cities.length === 0 && <span className="px-4 text-sm text-sky-200">Loading live rain odds…</span>}
        {[...cities, ...cities].map((c, i) => <Chip key={`${c.city}-${i}`} c={c} i={i} />)}
      </div>
    </div>
  );
};
