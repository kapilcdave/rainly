import { useEffect } from "react";
import confetti from "canvas-confetti";
import { PartyPopper } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { usd } from "@/lib/api";

const burst = () => {
  const colors = ["#0F4C81", "#0284C7", "#059669", "#FBBF24", "#ffffff"];
  confetti({ particleCount: 140, spread: 80, origin: { y: 0.6 }, colors, zIndex: 9999 });
  setTimeout(() => confetti({ particleCount: 80, angle: 60, spread: 60, origin: { x: 0 }, colors, zIndex: 9999 }), 250);
  setTimeout(() => confetti({ particleCount: 80, angle: 120, spread: 60, origin: { x: 1 }, colors, zIndex: 9999 }), 400);
};

export default function PayoutCelebration({ position: p, onClose }) {
  useEffect(() => { if (p && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) burst(); }, [p]);
  if (!p) return null;
  const covered = p.loss_if_event ? Math.min(100, Math.round((p.payout / p.loss_if_event) * 100)) : null;
  return (
    <Dialog open={!!p} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm w-[calc(100%-2rem)] rounded-3xl text-center p-8" data-testid="payout-celebration">
        <span className="mx-auto grid place-items-center w-16 h-16 rounded-2xl bg-amber-50 text-amber-600"><PartyPopper size={30} /></span>
        <DialogTitle className="font-display text-2xl mt-2">Your hedge paid out!</DialogTitle>
        <div className="font-num text-5xl font-semibold text-emerald-600" data-testid="payout-amount">{usd(p.payout)}</div>
        <DialogDescription className="text-slate-600">
          {p.headline}. You paid {usd(p.cost, 2)} for this protection{covered != null ? `, and it covered ${covered}% of the lost sales` : ""}.
          {p.simulated && <span className="block mt-2 text-xs text-slate-400">Simulated result (paper hedge)</span>}
        </DialogDescription>
        <Button className="w-full h-12 rounded-xl bg-[#0F4C81] hover:bg-[#0A3860] mt-2" onClick={onClose} data-testid="payout-close-button">Nice!</Button>
      </DialogContent>
    </Dialog>
  );
}
