import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Sparkles, Loader2, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, errMsg } from "@/lib/api";

const SAMPLES = [
  "Ice cream shop in Chicago, rainy weekends kill our sales. We do about $2,500 on a good summer Saturday.",
  "Rooftop bar in Seattle. When it rains we lose most of our evening crowd, roughly $1,800 a night.",
  "Landscaping company in Denver. Heat waves over 95° force us to cancel jobs, about $1,200 a day.",
];

const Field = ({ label, children }) => (
  <label className="block"><span className="text-sm font-medium text-slate-700">{label}</span><div className="mt-1.5">{children}</div></label>
);

const ProfileForm = ({ p, set, cities }) => (
  <div className="grid sm:grid-cols-2 gap-5">
    <Field label="Business name"><Input value={p.name} onChange={(e) => set({ ...p, name: e.target.value })} data-testid="profile-name-input" /></Field>
    <Field label="Type of business"><Input value={p.business_type} onChange={(e) => set({ ...p, business_type: e.target.value })} data-testid="profile-type-input" /></Field>
    <Field label="Your city"><Input value={p.city} onChange={(e) => set({ ...p, city: e.target.value })} data-testid="profile-city-input" /></Field>
    <Field label="Kalshi weather city">
      <Select value={p.market_city} onValueChange={(v) => set({ ...p, market_city: v })}>
        <SelectTrigger data-testid="profile-market-city-select"><SelectValue /></SelectTrigger>
        <SelectContent>{cities.map((c) => <SelectItem key={c.city} value={c.city}>{c.city}</SelectItem>)}</SelectContent>
      </Select>
    </Field>
    <Field label="Typical good-day revenue ($)"><Input type="number" className="font-num" value={p.daily_revenue} onChange={(e) => set({ ...p, daily_revenue: e.target.value })} data-testid="profile-revenue-input" /></Field>
    <Field label="Lost on a bad-weather day ($)"><Input type="number" className="font-num" value={p.bad_day_loss} onChange={(e) => set({ ...p, bad_day_loss: e.target.value })} data-testid="profile-loss-input" /></Field>
    {p.city_note && <p className="sm:col-span-2 text-sm text-amber-700 flex gap-2" data-testid="profile-city-note"><MapPin size={16} /> {p.city_note}</p>}
    {p.weather_sensitivity && <p className="sm:col-span-2 text-sm text-slate-600 italic">"{p.weather_sensitivity}"</p>}
  </div>
);

export default function Onboarding() {
  const [desc, setDesc] = useState("");
  const [profile, setProfile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [cities, setCities] = useState([]);
  const navigate = useNavigate();
  useEffect(() => { api.get("/cities").then(({ data }) => setCities(data)); }, []);

  const draft = async () => {
    setBusy(true);
    try { setProfile((await api.post("/advisor/profile", { description: desc })).data); }
    catch (e) { toast.error(errMsg(e, "AI couldn't draft a profile")); }
    finally { setBusy(false); }
  };

  const save = async () => {
    setBusy(true);
    try {
      const { data } = await api.post("/businesses", { ...profile, daily_revenue: Number(profile.daily_revenue) || 0, bad_day_loss: Number(profile.bad_day_loss) || 0 });
      toast.success("Profile saved. Analyzing your weather risks…");
      navigate(`/business/${data.id}?analyze=1`);
    } catch (e) { toast.error(errMsg(e, "Couldn't save")); setBusy(false); }
  };

  return (
    <div className="max-w-3xl space-y-8" data-testid="onboarding-page">
      <div>
        <h1 className="text-3xl sm:text-4xl font-semibold">Tell us about your business</h1>
        <p className="text-slate-600 mt-2">One or two sentences is plenty. Mention your city and what weather hurts your sales.</p>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 space-y-4">
        <Textarea rows={4} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Ice cream shop in Chicago, rainy weekends kill sales…" className="text-base" data-testid="business-description-input" />
        <div className="flex flex-wrap gap-2">
          {SAMPLES.map((s, i) => (
            <button key={i} onClick={() => setDesc(s)} className="text-xs rounded-full border border-slate-200 px-3 py-1.5 text-slate-600 hover:bg-sky-50 hover:border-sky-200 transition-colors" data-testid={`sample-description-${i}`}>
              {s.split(",")[0]}
            </button>
          ))}
        </div>
        <Button onClick={draft} disabled={busy || desc.trim().length < 5} className="rounded-full bg-[#0F4C81] hover:bg-[#0A3860]" data-testid="draft-profile-button">
          {busy && !profile ? <Loader2 size={16} className="mr-2 animate-spin" /> : <Sparkles size={16} className="mr-2" />} Draft my profile
        </Button>
      </div>
      {profile && (
        <div className="rounded-2xl border border-sky-200 bg-white p-6 sm:p-8 space-y-6 rise" data-testid="profile-draft">
          <div><h2 className="text-xl font-semibold">Here's what we understood</h2><p className="text-sm text-slate-600 mt-1">Adjust anything that's off. These numbers size your hedges.</p></div>
          <ProfileForm p={profile} set={setProfile} cities={cities} />
          <Button onClick={save} disabled={busy} className="rounded-full bg-[#0F4C81] hover:bg-[#0A3860]" data-testid="save-profile-button">
            {busy && <Loader2 size={16} className="mr-2 animate-spin" />} Save & analyze my risks
          </Button>
        </div>
      )}
    </div>
  );
}
