import { createContext, useContext, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

const Ctx = createContext(null);

export const MerchantProvider = ({ children }) => {
  const [selectedId, setSelectedId] = useState(() => localStorage.getItem("rainsure_merchant") || "");
  const { data: merchants = [], refetch } = useQuery({
    queryKey: ["merchants"],
    queryFn: () => api.get("/merchants").then((r) => r.data),
  });

  useEffect(() => {
    if (merchants.length && !merchants.find((m) => m.id === selectedId)) {
      setSelectedId(merchants[0].id);
    }
  }, [merchants, selectedId]);

  useEffect(() => {
    if (selectedId) {
      localStorage.setItem("rainsure_merchant", selectedId);
    }
  }, [selectedId]);

  const merchant = merchants.find((m) => m.id === selectedId) || null;
  return (
    <Ctx.Provider value={{ merchants, merchant, setSelectedId, refetch }}>{children}</Ctx.Provider>
  );
};

export const useMerchant = () => useContext(Ctx);
