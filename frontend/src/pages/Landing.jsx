import { Link } from "react-router-dom";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { RainTicker } from "@/components/RainTicker";

const STEPS = [
  { title: "Customer adds a rain refund", body: "At checkout they see the live rain chance and a small add-on price for their date." },
  { title: "RainSure hedges on Kalshi", body: "One $1 YES contract per booking dollar, bought on the city's official rain market." },
  { title: "Rain triggers refunds automatically", body: "When the market settles YES, the hedge pays and every customer gets their booking back." },
];

const Hero = () => (
  <section className="relative overflow-hidden">
    <div className="rs-grid-bg absolute inset-0" />
    <div className="relative mx-auto max-w-6xl px-4 pb-24 pt-20 sm:px-6 sm:pb-32 sm:pt-28">
      <p className="rs-fade-up rs-label flex items-center gap-2">
        <span className="h-1.5 w-1.5 rounded-full bg-yellow-300" /> Priced live from Kalshi rain markets
      </p>
      <h1 className="rs-fade-up mt-6 max-w-3xl text-4xl font-medium leading-[1.04] tracking-[-0.035em] text-white sm:text-5xl lg:text-6xl" style={{ animationDelay: "80ms" }}>
        Rain shouldn't cost you <span className="text-sky-400">customers.</span>
      </h1>
      <p className="rs-fade-up mt-6 max-w-lg text-base font-light leading-relaxed text-zinc-400 md:text-lg" style={{ animationDelay: "160ms" }}>
        Offer a rain refund at checkout. If it rains on their date, they get their booking back —
        hedged on a CFTC-regulated exchange, never out of your pocket.
      </p>
      <div className="rs-fade-up mt-10 flex flex-wrap items-center gap-5" style={{ animationDelay: "240ms" }}>
        <Link to="/checkout" data-testid="hero-try-checkout-btn"
          className="group inline-flex h-11 items-center gap-2 rounded-full bg-white px-6 text-sm font-medium text-black transition-colors hover:bg-sky-300">
          Try the checkout <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </Link>
        <Link to="/onboarding" data-testid="hero-onboard-btn" className="text-sm text-zinc-400 transition-colors hover:text-white">
          Add my business →
        </Link>
      </div>
    </div>
  </section>
);

const HowItWorks = () => (
  <section className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
    <p className="rs-label">How it works</p>
    <div className="mt-10 grid gap-px overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.07] md:grid-cols-3">
      {STEPS.map((s, i) => (
        <div key={s.title} data-testid={`how-step-${i + 1}`} className="bg-[#07090d] p-7 transition-colors hover:bg-[#0b0e14]">
          <span className="font-num text-xs text-sky-400">0{i + 1}</span>
          <h3 className="mt-8 text-lg font-medium tracking-tight text-white">{s.title}</h3>
          <p className="mt-2 text-sm font-light leading-relaxed text-zinc-500">{s.body}</p>
        </div>
      ))}
    </div>
  </section>
);

const BasisRisk = () => (
  <section className="mx-auto max-w-6xl px-4 sm:px-6">
    <div className="grid items-center gap-10 md:grid-cols-2">
      <div>
        <p className="rs-label">Zero basis risk</p>
        <h2 className="mt-3 text-2xl font-medium tracking-tight text-white sm:text-3xl">One station. One answer.</h2>
        <p className="mt-4 max-w-md text-sm font-light leading-relaxed text-zinc-400 sm:text-base">
          The refund triggers on the exact official station reading the Kalshi contract settles on.
          When customers are owed money, the hedge pays out the same day.
        </p>
        <Link to="/replay" data-testid="landing-replay-link" className="mt-6 inline-flex items-center gap-1 text-sm text-sky-400 hover:text-sky-300">
          Watch a real settlement replay <ArrowUpRight className="h-4 w-4" />
        </Link>
      </div>
      <div className="rs-card font-num p-6 text-[13px] leading-relaxed text-zinc-400">
        "If the total precipitation at <span className="text-white">CLIORD</span> in Chicago … is strictly greater than <span className="text-white">0 inches</span>, then the market resolves to Yes."
        <p className="mt-4 rs-label">Kalshi · rules_primary</p>
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
