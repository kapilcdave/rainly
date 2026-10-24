import axios from "axios";

export const api = axios.create({
  baseURL: `${process.env.REACT_APP_BACKEND_URL}/api`,
  withCredentials: true,
});

export const errMsg = (e, fallback = "Something went wrong") =>
  e?.response?.data?.detail
    ? typeof e.response.data.detail === "string"
      ? e.response.data.detail
      : fallback
    : fallback;

export const usd = (n, digits = 0) =>
  n == null || isNaN(n)
    ? "—"
    : Number(n).toLocaleString("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      });

export const cents = (p) => (p == null ? "—" : `${Math.round(p * 100)}¢`);

export const closeLabel = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
};

export const KIND_NAMES = { rain: "Rain", heat: "Heat", cold: "Cold snap", snow: "Snow" };
