// All simulated activity happens in India Standard Time (UTC+05:30, no DST).
// Timestamps are written as ISO strings with an explicit +05:30 offset so Postgres
// timestamptz stores the correct instant; date_id is the IST calendar date.

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
export const MINUTE_MS = 60 * 1000;
export const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MS = 24 * HOUR_MS;

// Epoch ms of IST midnight for a 'YYYY-MM-DD' date.
export function istMidnightMs(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return Date.UTC(y, m - 1, d) - IST_OFFSET_MS;
}

export function isoIst(ms) {
  return new Date(ms + IST_OFFSET_MS).toISOString().replace("Z", "+05:30");
}

export function dateIdIst(ms) {
  return new Date(ms + IST_OFFSET_MS).toISOString().slice(0, 10);
}

export function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export function daysBetween(fromStr, toStr) {
  return Math.round((istMidnightMs(toStr) - istMidnightMs(fromStr)) / DAY_MS);
}

// 0 = Sunday … 6 = Saturday
export function weekday(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

// Monday of the week containing dateStr.
export function weekStart(dateStr) {
  const wd = weekday(dateStr);
  return addDays(dateStr, wd === 0 ? -6 : 1 - wd);
}

export function toDateStr(value) {
  if (!value) return null;
  if (typeof value === "string") return value.slice(0, 10);
  // pg returns DATE columns as local-midnight Date objects; read local parts back.
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, "0");
  const d = String(value.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function todayIst() {
  return dateIdIst(Date.now());
}
