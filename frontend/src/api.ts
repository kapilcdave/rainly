const BASE = `${process.env.EXPO_PUBLIC_BACKEND_URL}/api`;

export async function api<T = any>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(BASE + path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(typeof j.detail === "string" ? j.detail : "Request failed");
  return j as T;
}

export type Merchant = {
  id: string;
  name: string;
  business_type: string;
  city: string;
  avg_booking: number;
  margin_pct: number;
  guarantees?: number;
};

export type Quote = {
  city: string;
  kind: string;
  date: string;
  event_ticker: string;
  available: boolean;
  reason: string | null;
  ticker?: string;
  title?: string;
  rules_primary?: string;
  status?: string;
  yes_ask?: number;
  yes_bid?: number;
  volume?: number;
  open_interest?: number;
  p?: number;
  fee_per_contract?: number;
  contracts?: number;
  hedge_cost?: number;
  price?: number;
  depth_within_3c?: number;
  depth_ok?: boolean;
  margin_pct: number;
  booking_value: number;
};

export type DateOption = { kind: "weekend" | "daily"; date: string; label: string };
