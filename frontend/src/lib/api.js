import axios from "axios";

export const api = axios.create({ baseURL: `${process.env.REACT_APP_BACKEND_URL}/api` });

export const usd = (n, d = 2) =>
  n == null ? "—" : `${n < 0 ? "−" : ""}$${Math.abs(Number(n)).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d })}`;

export const pct = (p) => (p == null ? "—" : `${Math.round(p * 100)}%`);

export const errMsg = (e) => e?.response?.data?.detail || e?.message || "Something went wrong";

export const TYPE_LABELS = {
  patio_restaurant: "Patio restaurant",
  food_truck: "Food truck",
  outdoor_event: "Outdoor event",
  boat_tour: "Boat tour",
  car_wash: "Car wash",
  mini_golf: "Mini golf",
};

export const typeImage = (t) => (t === "boat_tour" ? "/images/boat.jpg" : "/images/patio.jpg");
