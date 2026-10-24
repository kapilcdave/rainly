import { Link } from "react-router-dom";
import { ArrowRight, CalendarCheck, LineChart, Undo2, ShieldCheck } from "lucide-react";
import { RainTicker } from "@/components/RainTicker";
import { Button } from "@/components/ui/button";

const DROPS = Array.from({ length: 28 }, (_, i) => ({
  left: `${(i * 37) % 100}%`,
  duration: `${1.2 + ((i * 7) % 10) / 10}s`,
  delay: `${(i * 0.23) % 2}s`,
}));

const STEPS = [
  { icon: CalendarCheck, title: "Customer adds a rain refund", body: "At checkout they see the live rain chance and a small add-on price for their date." },
  { icon: LineChart, title: "RainSure hedges on Kalshi", body: "We buy one $1 YES contract per booking dollar on the city's official Kalshi rain market." },
  { icon: Undo2, title: "Rain? Refunds go out automatically", body: "When the market settles YES, the hedge pays out and every customer gets their booking back." },
];

const Hero = () => (
  <section className="rs-grain relative overflow-hidden bg-[#091e36]">
    <img src="/images/rain.jpg" alt="" className="absolute inset-0 h-full w-full object-cover opacity-25" />
    <div className="rs-rain absolute inset-0">
      {DROPS.map((d, i) => <span key={i} style={{ left: d.left, animationDuration: d.duration, animationDelay: d.delay }} />)}
    </div>
    <div className="relative mx-auto max-w-6xl px-4 pb-20 pt-16 sm:px-6 sm:pb-28 sm:pt-24">
      <p className="rs-fade-up inline-flex items-center gap-2 rounded-full bg-yellow-300 px-3 py-1 text-xs font-bold text-[#091e36]">
        <ShieldCheck className="h-3.5 w-3.5" /> Priced live from Kalshi rain markets
      </p>
      <h1 className="rs-fade-up font-display mt-6 max-w-3xl text-4xl font-extrabold leading-[1.05] tracking-tight text-white sm:text-5xl lg:text-6xl" style={{ animationDelay: "80ms" }}>
        Rain shouldn't cost you <span className="text-yellow-300">customers.</span>
      </h1>
      <p className="rs-fade-up mt-5 max-w-xl text-base text-sky-100/90 md:text-lg" style={{ animationDelay: "160ms" }}>
        Offer a "rain refund" at checkout. If it rains on their date, they get their booking back —
        fully hedged on a CFTC-regulated exchange, so it never comes out of your pocket.
      </p>
      <div className="rs-fade-up mt-8 flex flex-wrap gap-3" style={{ animationDelay: "240ms" }}>
        <Button asChild data-testid="hero-try-checkout-btn" className="h-12 rounded-full bg-yellow-300 px-6 text-base font-bold text-[#091e36] hover:bg-yellow-400">
          <Link to="/checkout">Try the checkout <ArrowRight className="ml-1 h-4 w-4" /></Link>
        </Button>
        <Button asChild variant="outline" data-testid="hero-onboard-btn" className="h-12 rounded-full border-white/30 bg-white/10 px-6 text-base font-semibold text-white hover:bg-white/20 hover:text-white">
          <Link to="/onboarding">Add my business</Link>
        </Button>
      </div>
    </div>
  </section>
);

const HowItWorks = () => (
  <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
    <p className="text-xs font-bold uppercase tracking-widest text-sky-600">How it works</p>
    <h2 className="font-display mt-2 max-w-xl text-3xl font-bold tracking-tight text-[#091e36] sm:text-4xl">Three steps. Zero weather risk.</h2>
    <div className="mt-10 grid gap-5 md:grid-cols-3">
      {STEPS.map((s, i) => (
        <div key={s.title} data-testid={`how-step-${i + 1}`} className="group rounded-3xl border border-slate-200 bg-white p-6 transition-transform duration-300 hover:-translate-y-1">
          <div className="flex items-center justify-between">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-sky-100 text-[#0e487c] transition-colors group-hover:bg-yellow-300">
              <s.icon className="h-6 w-6" />
            </span>
            <span className="font-num text-4xl font-extrabold text-slate-100">0{i + 1}</span>
          </div>
          <h3 className="font-display mt-5 text-xl font-semibold text-[#091e36]">{s.title}</h3>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">{s.body}</p>
        </div>
      ))}
    </div>
  </section>
);

const BasisRisk = () => (
  <section className="mx-auto max-w-6xl px-4 sm:px-6">
    <div className="grid items-center gap-8 rounded-[2rem] bg-sky-100 p-6 sm:p-10 md:grid-cols-2">
      <div>
        <h2 className="font-display text-2xl font-bold tracking-tight text-[#091e36] sm:text-3xl">One station. One answer.</h2>
        <p className="mt-3 text-sm text-slate-700 sm:text-base">
          The refund triggers on the exact official station reading the Kalshi contract settles on.
          When customers are owed money, the hedge pays out the same day — no basis risk.
        </p>
        <Button asChild variant="link" data-testid="landing-replay-link" className="mt-3 px-0 text-[#0e487c]">
          <Link to="/replay">Watch a real settlement replay <ArrowRight className="ml-1 h-4 w-4" /></Link>
        </Button>
      </div>
      <div className="font-num rounded-2xl bg-white p-5 text-xs leading-relaxed text-slate-700 shadow-sm sm:text-sm">
        "If the total precipitation at <b>CLICHI</b> in Chicago … is strictly greater than <b>0 inches</b>, then the market resolves to Yes."
        <p className="mt-3 font-sans text-[11px] uppercase tracking-widest text-sky-600">From Kalshi rules_primary</p>
      </div>
    </div>
  </section>
);

export default function Landing() {
  return (
    <div data-testid="landing-page">
      <Hero />
      <RainTicker />
      <HowItWorks />
      <BasisRisk />
    </div>
  );
}
