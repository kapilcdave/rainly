import { Radio } from "lucide-react";

export const TriggerBox = ({ rules, ticker, compact }) => {
  if (!rules) return null;
  return (
    <div data-testid="official-trigger" className="rounded-2xl border border-sky-200 bg-sky-50/70 p-4">
      <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-[#0e487c]">
        <Radio className="h-3.5 w-3.5" /> Official refund trigger
      </div>
      <p data-testid="official-trigger-text" className={`mt-2 text-slate-700 ${compact ? "text-xs" : "text-sm"}`}>
        {rules}
      </p>
      <p className="mt-2 text-[11px] text-slate-500">
        Same station data the Kalshi contract settles on — refund and hedge move together, zero basis risk.
        {ticker && <span className="font-num"> · {ticker}</span>}
      </p>
    </div>
  );
};
