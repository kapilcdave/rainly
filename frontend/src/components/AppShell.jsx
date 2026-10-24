import { NavLink, Link } from "react-router-dom";
import { Umbrella, LogOut } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";

const NAV = [
  ["/dashboard", "Dashboard"],
  ["/onboarding", "Add business"],
  ["/markets", "Weather markets"],
  ["/settings", "Settings"],
];

export const Logo = () => (
  <Link to="/" className="flex items-center gap-2" data-testid="logo-link">
    <span className="grid place-items-center w-9 h-9 rounded-xl bg-[#0F4C81] text-white">
      <Umbrella size={18} />
    </span>
    <span className="font-display text-xl font-semibold text-slate-900">RainCheck</span>
  </Link>
);

export default function AppShell({ children }) {
  const { user, logout } = useAuth();
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-50 backdrop-blur-md bg-white/80 border-b border-slate-200/60">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center gap-8">
          <Logo />
          <nav className="hidden md:flex items-center gap-1" data-testid="main-nav">
            {NAV.map(([to, label]) => (
              <NavLink
                key={to}
                to={to}
                data-testid={`nav-${label.toLowerCase().replace(/\s/g, "-")}`}
                className={({ isActive }) =>
                  `px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive ? "bg-sky-50 text-[#0F4C81]" : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                  }`
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            {user?.picture && <img src={user.picture} alt="" className="w-8 h-8 rounded-full" />}
            <span className="hidden sm:block text-sm text-slate-600" data-testid="user-name">{user?.name}</span>
            <Button variant="ghost" size="sm" onClick={logout} data-testid="logout-button">
              <LogOut size={16} />
            </Button>
          </div>
        </div>
        <nav className="md:hidden flex gap-1 px-4 pb-2 overflow-x-auto">
          {NAV.map(([to, label]) => (
            <NavLink key={to} to={to} className={({ isActive }) => `px-3 py-1.5 rounded-lg text-sm whitespace-nowrap ${isActive ? "bg-sky-50 text-[#0F4C81]" : "text-slate-600"}`}>
              {label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="max-w-7xl mx-auto px-6 py-10">{children}</main>
    </div>
  );
}
