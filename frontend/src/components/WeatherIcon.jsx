import { CloudRain, Sun, Snowflake, ThermometerSnowflake, Cloud } from "lucide-react";

const MAP = {
  rain: { Icon: CloudRain, cls: "bg-sky-50 text-sky-700 border-sky-200" },
  heat: { Icon: Sun, cls: "bg-amber-50 text-amber-700 border-amber-200" },
  cold: { Icon: ThermometerSnowflake, cls: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  snow: { Icon: Snowflake, cls: "bg-slate-100 text-slate-700 border-slate-300" },
};

export const WeatherIcon = ({ kind, size = 20, boxed = true }) => {
  const { Icon, cls } = MAP[kind] || { Icon: Cloud, cls: "bg-slate-50 text-slate-600 border-slate-200" };
  if (!boxed) return <Icon size={size} />;
  return (
    <span className={`inline-grid place-items-center rounded-xl border ${cls}`} style={{ width: size * 2, height: size * 2 }}>
      <Icon size={size} />
    </span>
  );
};

export const ModeBadge = ({ mode, environment }) => {
  const label = mode === "paper" ? "Paper" : environment === "live" ? "Kalshi Live" : "Kalshi Demo";
  const cls =
    mode === "paper"
      ? "bg-slate-100 text-slate-700 border-slate-200"
      : environment === "live"
      ? "bg-rose-50 text-rose-700 border-rose-200"
      : "bg-teal-50 text-teal-700 border-teal-200";
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${cls}`}>{label}</span>;
};
