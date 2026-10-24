import { useEffect, useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { ArrowRight, CloudRain, ShieldCheck, Sparkles, IceCream, TrendingDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/AppShell";
import { WeatherIcon } from "@/components/WeatherIcon";
import { useAuth } from "@/context/AuthContext";
import { api, cents } from "@/lib/api";
import { isStandalone } from "@/lib/pwa";
import { GetAppButton } from "@/components/GetApp";

const AppWelcome = ({ login }) => (
  <div className="min-h-screen flex flex-col px-6 bg-[#F8FAFC]" style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "calc(env(safe-area-inset-bottom) + 24px)" }} data-testid="app-welcome">
    <div className="flex-1 flex flex-col justify-center">
      <img src="/icon-192.png" alt="" className="w-16 h-16 rounded-2xl rise" />
      <h1 className="text-4xl font-semibold mt-8 leading-tight rise d1">Bad weather days, <span className="text-[#0F4C81]">covered.</span></h1>
      <p className="text-slate-600 mt-4 rise d2">Get paid by a weather hedge when rain, heat or snow keeps customers away.</p>
    </div>
    <Button size="lg" className="h-14 rounded-2xl bg-[#0F4C81] hover:bg-[#0A3860] text-base rise d3" onClick={login} data-testid="app-signin-button">Continue with Google</Button>
  </div>
);

const HERO = "https://images.unsplash.com/photo-1576514864427-f0809d2b66eb?crop=entropy&cs=srgb&fm=jpg&q=85&w=1400";

