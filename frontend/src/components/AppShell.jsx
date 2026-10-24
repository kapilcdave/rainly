import { NavLink, Link, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { LogOut, LayoutDashboard, CloudRain, CalendarRange, Bell, Settings as Cog } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

const NAV = [
  ["/dashboard", "Home", LayoutDashboard, "dashboard"],
  ["/markets", "Markets", CloudRain, "weather-markets"],
  ["/plans", "Plans", CalendarRange, "plans"],
  ["/alerts", "Alerts", Bell, "alerts"],
  ["/settings", "Settings", Cog, "settings"],
];

const useUnread = () => {
  const [n, setN] = useState(0);
  const { pathname } = useLocation();
  useEffect(() => { api.get("/dashboard").then(({ data }) => setN(pathname === "/alerts" ? 0 : data.unread_alerts || 0)).catch(() => {}); }, [pathname]);
  return n;
};

const Dot = ({ n }) => (n > 0 ? <span className="absolute -top-1 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-white text-[10px] leading-4 text-center font-num" data-testid="unread-badge">{n}</span> : null);

export const Logo = () => (
  <Link to="/" className="flex items-center gap-2" data-testid="logo-link">
    <img src="/icon-192.png" alt="" className="w-9 h-9 rounded-xl" />
    <span className="font-display text-xl font-semibold text-slate-900">RainCheck</span>
  </Link>
);

const TabBar = ({ unread }) => (
  <nav
    className="md:hidden fixed bottom-0 inset-x-0 z-50 bg-white/90 backdrop-blur-md border-t border-slate-200 grid grid-cols-5"
    style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    data-testid="bottom-tab-bar"
  >
    {NAV.map(([to, label, Icon, id]) => (
      <NavLink
        key={to}
        to={to}
        data-testid={`tab-${id}`}
        className={({ isActive }) => `flex flex-col items-center gap-1 pt-2.5 pb-2 text-[11px] font-medium transition-colors ${isActive ? "text-[#0F4C81]" : "text-slate-500"}`}
      >
        <span className="relative"><Icon size={22} strokeWidth={1.8} />{id === "alerts" && <Dot n={unread} />}</span>
        {label}
      </NavLink>
    ))}
  </nav>
);

export default function AppShell({ children }) {
  const { user, logout } = useAuth();
  const unread = useUnread();
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-50 backdrop-blur-md bg-white/80 border-b border-slate-200/60" style={{ paddingTop: "env(safe-area-inset-top)" }}>
        <div className="max-w-7xl mx-auto px-5 md:px-6 h-14 md:h-16 flex items-center gap-8">
          <Logo />
          <nav className="hidden md:flex items-center gap-1" data-testid="main-nav">
            {NAV.map(([to, label, , id]) => (
              <NavLink
                key={to}
                to={to}
                data-testid={`nav-${id}`}
                className={({ isActive }) =>
                  `px-3 py-2 rounded-lg text-sm font-medium transition-colors ${isActive ? "bg-sky-50 text-[#0F4C81]" : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"}`
                }
              >
                {label}{id === "alerts" && <span className="relative ml-1"><Dot n={unread} /></span>}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            {user?.picture && <img src={user.picture} alt="" className="w-8 h-8 rounded-full" />}
            <span className="hidden sm:block text-sm text-slate-600" data-testid="user-name">{user?.name}</span>
            <Button variant="ghost" size="sm" onClick={logout} data-testid="logout-button"><LogOut size={16} /></Button>
          </div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-5 md:px-6 pt-6 md:pt-10 pb-32 md:pb-12">{children}</main>
      <TabBar unread={unread} />
    </div>
  );
}
