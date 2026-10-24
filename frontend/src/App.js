import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { MerchantProvider } from "@/context/MerchantContext";
import { Layout } from "@/components/Layout";
import Landing from "@/pages/Landing";
import Onboarding from "@/pages/Onboarding";
import Checkout from "@/pages/Checkout";
import Dashboard from "@/pages/Dashboard";
import Replay from "@/pages/Replay";

function App() {
  return (
    <MerchantProvider>
      <BrowserRouter>
        <Layout>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/onboarding" element={<Onboarding />} />
            <Route path="/checkout" element={<Checkout />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/replay" element={<Replay />} />
          </Routes>
        </Layout>
      </BrowserRouter>
      <Toaster position="top-center" richColors />
    </MerchantProvider>
  );
}

export default App;
