import { usd } from "@/lib/api";

const MODE_STYLE = {
  live: "text-emerald-400",
  simulated: "text-yellow-300",
  seed: "text-zinc-500",
};

export const HedgeLog = ({ orders }) => (
  <div data-testid="hedge-order-log" className="overflow-x-auto">
    <table className="w-full min-w-[580px] text-left text-[13px]">
      <thead>
        <tr className="rs-label">
          <th className="pb-3 pr-3 font-medium">Time</th>
          <th className="pb-3 pr-3 font-medium">Market</th>
          <th className="pb-3 pr-3 text-right font-medium">YES qty</th>
          <th className="pb-3 pr-3 text-right font-medium">Fill</th>
          <th className="pb-3 pr-3 text-right font-medium">Cost</th>
          <th className="pb-3 pr-3 font-medium">Mode</th>
          <th className="pb-3 font-medium">Order</th>
        </tr>
      </thead>
      <tbody>
        {orders.length === 0 && (
          <tr><td colSpan={7} className="py-6 text-center text-zinc-500">No hedge orders yet.</td></tr>
        )}
        {orders.map((o) => (
          <tr key={o.id} data-testid={`hedge-order-row-${o.id}`} className="border-t border-white/[0.05] text-zinc-300">
            <td className="py-2.5 pr-3 text-xs text-zinc-500">{new Date(o.created_at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</td>
            <td className="font-num pr-3 text-xs">{o.ticker}</td>
            <td className="font-num pr-3 text-right">{o.count}</td>
            <td className="font-num pr-3 text-right">{o.fill_price.toFixed(2)}</td>
            <td className="font-num pr-3 text-right">{usd(o.cost)}</td>
            <td className={`pr-3 text-xs ${MODE_STYLE[o.mode]}`}>{o.mode}</td>
            <td className="font-num text-xs text-zinc-600">{o.kalshi_order_id}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);
