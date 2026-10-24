import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "@/lib/api";

export const OrderBookDepth = ({ ticker, ask }) => {
  const { data } = useQuery({
    queryKey: ["orderbook", ticker],
    queryFn: () => api.get(`/orderbook/${ticker}`).then((r) => r.data),
    enabled: !!ticker,
    refetchInterval: 15000,
  });
  if (!ticker) return <p className="text-sm text-zinc-500">No live market for this city right now.</p>;
  const asks = (data?.asks || []).slice(0, 10).map(([p, s]) => ({ price: p.toFixed(2), p, size: s }));
  const limit = (ask || 0) + 0.03;
  return (
    <div data-testid="orderbook-depth">
      <div className="mb-3 flex items-center justify-between">
        <span className="rs-label">YES ask depth</span>
        <span className="flex items-center gap-1.5 text-[11px] text-zinc-500"><span className="h-1.5 w-1.5 rounded-full bg-sky-400" /> within ask + 3¢</span>
      </div>
      <div className="h-44">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={asks} margin={{ left: -22, right: 0, top: 4 }}>
            <XAxis dataKey="price" tick={{ fontSize: 10, fill: "#52525b" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: "#52525b" }} axisLine={false} tickLine={false} />
            <Tooltip cursor={{ fill: "rgba(255,255,255,0.03)" }}
              contentStyle={{ background: "#0d1117", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, fontSize: 12 }}
              formatter={(v) => [`${Number(v).toLocaleString()} contracts`, "Size"]} labelFormatter={(l) => `$${l}`} />
            <Bar dataKey="size" radius={[3, 3, 0, 0]}>
              {asks.map((a) => <Cell key={a.price} fill={a.p <= limit + 1e-9 ? "#38bdf8" : "#27272a"} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
