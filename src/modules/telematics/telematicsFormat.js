import { format, formatDistanceStrict, parseISO } from "date-fns";

export const AXIS_TICK = { fontSize: 11, fill: "#94a3b8" };
export const AXIS_LINE = { stroke: "#e2e8f0" };
export const LEGEND_STYLE = { fontSize: 12 };
export const GRID_STROKE = "#f1f5f9";

export const STATUS_STYLES = {
  Active: "bg-emerald-100 text-emerald-700",
  Parked: "bg-slate-100 text-slate-600",
  Workshop: "bg-amber-100 text-amber-700",
  Derated: "bg-rose-100 text-rose-700",
  Silent: "bg-violet-100 text-violet-700",
};

export const SEVERITY_STYLES = {
  high: "bg-rose-100 text-rose-700",
  medium: "bg-amber-100 text-amber-700",
  low: "bg-slate-100 text-slate-600",
};

export function truncateString(str, max = 22) {
  if (!str) return "";
  return str.length > max ? `${str.slice(0, max - 1)}…` : str;
}

export function formatPct(value, digits = 1) {
  return value === null || value === undefined ? "—" : `${value.toFixed(digits)}%`;
}

export function formatNumber(value, digits = 0) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return Number(value).toLocaleString("en-IN", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** ₹ with Indian lakh / crore compaction. */
export function formatInr(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  const abs = Math.abs(value);
  if (abs >= 1e7) return `₹${(value / 1e7).toFixed(2)} Cr`;
  if (abs >= 1e5) return `₹${(value / 1e5).toFixed(2)} L`;
  return `₹${Math.round(value).toLocaleString("en-IN")}`;
}

export function formatDay(dateId) {
  return dateId ? format(parseISO(dateId), "d MMM") : "";
}

export function formatDateTime(ts) {
  return ts ? format(new Date(ts), "d MMM, HH:mm") : "—";
}

export function formatClock(ms) {
  return format(new Date(ms), "HH:mm");
}

export function formatAgo(ts, now) {
  if (!ts) return "—";
  const diffH = (now - new Date(ts).getTime()) / 36e5;
  if (diffH < 1) return "just now";
  return formatDistanceStrict(new Date(ts), now, { addSuffix: true });
}

/** Downloads rows as CSV. `columns` = [{ label, csv: (row) => value }]. */
export function downloadCsv(filename, columns, rows) {
  const escape = (v) => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [columns.map((c) => escape(c.label)).join(",")];
  for (const row of rows) lines.push(columns.map((c) => escape(c.csv(row))).join(","));
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
