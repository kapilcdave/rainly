import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { api, errMsg, TYPE_LABELS } from "@/lib/api";
import { useMerchant } from "@/context/MerchantContext";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const FIELD = "h-11 border-white/10 bg-white/[0.02] text-zinc-100";
const LBL = "text-xs font-normal text-zinc-400";

export default function Onboarding() {
  const nav = useNavigate();
  const { refetch, setSelectedId } = useMerchant();
  const [form, setForm] = useState({ name: "", type: "patio_restaurant", city: "", avg_booking: "45" });
  const [saving, setSaving] = useState(false);
  const { data: cities = [], isLoading } = useQuery({
    queryKey: ["cities"],
    queryFn: () => api.get("/cities").then((r) => r.data),
  });
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const { data } = await api.post("/merchants", { ...form, avg_booking: Number(form.avg_booking) });
      await refetch();
      setSelectedId(data.id);
      toast.success(`${data.name} is ready to offer rain refunds`);
      nav("/checkout");
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-lg px-4 py-16 sm:px-6 sm:py-24">
      <p className="rs-label">Merchant onboarding</p>
      <h1 className="mt-3 text-4xl font-medium tracking-[-0.03em] text-white sm:text-5xl">Add your business</h1>
      <p className="mt-3 text-sm font-light text-zinc-500 sm:text-base">Cities come straight from Kalshi's live rain market list.</p>
      <form onSubmit={submit} className="mt-10 space-y-6">
        <div className="space-y-2">
          <Label htmlFor="name" className={LBL}>Business name</Label>
          <Input id="name" data-testid="onboarding-name-input" required minLength={2} value={form.name}
            onChange={(e) => set("name")(e.target.value)} placeholder="Sunny Side Food Truck" className={FIELD} />
        </div>
        <div className="grid gap-6 sm:grid-cols-2">
          <div className="space-y-2">
            <Label className={LBL}>Business type</Label>
            <Select value={form.type} onValueChange={set("type")}>
              <SelectTrigger data-testid="onboarding-type-select" className={FIELD}><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(TYPE_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k} data-testid={`onboarding-type-${k}`}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className={LBL}>City</Label>
            <Select value={form.city} onValueChange={set("city")}>
              <SelectTrigger data-testid="onboarding-city-select" className={FIELD}>
                <SelectValue placeholder={isLoading ? "Loading…" : "Pick your city"} />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {cities.map((c) => <SelectItem key={c} value={c} data-testid={`onboarding-city-${c.toLowerCase().replace(/\s+/g, "-")}`}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="avg" className={LBL}>Average booking value ($)</Label>
          <Input id="avg" data-testid="onboarding-avg-booking-input" type="number" min="1" step="0.01" required
            value={form.avg_booking} onChange={(e) => set("avg_booking")(e.target.value)} className={`font-num ${FIELD}`} />
        </div>
        <button type="submit" data-testid="onboarding-submit-btn" disabled={saving || !form.city}
          className="flex h-11 w-full items-center justify-center rounded-full bg-white text-sm font-medium text-black transition-colors hover:bg-sky-300 disabled:opacity-40">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Start offering rain refunds"}
        </button>
      </form>
    </div>
  );
}
