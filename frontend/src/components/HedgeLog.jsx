import { usd } from "@/lib/api";

const MODE_STYLE = {
  live: "bg-emerald-100 text-emerald-700",
  simulated: "bg-yellow-100 text-yellow-800",
  seed: "bg-slate-100 text-slate-600",
};

export const HedgeLog = ({ orders }) => (
  <div data-testid="hedge-order-log" className="overflow-x-auto">
    <table className="w-full min-w-[560px] text-left text-sm">
      <thead className="text-[11px] uppercase tracking-wider text-slate-500">
        <tr>
          <th className="py-2 pr-3">Time</th>
          <th className="pr-3">Market</th>
          <th className="pr-3 text-right">YES qty</th>
          <th className="pr-3 text-right">Fill</th>
          <th className="pr-3 text-right">Cost</th>
          <th className="pr-3">Mode</th>
          <th>Order ID</th>
        </tr>
      </thead>
      <tbody>
        {orders.length === 0 && (
          <tr><td colSpan={7} className="py-6 text-center text-slate-500">No hedge orders yet.</td></tr>
        )}
        {orders.map((o) => (
          <tr key={o.id} data-testid={`hedge-order-row-${o.id}`} className="border-t border-slate-100">
            <td className="py-2 pr-3 text-xs text-slate-500">{new Date(o.created_at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</td>
            <td className="font-num pr-3 text-xs">{o.ticker}</td>
            <td className="font-num pr-3 text-right">{o.count}</td>
            <td className="font-num pr-3 text-right">${o.fill_price.toFixed(2)}</td>
            <td className="font-num pr-3 text-right">{usd(o.cost)}</td>
            <td className="pr-3"><span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${MODE_STYLE[o.mode]}`}>{o.mode}</span></td>
            <td className="font-num text-xs text-slate-500">{o.kalshi_order_id}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);
