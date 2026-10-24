export const TriggerBox = ({ rules, ticker, compact }) => {
  if (!rules) return null;
  return (
    <div data-testid="official-trigger" className={`rs-card ${compact ? "p-4" : "p-5"}`}>
      <p className="rs-label">Official refund trigger</p>
      <p data-testid="official-trigger-text" className={`mt-2.5 font-light leading-relaxed text-zinc-300 ${compact ? "text-xs" : "text-sm"}`}>
        {rules}
      </p>
      <p className="mt-3 border-t border-white/[0.06] pt-3 text-[11px] text-zinc-500">
        Same station data the Kalshi contract settles on — zero basis risk.
        {ticker && <span className="font-num text-zinc-600"> {ticker}</span>}
      </p>
    </div>
  );
};
