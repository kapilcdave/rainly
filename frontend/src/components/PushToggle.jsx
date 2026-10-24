import { useEffect, useState } from "react";
import { toast } from "sonner";
import { BellRing, BellOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api, errMsg } from "@/lib/api";
import { currentSubscription, enablePush, disablePush, needsInstallFirst } from "@/lib/push";
import { GetAppButton } from "@/components/GetApp";

export const PushToggle = () => {
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { currentSubscription().then((s) => setOn(!!s)).catch(() => {}); }, []);

  const turnOn = async () => {
    setBusy(true);
    try {
      await enablePush();
      setOn(true);
      await api.post("/push/test").catch(() => {});
      toast.success("Phone alerts are on", { description: "We sent a test notification to this device." });
    } catch (e) { toast.error(e.message || errMsg(e)); }
    finally { setBusy(false); }
  };
  const turnOff = async () => { setBusy(true); await disablePush(); setOn(false); setBusy(false); toast.success("Phone alerts turned off"); };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 flex flex-wrap items-center gap-4" data-testid="push-toggle-card">
      <span className={`grid place-items-center w-11 h-11 rounded-xl ${on ? "bg-emerald-50 text-emerald-700" : "bg-sky-50 text-[#0F4C81]"}`}>
        {on ? <BellRing size={20} /> : <BellOff size={20} />}
      </span>
      <div className="flex-1 min-w-[180px]">
        <div className="font-medium" data-testid="push-status">{on ? "Phone alerts are on" : "Get phone alerts"}</div>
        <div className="text-sm text-slate-600">
          {needsInstallFirst() ? "On iPhone, add RainCheck to your Home Screen first, then turn alerts on from the app." : "When a hedge gets cheaper, the forecast shifts, or a hedge pays out."}
        </div>
      </div>
      {needsInstallFirst() ? (
        <GetAppButton testid="push-install-first-button" label="Install app" />
      ) : on ? (
        <Button variant="outline" className="rounded-full" onClick={turnOff} disabled={busy} data-testid="push-disable-button">Turn off</Button>
      ) : (
        <Button className="rounded-full bg-[#0F4C81] hover:bg-[#0A3860]" onClick={turnOn} disabled={busy} data-testid="push-enable-button">
          {busy && <Loader2 size={16} className="mr-2 animate-spin" />} Turn on alerts
        </Button>
      )}
    </div>
  );
};
