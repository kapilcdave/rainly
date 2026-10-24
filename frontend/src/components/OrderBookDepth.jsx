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
  if (!ticker) return <p className="text-sm text-slate-500">No live market for this city right now.</p>;
  const asks = (data?.asks || []).slice(0, 10).map(([p, s]) => ({ price: `$${p.toFixed(2)}`, p, size: s }));
  const limit = (ask || 0) + 0.03;
  return (
    <div data-testid="orderbook-depth">
      <div className="mb-2 flex items-center justify-between text-xs text-slate-500">
        <span>YES asks (1 − NO bids)</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-sky-500" /> ≤ ask + 3¢</span>
      </div>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={asks} margin={{ left: -18, right: 4, top: 4 }}>
            <XAxis dataKey="price" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip formatter={(v) => [`${Number(v).toLocaleString()} contracts`, "Size"]} />
            <Bar dataKey="size" radius={[6, 6, 0, 0]}>
              {asks.map((a) => <Cell key={a.price} fill={a.p <= limit + 1e-9 ? "#0ea5e9" : "#cbd5e1"} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
