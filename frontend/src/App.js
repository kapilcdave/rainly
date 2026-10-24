import "@/App.css";
import { useEffect, useRef } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import AppShell from "@/components/AppShell";
import Landing from "@/pages/Landing";
import Dashboard from "@/pages/Dashboard";
import Onboarding from "@/pages/Onboarding";
import BusinessReport from "@/pages/BusinessReport";
import Markets from "@/pages/Markets";
import Settings from "@/pages/Settings";

const AuthCallback = () => {
  const navigate = useNavigate();
  const { setUser } = useAuth();
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    const sid = new URLSearchParams(window.location.hash.slice(1)).get("session_id");
    api
      .post("/auth/session", { session_id: sid })
      .then(({ data }) => {
        setUser(data);
        navigate("/dashboard", { replace: true, state: { user: data } });
      })
      .catch(() => navigate("/", { replace: true }));
  }, [navigate, setUser]);
  return null;
};

const Protected = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading)
    return (
      <div className="min-h-screen grid place-items-center text-slate-500" data-testid="auth-loading">
        Checking your account…
      </div>
    );
  if (!user) return <Navigate to="/" replace />;
  return <AppShell>{children}</AppShell>;
};

const AppRouter = () => {
  const location = useLocation();
  if (location.hash?.includes("session_id=")) return <AuthCallback />;
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/dashboard" element={<Protected><Dashboard /></Protected>} />
      <Route path="/onboarding" element={<Protected><Onboarding /></Protected>} />
      <Route path="/business/:id" element={<Protected><BusinessReport /></Protected>} />
      <Route path="/markets" element={<Protected><Markets /></Protected>} />
      <Route path="/settings" element={<Protected><Settings /></Protected>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

export default function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <AuthProvider>
          <AppRouter />
          <Toaster position="top-right" richColors />
        </AuthProvider>
      </BrowserRouter>
    </div>
  );
}