const Ticker = () => {
  const [items, setItems] = useState([]);
  useEffect(() => { api.get("/markets/featured").then(({ data }) => setItems(data)).catch(() => {}); }, []);
  if (!items.length) return null;
  const row = [...items, ...items];
  return (
    <div className="border-y border-slate-200 bg-white overflow-hidden" data-testid="live-ticker">
      <div className="flex gap-10 py-3 w-max marquee">
        {row.map((m, i) => (
          <div key={i} className="flex items-center gap-2 text-sm whitespace-nowrap">
            <WeatherIcon kind={m.kind} size={14} boxed={false} />
            <span className="text-slate-700">{m.title.replace("?", "")} · {m.outcome}</span>
            <span className="font-num font-semibold text-[#0F4C81]">{cents(m.yes_ask)}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

const Compare = () => (
  <div className="grid md:grid-cols-2 gap-6">
    <div className="rounded-2xl border border-slate-200 bg-white p-8">
      <div className="flex items-center gap-2 text-rose-600 font-medium"><TrendingDown size={18} /> Unprotected</div>
      <p className="mt-4 text-slate-600">It rains all Saturday. Nobody comes in for a cone.</p>
      <div className="font-num text-4xl font-semibold mt-6 text-rose-600">−$800</div>
      <p className="text-sm text-slate-500 mt-1">lost sales, gone for good</p>
    </div>
    <div className="rounded-2xl border border-[#0F4C81]/30 bg-sky-50/60 p-8">
      <div className="flex items-center gap-2 text-[#0F4C81] font-medium"><ShieldCheck size={18} /> With RainCheck</div>
      <p className="mt-4 text-slate-600">You bought 600 "will it rain" contracts at 30¢ each for $180.</p>
      <div className="font-num text-4xl font-semibold mt-6 text-emerald-600">+$600</div>
      <p className="text-sm text-slate-500 mt-1">payout lands when it rains — 75% of the loss covered</p>
    </div>
  </div>
);

const STEPS = [
  [Sparkles, "Describe your business", "One sentence. Our AI drafts your weather risk profile."],
  [CloudRain, "See your weather risks", "Rain, heat, cold snaps, snow — matched to live Kalshi contracts in your city."],
  [ShieldCheck, "Buy protection", "Pick your coverage, paper trade first, then place it for real on your own Kalshi account."],
];

export default function Landing() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const start = () => (user ? navigate("/dashboard") : login());
  if (isStandalone()) {
    if (user) return <Navigate to="/dashboard" replace />;
    return <AppWelcome login={login} />;
  }
  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <header className="max-w-7xl mx-auto px-6 h-20 flex items-center">
        <Logo />
        <Button variant="ghost" className="ml-auto" onClick={start} data-testid="header-signin-button">{user ? "Open dashboard" : "Sign in"}</Button>
      </header>

      <section className="max-w-7xl mx-auto px-6 pt-8 pb-20 grid lg:grid-cols-12 gap-12 items-center">
        <div className="lg:col-span-6">
          <div className="rise inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-sm text-sky-800"><IceCream size={14} /> Weather insurance for small businesses</div>
          <h1 className="rise d1 text-4xl sm:text-5xl lg:text-6xl font-semibold text-slate-900 mt-6 leading-[1.05]">When bad weather keeps customers away, <span className="text-[#0F4C81]">your hedge pays you instead.</span></h1>
          <p className="rise d2 mt-6 text-lg text-slate-600 max-w-xl leading-relaxed">RainCheck turns Kalshi weather contracts into plain-English protection. Tell us about your shop, and we'll show you exactly what it costs to cover a rainy weekend.</p>
          <div className="rise d3 mt-10 flex flex-wrap gap-3">
            <GetAppButton testid="hero-get-app-button" />
            <button onClick={start} className="h-12 px-6 rounded-full border border-slate-300 inline-flex items-center text-slate-700 hover:bg-white transition-colors" data-testid="hero-get-started-button">
              {user ? "Open my dashboard" : "Use in browser"} <ArrowRight size={16} className="ml-2" />
            </button>
          </div>
          <p className="rise d4 mt-4 text-sm text-slate-500">Free for iPhone and Android. No App Store needed.</p>
        </div>
        <div className="lg:col-span-6 rise d2 relative">
          <img src={HERO} alt="Rainy street outside a shop" className="rounded-3xl w-full h-[460px] object-cover" />
          <div className="absolute -bottom-6 left-6 right-6 sm:right-auto sm:w-80 rounded-2xl bg-white/90 backdrop-blur-md border border-slate-200 p-5 shadow-lg">
            <div className="flex items-center gap-3"><WeatherIcon kind="rain" size={16} /><div className="text-sm text-slate-600">Rain hedge · Chicago</div></div>
            <div className="mt-3 flex justify-between items-end">
              <div><div className="text-xs text-slate-500">You pay</div><div className="font-num text-xl font-semibold">$180</div></div>
              <div className="text-right"><div className="text-xs text-slate-500">Pays if it rains</div><div className="font-num text-xl font-semibold text-emerald-600">$600</div></div>
            </div>
          </div>
        </div>
      </section>

      <Ticker />

      <section id="how" className="max-w-7xl mx-auto px-6 py-24">
        <h2 className="text-2xl sm:text-3xl font-semibold text-slate-900 max-w-2xl">Insurance-style protection, built on prediction markets</h2>
        <div className="grid md:grid-cols-3 gap-6 mt-12">
          {STEPS.map(([Icon, t, d], i) => (
            <div key={t} className="rounded-2xl border border-slate-200 bg-white p-8 hover:shadow-md transition-shadow">
              <div className="flex items-center gap-3"><span className="font-num text-sm text-slate-400">0{i + 1}</span><Icon className="text-[#0F4C81]" size={22} /></div>
              <h3 className="text-xl font-semibold mt-6">{t}</h3>
              <p className="text-slate-600 mt-2 leading-relaxed">{d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-6 pb-24">
        <h2 className="text-2xl sm:text-3xl font-semibold text-slate-900 mb-10">The ice cream shop example</h2>
        <Compare />
      </section>

      <section className="max-w-7xl mx-auto px-6 pb-24">
        <div className="rounded-3xl bg-[#0F4C81] text-white p-10 sm:p-14 flex flex-col md:flex-row md:items-center gap-8" data-testid="download-section">
          <img src="/icon-192.png" alt="RainCheck app icon" className="w-20 h-20 rounded-2xl shadow-lg" />
          <div className="flex-1">
            <h2 className="text-2xl sm:text-3xl font-semibold">Protection in your pocket</h2>
            <p className="text-sky-100 mt-2 max-w-xl">Check your hedges between customers. Add RainCheck to your home screen and it opens full-screen, just like any other app.</p>
          </div>
          <GetAppButton testid="footer-get-app-button" className="bg-white text-[#0F4C81] hover:bg-sky-50" />
        </div>
      </section>

      <footer className="border-t border-slate-200 py-10 text-center text-sm text-slate-500 px-6">
        RainCheck suggests hedges but does not give financial advice. Market data from Kalshi. Built at VibeCon.
      </footer>
    </div>
  );
}
