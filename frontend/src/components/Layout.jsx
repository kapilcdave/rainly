import { NavLink, Link } from "react-router-dom";
import { MerchantPicker } from "@/components/MerchantPicker";

const NAV = [
  { to: "/", label: "Home" },
  { to: "/checkout", label: "Checkout" },
  { to: "/dashboard", label: "Dashboard" },
  { to: "/replay", label: "Replay" },
  { to: "/onboarding", label: "Onboard" },
];

const Logo = () => (
  <Link to="/" data-testid="nav-logo" className="flex items-center gap-2.5">
    <span className="relative h-5 w-5">
      <span className="absolute inset-0 rounded-full border border-sky-400" />
      <span className="absolute bottom-0 left-1/2 h-2.5 w-2.5 -translate-x-1/2 rounded-full bg-yellow-300" />
    </span>
    <span className="text-[15px] font-medium tracking-tight text-white">RainSure</span>
  </Link>
);

const NavItem = ({ to, label, mobile }) => (
  <NavLink
    to={to}
    end
    data-testid={`nav-${label.toLowerCase()}${mobile ? "-mobile" : ""}`}
    className={({ isActive }) =>
      `whitespace-nowrap px-3 py-1.5 text-[13px] transition-colors ${isActive ? "text-white" : "text-zinc-500 hover:text-zinc-200"}`
    }
  >
    {label}
  </NavLink>
);

const Header = () => (
  <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-[#07090d]/80 backdrop-blur-xl">
    <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4 sm:px-6">
      <Logo />
      <nav className="ml-6 hidden md:flex">{NAV.map((n) => <NavItem key={n.to} {...n} />)}</nav>
      <div className="ml-auto"><MerchantPicker /></div>
    </div>
    <nav className="rs-scroll-x flex overflow-x-auto px-2 pb-2 md:hidden">
      {NAV.map((n) => <NavItem key={n.to} {...n} mobile />)}
    </nav>
  </header>
);

const Footer = () => (
  <footer data-testid="pitch-footer" className="mt-24 border-t border-white/[0.06]">
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <p className="max-w-3xl text-base font-light leading-relaxed text-zinc-300 sm:text-lg">
        Settled on official Weather Company / NWS station data via Kalshi, a CFTC-regulated exchange.
        Rain refund is a promotion offered by the merchant.
      </p>
      <p className="mt-6 text-xs text-zinc-600">Prices live from Kalshi public market data. Not insurance.</p>
    </div>
  </footer>
);

export const Layout = ({ children }) => (
  <div className="flex min-h-screen flex-col bg-[#07090d] text-zinc-200">
    <Header />
    <main className="flex-1">{children}</main>
    <Footer />
  </div>
);
