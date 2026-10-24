import { NavLink, Link } from "react-router-dom";
import { CloudRain, ShieldCheck } from "lucide-react";
import { MerchantPicker } from "@/components/MerchantPicker";

const NAV = [
  { to: "/", label: "Home" },
  { to: "/checkout", label: "Checkout" },
  { to: "/dashboard", label: "Dashboard" },
  { to: "/replay", label: "Replay" },
  { to: "/onboarding", label: "Onboard" },
];

const Header = () => (
  <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/80 backdrop-blur-xl">
    <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:px-6">
      <Link to="/" data-testid="nav-logo" className="flex items-center gap-2">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#0e487c] text-yellow-300">
          <CloudRain className="h-5 w-5" />
        </span>
        <span className="font-display text-xl font-extrabold tracking-tight text-[#091e36]">RainSure</span>
      </Link>
      <nav className="ml-4 hidden gap-1 md:flex">
        {NAV.map((n) => <NavItem key={n.to} {...n} />)}
      </nav>
      <div className="ml-auto"><MerchantPicker /></div>
    </div>
    <nav className="rs-scroll-x flex gap-1 overflow-x-auto px-3 pb-2 md:hidden">
      {NAV.map((n) => <NavItem key={n.to} {...n} mobile />)}
    </nav>
  </header>
);

const NavItem = ({ to, label, mobile }) => (
  <NavLink
    to={to}
    end
    data-testid={`nav-${label.toLowerCase()}${mobile ? "-mobile" : ""}`}
    className={({ isActive }) =>
      `whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors ${
        isActive ? "bg-[#0e487c] text-white" : "text-slate-600 hover:bg-sky-50 hover:text-[#0e487c]"
      }`
    }
  >
    {label}
  </NavLink>
);

const Footer = () => (
  <footer data-testid="pitch-footer" className="mt-20 bg-[#091e36] text-slate-200">
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <div className="flex items-start gap-4">
        <ShieldCheck className="mt-1 h-7 w-7 shrink-0 text-yellow-300" />
        <p className="font-display text-lg leading-snug text-white sm:text-2xl">
          Settled on official Weather Company / NWS station data via Kalshi, a CFTC-regulated exchange.
          Rain refund is a promotion offered by the merchant.
        </p>
      </div>
      <p className="mt-8 text-xs text-slate-400">
        Prices are live from Kalshi public market data. RainSure is a demo; not insurance.
      </p>
    </div>
  </footer>
);

export const Layout = ({ children }) => (
  <div className="flex min-h-screen flex-col">
    <Header />
    <main className="flex-1">{children}</main>
    <Footer />
  </div>
);
