import { useEffect, useState } from "react";
import { toast } from "sonner";
import { KeyRound, Loader2, ShieldCheck, Unplug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { api, errMsg, usd } from "@/lib/api";
import { PushToggle } from "@/components/PushToggle";

const EnvPicker = ({ value, onChange }) => (
  <RadioGroup value={value} onValueChange={onChange} className="grid sm:grid-cols-2 gap-3" data-testid="kalshi-env-radio">
    {[["demo", "Demo", "Kalshi's test exchange — no real money"], ["live", "Live", "Your real Kalshi account and real money"]].map(([v, l, d]) => (
      <label key={v} className={`flex gap-3 rounded-xl border p-4 cursor-pointer transition-colors ${value === v ? "border-[#0F4C81] bg-sky-50" : "border-slate-200"}`}>
        <RadioGroupItem value={v} data-testid={`kalshi-env-${v}`} className="mt-1" />
        <div><div className="font-medium">{l}</div><div className="text-xs text-slate-600">{d}</div></div>
      </label>
    ))}
  </RadioGroup>
);

const Connected = ({ status, onDisconnect }) => {
  const [bal, setBal] = useState(null);
  useEffect(() => { api.get("/kalshi/balance").then(({ data }) => setBal(data)).catch(() => {}); }, []);
  return (
    <div className="rounded-2xl border border-emerald-200 bg-white p-6 sm:p-8 space-y-4" data-testid="kalshi-connected">
      <div className="flex items-center gap-3 text-emerald-700 font-medium"><ShieldCheck size={20} /> Kalshi connected · {status.environment === "live" ? "Live" : "Demo"}</div>
      <p className="text-sm text-slate-600">Key ID ending {status.key_id_hint}. Your private key is encrypted and never shown again.</p>
      {bal?.balance != null && <p className="text-sm">Available balance: <span className="font-num font-semibold" data-testid="kalshi-balance">{usd(bal.balance / 100, 2)}</span></p>}
      <Button variant="outline" className="rounded-full text-rose-600" onClick={onDisconnect} data-testid="kalshi-disconnect-button"><Unplug size={16} className="mr-2" /> Remove keys</Button>
    </div>
  );
};

export default function Settings() {
  const [status, setStatus] = useState(null);
  const [keyId, setKeyId] = useState("");
  const [pem, setPem] = useState("");
  const [env, setEnv] = useState("demo");
  const [busy, setBusy] = useState(false);

  const load = () => api.get("/kalshi/status").then(({ data }) => setStatus(data));
  useEffect(() => { load(); }, []);

  const save = async () => {
    setBusy(true);
    try {
      await api.put("/kalshi/credentials", { key_id: keyId, private_key: pem, environment: env });
      setPem(""); setKeyId("");
      toast.success("Kalshi connected");
      load();
    } catch (e) { toast.error(errMsg(e, "Couldn't connect")); }
    finally { setBusy(false); }
  };
  const disconnect = async () => { await api.delete("/kalshi/credentials"); toast.success("Keys removed"); load(); };

  return (
    <div className="max-w-2xl space-y-8" data-testid="settings-page">
      <div>
        <h1 className="text-3xl sm:text-4xl font-semibold">Settings</h1>
        <p className="text-slate-600 mt-2">Connect your own Kalshi account to place real hedges. Paper trading works without this.</p>
      </div>
      <PushToggle />
      {status?.connected ? <Connected status={status} onDisconnect={disconnect} /> : (        <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 space-y-6" data-testid="kalshi-connect-form">
          <div className="flex items-center gap-3 font-medium"><KeyRound size={20} className="text-[#0F4C81]" /> Connect Kalshi</div>
          <ol className="text-sm text-slate-600 list-decimal pl-5 space-y-1">
            <li>On Kalshi (or demo.kalshi.co for Demo), open Account & security → API Keys.</li>
            <li>Create a key and download the private key file.</li>
            <li>Paste the Key ID and the full file contents below.</li>
          </ol>
          <EnvPicker value={env} onChange={setEnv} />
          <label className="block"><span className="text-sm font-medium">API Key ID</span>
            <Input value={keyId} onChange={(e) => setKeyId(e.target.value)} className="mt-1.5 font-num" data-testid="kalshi-key-id-input" /></label>
          <label className="block"><span className="text-sm font-medium">Private key (RSA or Ed25519, PEM)</span>
            <Textarea rows={6} value={pem} onChange={(e) => setPem(e.target.value)} placeholder="-----BEGIN PRIVATE KEY-----" className="mt-1.5 font-num text-xs" data-testid="kalshi-private-key-input" /></label>
          <Button onClick={save} disabled={busy || keyId.length < 4 || pem.length < 60} className="rounded-full bg-[#0F4C81] hover:bg-[#0A3860]" data-testid="kalshi-save-button">
            {busy && <Loader2 size={16} className="mr-2 animate-spin" />} Verify & save keys
          </Button>
          <p className="text-xs text-slate-500">We check the keys with Kalshi before saving. They're stored encrypted and only used to place orders you confirm.</p>
        </div>
      )}
    </div>
  );
}
