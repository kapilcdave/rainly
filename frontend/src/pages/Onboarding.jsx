import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { api, errMsg, TYPE_LABELS } from "@/lib/api";
import { useMerchant } from "@/context/MerchantContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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
    <div className="mx-auto max-w-xl px-4 py-12 sm:px-6 sm:py-16">
      <p className="text-xs font-bold uppercase tracking-widest text-sky-600">Merchant onboarding</p>
      <h1 className="font-display mt-2 text-4xl font-extrabold tracking-tight text-[#091e36] sm:text-5xl">Add your business</h1>
      <p className="mt-3 text-sm text-slate-600 sm:text-base">Takes 30 seconds. Cities come straight from Kalshi's live rain market list.</p>
      <form onSubmit={submit} className="mt-8 space-y-5 rounded-3xl border border-slate-200 bg-white p-5 sm:p-8">
        <div className="space-y-2">
          <Label htmlFor="name">Business name</Label>
          <Input id="name" data-testid="onboarding-name-input" required minLength={2} value={form.name}
            onChange={(e) => set("name")(e.target.value)} placeholder="e.g. Sunny Side Food Truck" className="h-11" />
        </div>
        <div className="space-y-2">
          <Label>Business type</Label>
          <Select value={form.type} onValueChange={set("type")}>
            <SelectTrigger data-testid="onboarding-type-select" className="h-11"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(TYPE_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k} data-testid={`onboarding-type-${k}`}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>City</Label>
          <Select value={form.city} onValueChange={set("city")}>
            <SelectTrigger data-testid="onboarding-city-select" className="h-11">
              <SelectValue placeholder={isLoading ? "Loading Kalshi cities…" : "Pick your city"} />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              {cities.map((c) => <SelectItem key={c} value={c} data-testid={`onboarding-city-${c.toLowerCase().replace(/\s+/g, "-")}`}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="avg">Average booking value ($)</Label>
          <Input id="avg" data-testid="onboarding-avg-booking-input" type="number" min="1" step="0.01" required
            value={form.avg_booking} onChange={(e) => set("avg_booking")(e.target.value)} className="font-num h-11" />
        </div>
        <Button type="submit" data-testid="onboarding-submit-btn" disabled={saving || !form.city}
          className="h-12 w-full rounded-full bg-[#0e487c] text-base font-bold hover:bg-[#0b3862]">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Start offering rain refunds"}
        </Button>
      </form>
    </div>
  );
}
