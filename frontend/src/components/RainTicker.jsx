import { useQuery } from "@tanstack/react-query";
import { api, pct } from "@/lib/api";

const Chip = ({ c, i }) => {
  const wet = (c.weekend ?? 0) >= 0.5;
  return (
    <div
      data-testid={i < 5 ? `ticker-city-${c.city.toLowerCase().replace(/\s+/g, "-")}` : undefined}
      className="flex items-baseline gap-2.5 border-r border-white/[0.06] px-6"
    >
      <span className="text-[13px] text-zinc-400">{c.city}</span>
      <span className={`font-num text-[15px] ${wet ? "text-sky-400" : "text-zinc-100"}`}>{pct(c.weekend)}</span>
      {c.today != null && <span className="font-num text-[11px] text-zinc-600">{pct(c.today)} today</span>}
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
    <div data-testid="live-rain-ticker" className="relative overflow-hidden border-y border-white/[0.06] py-3.5">
      <div className="absolute left-0 top-0 z-10 flex h-full items-center gap-2 bg-[#07090d] pl-4 pr-5 sm:pl-6">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
        <span className="rs-label !text-zinc-400">Weekend rain odds</span>
      </div>
      <div className="rs-marquee pl-48">
        {cities.length === 0 && <span className="px-4 text-sm text-zinc-500">Loading live odds…</span>}
        {[...cities, ...cities].map((c, i) => <Chip key={`${c.city}-${i}`} c={c} i={i} />)}
      </div>
    </div>
  );
};
