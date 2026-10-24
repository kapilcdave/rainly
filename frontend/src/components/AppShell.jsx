import { NavLink, Link } from "react-router-dom";
import { Umbrella, LogOut, LayoutDashboard, CloudRain, PlusCircle, Settings as Cog } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";

const NAV = [
  ["/dashboard", "Dashboard", LayoutDashboard, "dashboard"],
  ["/markets", "Markets", CloudRain, "weather-markets"],
  ["/onboarding", "Add business", PlusCircle, "add-business"],
  ["/settings", "Settings", Cog, "settings"],
];

export const Logo = () => (
  <Link to="/" className="flex items-center gap-2" data-testid="logo-link">
    <img src="/icon-192.png" alt="" className="w-9 h-9 rounded-xl" />
    <span className="font-display text-xl font-semibold text-slate-900">RainCheck</span>
  </Link>
);

const TabBar = () => (
  <nav
    className="md:hidden fixed bottom-0 inset-x-0 z-50 bg-white/90 backdrop-blur-md border-t border-slate-200 grid grid-cols-4"
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
        <Icon size={22} strokeWidth={1.8} />
        {label}
      </NavLink>
    ))}
  </nav>
);

export default function AppShell({ children }) {
  const { user, logout } = useAuth();
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
                {label}
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
      <TabBar />
    </div>
  );
}
