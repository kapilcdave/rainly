export const fonts = {
  display: "SG-700",
  displayMd: "SG-500",
  body: "PJ-400",
  bodySemi: "PJ-600",
  bodyBold: "PJ-700",
};

export function money(n: number | null | undefined, digits = 2): string {
  if (n === null || n === undefined || isNaN(n)) return "—";
  const neg = n < 0;
  const [i, d] = Math.abs(n).toFixed(digits).split(".");
  const withCommas = i.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${neg ? "−" : ""}$${withCommas}${d ? "." + d : ""}`;
}

export function pct(p: number | null | undefined): string {
  if (p === null || p === undefined) return "—";
  return `${Math.round(p * 100)}%`;
}

export const BUSINESS_LABELS: Record<string, string> = {
  patio_restaurant: "Patio restaurant",
  food_truck: "Food truck",
  outdoor_event: "Outdoor event",
  boat_tour: "Boat tour",
  car_wash: "Car wash",
  mini_golf: "Mini golf",
};

export const BUSINESS_ICONS: Record<string, string> = {
  patio_restaurant: "restaurant-outline",
  food_truck: "bus-outline",
  outdoor_event: "musical-notes-outline",
  boat_tour: "boat-outline",
  car_wash: "car-outline",
  mini_golf: "golf-outline",
};

export function niceDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return `${days[dt.getUTCDay()]} ${months[m - 1]} ${d}`;
}
