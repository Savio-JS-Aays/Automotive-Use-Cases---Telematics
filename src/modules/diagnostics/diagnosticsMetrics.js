/**
 * Pure aggregations for the Vehicle Diagnostics module. Inputs are the rows returned by
 * `useDiagnosticsFleetData`, `useSignalHealthData` and `useDiagnosticsAssetData`; the tab
 * components call these inside useMemo. Every formula is documented in
 * Documentation/metrics/diagnostics.md.
 */
import { MATRIX_MIN_TRUCKS, ROLLING_DAYS, addDays, periodDates } from "../telematics/telematicsMetrics";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
export const LAMPS = [
  { id: "RSL", label: "Red stop (RSL)", color: "#e11d48" },
  { id: "PL", label: "Protect (PL)", color: "#7c3aed" },
  { id: "AWL", label: "Amber warning (AWL)", color: "#f59e0b" },
  { id: "MIL", label: "Malfunction (MIL)", color: "#0ea5e9" },
];
export const LAMP_COLORS = Object.fromEntries(LAMPS.map((l) => [l.id, l.color]));
const RED_LAMPS = new Set(["RSL", "PL"]);

export const SEVERITIES = ["critical", "major", "minor"];
const SEVERITY_RANK = { critical: 0, major: 1, minor: 2 };

export const SYSTEM_LABELS = {
  aftertreatment: "Aftertreatment",
  cooling: "Cooling",
  electrical: "Electrical",
  fuel: "Fuel",
  air_intake: "Air intake",
  brakes: "Brakes",
  transmission: "Transmission",
  powertrain: "Powertrain",
  hv_battery: "HV battery",
};
export const SYSTEM_COLORS = {
  aftertreatment: "#8b5cf6",
  cooling: "#0ea5e9",
  electrical: "#f59e0b",
  fuel: "#10b981",
  air_intake: "#14b8a6",
  brakes: "#e11d48",
  transmission: "#64748b",
  powertrain: "#0f172a",
  hv_battery: "#ec4899",
};

export const ACTION_STYLES = {
  "Immediate Service": "bg-rose-100 text-rose-700",
  "Plan Workshop": "bg-amber-100 text-amber-700",
};

/** Band states of a signal value against dim_signal (worst first). */
export const BAND_STATES = [
  { id: "critical", label: "Critical", color: "#e11d48", rank: 3 },
  { id: "warning", label: "Warning", color: "#f59e0b", rank: 2 },
  { id: "outside", label: "Outside normal", color: "#38bdf8", rank: 1 },
  { id: "normal", label: "Normal", color: "#10b981", rank: 0 },
];
const STATE_RANK = Object.fromEntries(BAND_STATES.map((s) => [s.id, s.rank]));

export const PARETO_TOP = 15;
export const HEATMAP_ROWS = 40;
export const WEAR_MIN_POINTS = 5; // daily points needed before a wear slope is trusted
export const LEAD_LOOKBACK_DAYS = 30;
export const LEAD_BUCKETS = [
  { label: "Same day", min: 0, max: 0 },
  { label: "1–3 d", min: 1, max: 3 },
  { label: "4–7 d", min: 4, max: 7 },
  { label: "8–14 d", min: 8, max: 14 },
  { label: "15–30 d", min: 15, max: 30 },
];
export const WEAR_SIGNALS = [
  { code: "BRAKE_LINING_REMAINING", label: "Brake lining" },
  { code: "HV_SOH", label: "HV battery SoH" },
];

// Freeze-frame keys every DTC carries; the one extra key is the drifting signal.
const FREEZE_STANDARD_KEYS = new Set([
  "engine_rpm",
  "ambient_temp_c",
  "coolant_temp_c",
  "engine_load_pct",
  "wheel_speed_kmh",
  "battery_voltage_v",
]);
export const FREEZE_LABELS = {
  engine_rpm: "Engine speed (rpm)",
  ambient_temp_c: "Ambient (°C)",
  coolant_temp_c: "Coolant (°C)",
  engine_load_pct: "Engine load (%)",
  wheel_speed_kmh: "Road speed (km/h)",
  battery_voltage_v: "Battery (V)",
};

export function freezeLabel(key) {
  if (FREEZE_LABELS[key]) return FREEZE_LABELS[key];
  const s = key.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Same thresholds as the Overview (Documentation/02_Domain_Theory.md §3).
export function riskBandFor(p) {
  if (p === null || p === undefined) return null;
  if (p > 0.7) return "Critical";
  if (p >= 0.4) return "High";
  if (p >= 0.2) return "Medium";
  return "Low";
}
export const RISK_STYLES = {
  Critical: "bg-rose-100 text-rose-700",
  High: "bg-amber-100 text-amber-700",
  Medium: "bg-sky-100 text-sky-700",
  Low: "bg-emerald-100 text-emerald-700",
};

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
const DAY_MS = 24 * 60 * 60 * 1000;
const num = (v) => (v === null || v === undefined || Number.isNaN(Number(v)) ? 0 : Number(v));
const ratio = (a, b, scale = 1) => (b > 0 ? (a / b) * scale : null);

function pad(n) {
  return String(n).padStart(2, "0");
}

/** Local calendar date of a timestamp (IST in the demo). */
export function dayOf(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function parseDateId(id) {
  const [y, m, d] = id.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function daysBetween(fromId, toId) {
  return Math.round((parseDateId(toId) - parseDateId(fromId)) / DAY_MS);
}

function inCurrent(period, id) {
  return Boolean(period) && id >= period.startStr && id <= period.endStr;
}

function inPrevious(period, id) {
  return Boolean(period) && id >= period.prevStartStr && id < period.startStr;
}

function quantile(sorted, p) {
  if (sorted.length === 0) return null;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

export function median(values) {
  return quantile([...values].sort((a, b) => a - b), 0.5);
}

export function isIntermittent(e) {
  return e.status === "previously_active";
}

export function actionFor(lamp) {
  return RED_LAMPS.has(lamp) ? "Immediate Service" : "Plan Workshop";
}

export function dtcLabel(e) {
  const d = e.dim_dtc ?? e;
  return d?.spn_description ? `${d.spn_description} · FMI ${d.fmi}` : e.dtc_id;
}

export function systemLabel(system) {
  return SYSTEM_LABELS[system] ?? system ?? "Other";
}

/** "Now" = the latest report in the scope (the seeded data may not be live). */
export function dataNowMs(rows, field = "last_ping_ts") {
  let max = null;
  for (const r of rows) if (r[field] && (!max || r[field] > max)) max = r[field];
  return max ? new Date(max).getTime() : Date.now();
}

/** Drifting signal recorded in a DTC's freeze frame (its one non-standard key), as a signal_code. */
export function freezeSignal(e) {
  const ff = e.freeze_frame;
  if (!ff) return null;
  const key = Object.keys(ff).find((k) => !FREEZE_STANDARD_KEYS.has(k));
  return key ? key.toUpperCase() : null;
}

// ---------------------------------------------------------------------------
// Fault Codes tab
// ---------------------------------------------------------------------------
function kmByDate(daily) {
  const m = new Map();
  for (const d of daily) m.set(d.date_id, (m.get(d.date_id) ?? 0) + num(d.distance_km));
  return m;
}

export function faultKpis(raw) {
  const empty = {
    trucksRed: 0,
    trucksAmber: 0,
    activeCodes: 0,
    bySeverity: { critical: 0, major: 0, minor: 0 },
    rate: null,
    rateDeltaPct: null,
    derateEvents: 0,
    derateConversion: null,
    meanDaysToClear: null,
    clearedCount: 0,
    intermittentShare: null,
    periodEvents: 0,
  };
  const { period } = raw;
  if (!period) return empty;

  const active = raw.dtcEvents.filter((e) => e.status === "active");
  const red = new Set(active.filter((e) => RED_LAMPS.has(e.lamp_status)).map((e) => e.vehicle_id));
  const amber = new Set(active.filter((e) => !RED_LAMPS.has(e.lamp_status) && !red.has(e.vehicle_id)).map((e) => e.vehicle_id));
  const bySeverity = { critical: 0, major: 0, minor: 0 };
  for (const e of active) {
    const s = e.dim_dtc?.severity_class;
    if (s in bySeverity) bySeverity[s] += 1;
  }

  const allCur = raw.dtcEvents.filter((e) => inCurrent(period, e.date_id));
  const cur = allCur.filter((e) => !isIntermittent(e));
  const prev = raw.dtcEvents.filter((e) => !isIntermittent(e) && inPrevious(period, e.date_id));
  let kmCur = 0;
  let kmPrev = 0;
  for (const d of raw.daily) {
    if (inCurrent(period, d.date_id)) kmCur += num(d.distance_km);
    else if (inPrevious(period, d.date_id)) kmPrev += num(d.distance_km);
  }
  const rate = ratio(cur.length, kmCur, 10000);
  const prevRate = ratio(prev.length, kmPrev, 10000);

  const derateable = cur.filter((e) => e.dim_dtc?.can_derate);
  const derateEvents = cur.filter((e) => e.caused_derate).length;

  const cleared = raw.dtcEvents.filter((e) => e.cleared_ts && inCurrent(period, dayOf(e.cleared_ts)));
  const clearDays = cleared.map((e) => (new Date(e.cleared_ts) - new Date(e.first_seen_ts)) / DAY_MS);

  return {
    trucksRed: red.size,
    trucksAmber: amber.size,
    activeCodes: active.length,
    bySeverity,
    rate,
    rateDeltaPct: rate !== null && prevRate ? ((rate - prevRate) / prevRate) * 100 : null,
    derateEvents,
    derateConversion: ratio(derateable.filter((e) => e.caused_derate).length, derateable.length, 100),
    meanDaysToClear: clearDays.length ? clearDays.reduce((s, v) => s + v, 0) / clearDays.length : null,
    clearedCount: cleared.length,
    intermittentShare: ratio(allCur.length - cur.length, allCur.length, 100),
    periodEvents: cur.length,
  };
}

/** New (non-intermittent) DTCs per 10,000 km, 7-day rolling ratio of sums, one series per lamp. */
export function dtcRateTrend(raw) {
  if (!raw.period) return [];
  const km = kmByDate(raw.daily);
  const counts = new Map(); // date → { lamp: n }
  for (const e of raw.dtcEvents) {
    if (isIntermittent(e)) continue;
    const c = counts.get(e.date_id) ?? {};
    c[e.lamp_status] = (c[e.lamp_status] ?? 0) + 1;
    counts.set(e.date_id, c);
  }
  return periodDates(raw.period).map((date) => {
    let dist = 0;
    const sums = Object.fromEntries(LAMPS.map((l) => [l.id, 0]));
    for (let i = 0; i < ROLLING_DAYS; i += 1) {
      const key = addDays(date, -i);
      dist += km.get(key) ?? 0;
      const c = counts.get(key);
      if (c) for (const l of LAMPS) sums[l.id] += c[l.id] ?? 0;
    }
    const row = { date };
    let total = 0;
    for (const l of LAMPS) {
      row[l.id] = dist > 0 ? Number(((sums[l.id] / dist) * 10000).toFixed(3)) : null;
      total += sums[l.id];
    }
    row.total = dist > 0 ? (total / dist) * 10000 : null;
    return row;
  });
}

/** Pareto of fault codes. scope: "period" (first seen in period) or "active" (active now). */
export function dtcPareto(raw, { scope, includeIntermittent }) {
  const events = raw.dtcEvents.filter((e) => {
    if (!includeIntermittent && isIntermittent(e)) return false;
    return scope === "active" ? e.status === "active" : inCurrent(raw.period, e.date_id);
  });
  const byCode = new Map();
  for (const e of events) {
    const g = byCode.get(e.dtc_id) ?? { dtcId: e.dtc_id, label: dtcLabel(e), system: e.dim_dtc?.system, lamp: e.dim_dtc?.default_lamp, count: 0, trucks: new Set(), intermittent: 0 };
    g.count += 1;
    g.trucks.add(e.vehicle_id);
    if (isIntermittent(e)) g.intermittent += 1;
    byCode.set(e.dtc_id, g);
  }
  const all = [...byCode.values()].sort((a, b) => b.count - a.count);
  const total = events.length;
  let running = 0;
  const rows = all.slice(0, PARETO_TOP).map((g) => {
    running += g.count;
    return { ...g, trucks: g.trucks.size, cumPct: total ? (running / total) * 100 : 0 };
  });
  return { rows, total, codes: all.length };
}

/** Faults per 100 trucks by model (rows) × system (cols), for DTCs first seen in the period. */
export function systemModelMatrix(raw) {
  const trucksByModel = new Map();
  for (const v of raw.vehicles) {
    const m = trucksByModel.get(v.model_id) ?? { id: v.model_id, label: v.model_label, trucks: 0 };
    m.trucks += 1;
    trucksByModel.set(v.model_id, m);
  }
  const modelOf = new Map(raw.vehicles.map((v) => [v.vehicle_id, v.model_id]));
  const counts = new Map();
  const systems = new Set();
  for (const e of raw.dtcEvents) {
    if (isIntermittent(e) || !inCurrent(raw.period, e.date_id)) continue;
    const system = e.dim_dtc?.system ?? "other";
    systems.add(system);
    const key = `${modelOf.get(e.vehicle_id)}|${system}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const rows = [...trucksByModel.values()].sort((a, b) => a.label.localeCompare(b.label));
  const cols = [...systems].sort().map((s) => ({ id: s, label: systemLabel(s) }));
  let max = 0;
  const cells = new Map();
  for (const r of rows) {
    for (const c of cols) {
      const count = counts.get(`${r.id}|${c.id}`) ?? 0;
      const per100 = (count / r.trucks) * 100;
      const muted = r.trucks < MATRIX_MIN_TRUCKS;
      if (!muted) max = Math.max(max, per100);
      cells.set(`${r.id}|${c.id}`, { count, per100, muted });
    }
  }
  return { rows, cols, cells, max };
}

/** Fault lifecycle for non-intermittent DTCs first seen in the period. */
export function lifecycleFunnel(raw) {
  const events = raw.dtcEvents.filter((e) => !isIntermittent(e) && inCurrent(raw.period, e.date_id));
  const withRo = new Set(raw.dtcRepairOrders.map((r) => r.dtc_event_id));
  const n = events.length;
  const stages = [
    { stage: "Raised", count: n, color: "#64748b" },
    { stage: "Escalated to derate", count: events.filter((e) => e.caused_derate).length, color: "#e11d48" },
    { stage: "Repair order opened", count: events.filter((e) => withRo.has(e.dtc_event_id) || e.resolved_by_ro_id).length, color: "#f59e0b" },
    { stage: "Cleared", count: events.filter((e) => e.status === "cleared").length, color: "#10b981" },
  ];
  return stages.map((s) => ({ ...s, pct: n ? (s.count / n) * 100 : 0 }));
}

/** Freeze-frame operating point of each DTC first seen in the period, grouped by system. */
export function faultConditions(raw) {
  const bySystem = new Map();
  for (const e of raw.dtcEvents) {
    if (!inCurrent(raw.period, e.date_id)) continue;
    const ff = e.freeze_frame;
    if (!ff || ff.ambient_temp_c === null || ff.ambient_temp_c === undefined || ff.engine_load_pct === null || ff.engine_load_pct === undefined) continue;
    const system = e.dim_dtc?.system ?? "other";
    const list = bySystem.get(system) ?? [];
    list.push({ x: Number(ff.ambient_temp_c), y: Number(ff.engine_load_pct), label: dtcLabel(e), dtcId: e.dtc_id, intermittent: isIntermittent(e) });
    bySystem.set(system, list);
  }
  return [...bySystem.entries()]
    .map(([system, points]) => ({ system, label: systemLabel(system), color: SYSTEM_COLORS[system] ?? "#94a3b8", points }))
    .sort((a, b) => b.points.length - a.points.length);
}

/** Active DTC work list. */
export function activeDtcRows(raw) {
  const vehicles = new Map(raw.vehicles.map((v) => [v.vehicle_id, v]));
  const now = dataNowMs(raw.daily);
  return raw.dtcEvents
    .filter((e) => e.status === "active")
    .map((e) => {
      const v = vehicles.get(e.vehicle_id);
      return {
        id: e.dtc_event_id,
        vehicleId: e.vehicle_id,
        vin: v?.vin ?? e.vehicle_id,
        modelId: v?.model_id,
        modelLabel: v?.model_label ?? "—",
        dtcId: e.dtc_id,
        label: dtcLabel(e),
        system: e.dim_dtc?.system,
        lamp: e.lamp_status,
        severity: e.dim_dtc?.severity_class,
        ageDays: Math.max(0, (now - new Date(e.first_seen_ts).getTime()) / DAY_MS),
        occurrences: e.occurrence_count,
        derate: Boolean(e.caused_derate),
        action: actionFor(e.lamp_status),
        recommended: e.dim_dtc?.recommended_action ?? "—",
      };
    })
    .sort((a, b) => (a.action === b.action ? (SEVERITY_RANK[a.severity] ?? 3) - (SEVERITY_RANK[b.severity] ?? 3) || b.ageDays - a.ageDays : a.action === "Immediate Service" ? -1 : 1));
}

/** Stock of a part: at one location and across a set of regions. */
function stockFor(inventory, partId, { locationId, regionIds }) {
  let atLocation = 0;
  let inRegions = 0;
  for (const i of inventory) {
    if (i.part_id !== partId) continue;
    if (locationId && i.location_id === locationId) atLocation += num(i.quantity);
    if (!regionIds || regionIds.has(i.dim_location?.region_id)) inRegions += num(i.quantity);
  }
  return { atLocation, inRegions };
}

/** Everything the DTC code drawer shows for one code. */
export function dtcCodeDetail(raw, dtcId) {
  const events = raw.dtcEvents.filter((e) => e.dtc_id === dtcId);
  if (events.length === 0) return null;
  const dim = events[0].dim_dtc ?? {};
  const vehicles = new Map(raw.vehicles.map((v) => [v.vehicle_id, v]));
  const periodEvents = events.filter((e) => inCurrent(raw.period, e.date_id));
  const active = events.filter((e) => e.status === "active");
  const relevant = events.filter((e) => e.status === "active" || inCurrent(raw.period, e.date_id));

  const byModel = new Map();
  for (const e of relevant) {
    const label = vehicles.get(e.vehicle_id)?.model_label ?? "Other";
    byModel.set(label, (byModel.get(label) ?? 0) + 1);
  }

  const ffSums = new Map();
  for (const e of relevant) {
    for (const [k, v] of Object.entries(e.freeze_frame ?? {})) {
      if (v === null || v === undefined || Number.isNaN(Number(v))) continue;
      const s = ffSums.get(k) ?? { sum: 0, n: 0 };
      s.sum += Number(v);
      s.n += 1;
      ffSums.set(k, s);
    }
  }

  const regionIds = new Set(raw.vehicles.map((v) => v.region_id));
  const parts = raw.bridge
    .filter((b) => b.dtc_id === dtcId)
    .map((b) => ({
      partId: b.part_id,
      partName: b.dim_part?.part_name ?? b.part_id,
      likelihood: num(b.likelihood),
      stock: stockFor(raw.inventory, b.part_id, { regionIds }).inRegions,
    }))
    .sort((a, b) => b.likelihood - a.likelihood);

  const trucks = new Map();
  for (const e of relevant) {
    const t = trucks.get(e.vehicle_id);
    if (!t || e.first_seen_ts > t.firstSeen) {
      trucks.set(e.vehicle_id, {
        vehicleId: e.vehicle_id,
        vin: vehicles.get(e.vehicle_id)?.vin ?? e.vehicle_id,
        modelLabel: vehicles.get(e.vehicle_id)?.model_label ?? "—",
        firstSeen: e.first_seen_ts,
        status: e.status,
        lamp: e.lamp_status,
      });
    }
  }

  return {
    dtcId,
    dim,
    label: dtcLabel(events[0]),
    periodCount: periodEvents.length,
    activeCount: active.length,
    truckCount: trucks.size,
    intermittent: events.every(isIntermittent),
    derateCount: relevant.filter((e) => e.caused_derate).length,
    byModel: [...byModel.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count),
    freezeFrame: [...ffSums.entries()].map(([key, s]) => ({ key, label: freezeLabel(key), mean: s.sum / s.n, n: s.n })),
    parts,
    trucks: [...trucks.values()].sort((a, b) => (a.firstSeen < b.firstSeen ? 1 : -1)),
  };
}

// ---------------------------------------------------------------------------
// Signal Health tab
// ---------------------------------------------------------------------------
export function bandState(signal, value) {
  if (!signal || value === null || value === undefined || signal.normal_min === null) return null;
  const v = Number(value);
  const { normal_min: lo, normal_max: hi, warn_threshold: warn, crit_threshold: crit, direction } = signal;
  if (direction === "high") {
    if (crit !== null && v >= crit) return "critical";
    if (warn !== null && v >= warn) return "warning";
  } else {
    if (crit !== null && v <= crit) return "critical";
    if (warn !== null && v <= warn) return "warning";
  }
  if (v < lo || v > hi) return "outside";
  return "normal";
}

export function stateMeta(id) {
  return BAND_STATES.find((s) => s.id === id) ?? null;
}

const CATEGORY_ORDER = ["aftertreatment", "powertrain", "fuel", "cooling", "electrical", "brakes", "tyres", "ev", "vehicle"];

/** Health signals present in the rollup that have a normal band, in a stable display order. */
export function healthSignals(sig) {
  const present = new Set(sig.rows.map((r) => r.signal_code));
  return sig.signals
    .filter((s) => present.has(s.signal_code) && s.normal_min !== null)
    .sort((a, b) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category) || a.signal_code.localeCompare(b.signal_code));
}

/** Latest day in the period per truck × signal. */
export function latestReadings(fleetRaw, sig) {
  const out = new Map();
  for (const r of sig.rows) {
    if (!inCurrent(fleetRaw.period, r.date_id)) continue;
    const key = `${r.vehicle_id}|${r.signal_code}`;
    const cur = out.get(key);
    if (!cur || r.date_id > cur.date_id) out.set(key, r);
  }
  return out;
}

/** Anomaly → DTC lead time for non-intermittent DTCs first seen in the period. */
export function leadTimes(fleetRaw, sig) {
  const signalCodes = new Set(sig.signals.map((s) => s.signal_code));
  const anomalousDays = new Map(); // vehicle|signal → sorted date_ids
  for (const r of sig.leadRows) {
    const key = `${r.vehicle_id}|${r.signal_code}`;
    const list = anomalousDays.get(key) ?? [];
    list.push(r.date_id);
    anomalousDays.set(key, list);
  }
  const results = [];
  for (const e of fleetRaw.dtcEvents) {
    if (isIntermittent(e) || !inCurrent(fleetRaw.period, e.date_id)) continue;
    const signal = freezeSignal(e);
    if (!signal || !signalCodes.has(signal)) continue;
    const from = addDays(e.date_id, -LEAD_LOOKBACK_DAYS);
    const days = (anomalousDays.get(`${e.vehicle_id}|${signal}`) ?? []).filter((d) => d >= from && d <= e.date_id).sort();
    results.push({ dtcEventId: e.dtc_event_id, signal, lead: days.length ? daysBetween(days[0], e.date_id) : null });
  }
  const buckets = LEAD_BUCKETS.map((b) => ({ label: b.label, count: results.filter((r) => r.lead !== null && r.lead >= b.min && r.lead <= b.max).length, warned: true }));
  buckets.push({ label: "No warning", count: results.filter((r) => r.lead === null).length, warned: false });
  const leads = results.filter((r) => r.lead !== null).map((r) => r.lead);
  return {
    buckets,
    linked: results.length,
    medianLead: leads.length ? median(leads) : null,
    warnedPct: ratio(leads.length, results.length, 100),
  };
}

export function signalKpis(fleetRaw, sig, latest, lead) {
  const signalsByCode = new Map(sig.signals.map((s) => [s.signal_code, s]));
  const critTrucks = new Set();
  let outOfBand = 0;
  for (const r of latest.values()) {
    const state = bandState(signalsByCode.get(r.signal_code), r.avg_value);
    if (state === "critical") critTrucks.add(r.vehicle_id);
    if (state && state !== "normal") outOfBand += 1;
  }
  const anomalousTrucks = new Set();
  let readings = 0;
  let anomalous = 0;
  for (const r of sig.rows) {
    if (!inCurrent(fleetRaw.period, r.date_id)) continue;
    readings += num(r.readings);
    anomalous += num(r.anomalous_readings);
    if (num(r.anomalous_readings) > 0) anomalousTrucks.add(r.vehicle_id);
  }
  return {
    critTrucks: critTrucks.size,
    outOfBand,
    pairs: latest.size,
    anomalousTrucks: anomalousTrucks.size,
    anomalousRate: ratio(anomalous, readings, 100),
    medianLead: lead.medianLead,
    warnedPct: lead.warnedPct,
  };
}

/**
 * Truck × signal grid on the latest reading. Cell value = state rank + min(|z| / 10, 0.9) so
 * colour follows the band state first and the deviation second.
 */
export function signalHeatmap(fleetRaw, sig, latest, signals) {
  const trucks = fleetRaw.vehicles.map((v) => {
    const cells = {};
    let worst = -1;
    let maxZ = 0;
    for (const s of signals) {
      const r = latest.get(`${v.vehicle_id}|${s.signal_code}`);
      if (!r) continue;
      const state = bandState(s, r.avg_value);
      const z = num(r.max_abs_z);
      cells[s.signal_code] = { state, z, value: r.avg_value, date: r.date_id };
      worst = Math.max(worst, STATE_RANK[state] ?? 0);
      maxZ = Math.max(maxZ, z);
    }
    return { vehicleId: v.vehicle_id, vin: v.vin, modelLabel: v.model_label, cells, worst, maxZ, score: worst * 100 + maxZ };
  });
  return trucks.filter((t) => Object.keys(t.cells).length > 0).sort((a, b) => b.score - a.score);
}

/** Distribution of each signal's latest value across trucks vs its normal band. */
export function bandDistribution(latest, signals) {
  return signals.map((s) => {
    const values = [];
    const states = { critical: 0, warning: 0, outside: 0, normal: 0 };
    for (const r of latest.values()) {
      if (r.signal_code !== s.signal_code || r.avg_value === null) continue;
      values.push(Number(r.avg_value));
      const st = bandState(s, r.avg_value);
      if (st) states[st] += 1;
    }
    values.sort((a, b) => a - b);
    const marks = [s.normal_min, s.normal_max, s.warn_threshold, s.crit_threshold].filter((v) => v !== null);
    const lo = Math.min(...values, ...marks);
    const hi = Math.max(...values, ...marks);
    const padding = (hi - lo) * 0.04 || 1;
    return {
      signal: s,
      n: values.length,
      p5: quantile(values, 0.05),
      p25: quantile(values, 0.25),
      p50: quantile(values, 0.5),
      p75: quantile(values, 0.75),
      p95: quantile(values, 0.95),
      states,
      domain: [lo - padding, hi + padding],
    };
  });
}

/** Anomalous truck-days per 100 reporting truck-days, 7-day rolling ratio of sums. */
export function anomalyTrend(fleetRaw, sig) {
  if (!fleetRaw.period) return [];
  const reporting = new Map(); // date → Set(vehicle)
  const anomalous = new Map();
  for (const r of sig.rows) {
    const rep = reporting.get(r.date_id) ?? new Set();
    rep.add(r.vehicle_id);
    reporting.set(r.date_id, rep);
    if (num(r.anomalous_readings) > 0) {
      const an = anomalous.get(r.date_id) ?? new Set();
      an.add(r.vehicle_id);
      anomalous.set(r.date_id, an);
    }
  }
  return periodDates(fleetRaw.period).map((date) => {
    let n = 0;
    let d = 0;
    for (let i = 0; i < ROLLING_DAYS; i += 1) {
      const key = addDays(date, -i);
      n += anomalous.get(key)?.size ?? 0;
      d += reporting.get(key)?.size ?? 0;
    }
    return { date, value: d > 0 ? Number(((n / d) * 100).toFixed(2)) : null, trucks: anomalous.get(date)?.size ?? 0 };
  });
}

/** DPF soot load vs differential pressure on the latest reading, per diesel truck. */
export function dpfScatter(fleetRaw, latest) {
  const byModel = new Map();
  for (const v of fleetRaw.vehicles) {
    const soot = latest.get(`${v.vehicle_id}|DPF_SOOT_LOAD`);
    const dp = latest.get(`${v.vehicle_id}|DPF_DIFF_PRESSURE`);
    if (!soot || !dp) continue;
    const list = byModel.get(v.model_id) ?? { modelId: v.model_id, label: v.model_label, points: [] };
    list.points.push({ x: Number(soot.avg_value), y: Number(dp.avg_value), vehicleId: v.vehicle_id, vin: v.vin });
    byModel.set(v.model_id, list);
  }
  return [...byModel.values()];
}

/** Mean daily value of one signal per model, 7-day rolling (mean of truck-day values). */
export function signalTrendByModel(fleetRaw, sig, signalCode) {
  if (!fleetRaw.period) return { rows: [], models: [] };
  const modelOf = new Map(fleetRaw.vehicles.map((v) => [v.vehicle_id, v]));
  const sums = new Map(); // `${model}|${date}` → { s, n }
  const models = new Map();
  for (const r of sig.rows) {
    if (r.signal_code !== signalCode || r.avg_value === null) continue;
    const v = modelOf.get(r.vehicle_id);
    if (!v) continue;
    models.set(v.model_id, v.model_label);
    const key = `${v.model_id}|${r.date_id}`;
    const s = sums.get(key) ?? { s: 0, n: 0 };
    s.s += Number(r.avg_value);
    s.n += 1;
    sums.set(key, s);
  }
  const rows = periodDates(fleetRaw.period).map((date) => {
    const row = { date };
    for (const [modelId, label] of models) {
      let s = 0;
      let n = 0;
      for (let i = 0; i < ROLLING_DAYS; i += 1) {
        const x = sums.get(`${modelId}|${addDays(date, -i)}`);
        if (x) {
          s += x.s;
          n += x.n;
        }
      }
      row[label] = n > 0 ? Number((s / n).toFixed(2)) : null;
    }
    return row;
  });
  return { rows, models: [...models.values()] };
}

/**
 * Wear forecast: least-squares slope of the daily value over the period per truck, projected to
 * the signal's critical threshold. km to limit = days to limit × the truck's average km per day.
 */
export function wearForecast(fleetRaw, sig, signal, limit = 10) {
  if (!signal || !fleetRaw.period) return [];
  const points = new Map();
  for (const r of sig.rows) {
    if (r.signal_code !== signal.signal_code || !inCurrent(fleetRaw.period, r.date_id) || r.avg_value === null) continue;
    const list = points.get(r.vehicle_id) ?? [];
    list.push({ x: daysBetween(fleetRaw.period.startStr, r.date_id), y: Number(r.avg_value), date: r.date_id });
    points.set(r.vehicle_id, list);
  }
  const kmPerDay = new Map();
  for (const d of fleetRaw.daily) {
    if (!inCurrent(fleetRaw.period, d.date_id)) continue;
    kmPerDay.set(d.vehicle_id, (kmPerDay.get(d.vehicle_id) ?? 0) + num(d.distance_km) / fleetRaw.period.days);
  }
  const vehicles = new Map(fleetRaw.vehicles.map((v) => [v.vehicle_id, v]));
  const falling = signal.direction !== "high";
  const out = [];
  for (const [vehicleId, pts] of points) {
    if (pts.length < WEAR_MIN_POINTS) continue;
    const n = pts.length;
    const mx = pts.reduce((s, p) => s + p.x, 0) / n;
    const my = pts.reduce((s, p) => s + p.y, 0) / n;
    const sxx = pts.reduce((s, p) => s + (p.x - mx) ** 2, 0);
    if (sxx === 0) continue;
    const slope = pts.reduce((s, p) => s + (p.x - mx) * (p.y - my), 0) / sxx;
    const last = pts.reduce((a, b) => (b.date > a.date ? b : a));
    const remaining = falling ? last.y - signal.crit_threshold : signal.crit_threshold - last.y;
    const towardLimit = falling ? -slope : slope;
    let days;
    if (remaining <= 0) days = 0;
    else if (towardLimit <= 0) continue; // not wearing toward the limit
    else days = remaining / towardLimit;
    const v = vehicles.get(vehicleId);
    const kmDay = kmPerDay.get(vehicleId) ?? 0;
    out.push({
      vehicleId,
      vin: v?.vin ?? vehicleId,
      label: v?.vin ? `…${v.vin.slice(-6)}` : vehicleId,
      modelLabel: v?.model_label,
      latest: last.y,
      slopePerWeek: slope * 7,
      daysToLimit: days,
      kmToLimit: kmDay > 0 ? days * kmDay : null,
    });
  }
  return out.sort((a, b) => a.daysToLimit - b.daysToLimit).slice(0, limit);
}

// ---------------------------------------------------------------------------
// Asset View
// ---------------------------------------------------------------------------
/** Latest prediction per monitored part. */
function latestHealthByPart(health) {
  const out = new Map();
  for (const h of health) {
    const cur = out.get(h.part_id);
    if (!cur || h.ts > cur.ts) out.set(h.part_id, h);
  }
  return out;
}

export function assetSummary(raw) {
  const empty = { worst: null, band: null, minRulKm: null, minRulDays: null, activeByLamp: {}, activeCount: 0, outOfBand: 0, signalsTracked: 0, odometer: null, lastPing: null, warranty: null };
  if (!raw.vehicle) return empty;
  const parts = [...latestHealthByPart(raw.health).values()];
  const worst = parts.reduce((a, b) => (!a || num(b.failure_probability) > num(a.failure_probability) ? b : a), null);
  const rulKm = parts.map((p) => p.rul_km).filter((v) => v !== null && v !== undefined);
  const rulDays = parts.map((p) => p.rul_days).filter((v) => v !== null && v !== undefined);

  const active = raw.dtcEvents.filter((e) => e.status === "active");
  const activeByLamp = {};
  for (const e of active) activeByLamp[e.lamp_status] = (activeByLamp[e.lamp_status] ?? 0) + 1;

  const signals = new Map(raw.signals.map((s) => [s.signal_code, s]));
  const latest = new Map();
  for (const t of raw.telemetry) {
    const cur = latest.get(t.signal_code);
    if (!cur || t.ts > cur.ts) latest.set(t.signal_code, t);
  }
  let outOfBand = 0;
  let tracked = 0;
  for (const t of latest.values()) {
    const st = bandState(signals.get(t.signal_code), t.value);
    if (!st) continue;
    tracked += 1;
    if (st !== "normal") outOfBand += 1;
  }

  const odometer = raw.latestDaily?.odometer_km_end ?? null;
  const v = raw.vehicle;
  let warranty = null;
  if (v.warranty_end_date || v.warranty_km_limit) {
    const byDate = !v.warranty_end_date || (raw.latestDaily?.date_id ?? "") <= v.warranty_end_date;
    const byKm = !v.warranty_km_limit || (odometer ?? 0) <= v.warranty_km_limit;
    warranty = { inWarranty: byDate && byKm, endDate: v.warranty_end_date, kmLimit: v.warranty_km_limit };
  }

  return {
    worst,
    band: worst ? riskBandFor(num(worst.failure_probability)) : null,
    minRulKm: rulKm.length ? Math.min(...rulKm) : null,
    minRulDays: rulDays.length ? Math.min(...rulDays) : null,
    activeByLamp,
    activeCount: active.length,
    outOfBand,
    signalsTracked: tracked,
    odometer,
    lastPing: raw.latestDaily?.last_ping_ts ?? null,
    warranty,
  };
}

/** One series per health signal: readings, band, anomalies and linked DTC markers. */
export function assetSignalSeries(raw) {
  const signals = new Map(raw.signals.map((s) => [s.signal_code, s]));
  const bySignal = new Map();
  for (const t of raw.telemetry) {
    const s = signals.get(t.signal_code);
    if (!s || s.normal_min === null) continue;
    const list = bySignal.get(t.signal_code) ?? [];
    const value = t.value === null ? null : Number(t.value);
    list.push({ t: new Date(t.ts).getTime(), value, anomalyValue: t.is_anomalous ? value : null, z: t.z_score, anomalous: t.is_anomalous });
    bySignal.set(t.signal_code, list);
  }
  const markers = new Map();
  for (const e of raw.dtcEvents) {
    if (!inCurrent(raw.period, e.date_id)) continue;
    const signal = freezeSignal(e);
    if (!signal) continue;
    const list = markers.get(signal) ?? [];
    list.push({ t: new Date(e.first_seen_ts).getTime(), label: dtcLabel(e), lamp: e.lamp_status });
    markers.set(signal, list);
  }
  return [...bySignal.entries()]
    .map(([code, points]) => {
      points.sort((a, b) => a.t - b.t);
      const s = signals.get(code);
      const last = points[points.length - 1];
      const state = bandState(s, last?.value);
      return {
        signal: s,
        points,
        anomalies: points.filter((p) => p.anomalous),
        markers: markers.get(code) ?? [],
        latest: last?.value ?? null,
        state,
        rank: (STATE_RANK[state] ?? 0) * 100 + points.filter((p) => p.anomalous).length,
      };
    })
    .sort((a, b) => b.rank - a.rank || CATEGORY_ORDER.indexOf(a.signal.category) - CATEGORY_ORDER.indexOf(b.signal.category));
}

/** DTC Gantt bars for events overlapping the period. */
export function dtcTimeline(raw) {
  if (!raw.period) return { bars: [], domain: [0, 0] };
  const start = new Date(`${raw.period.startStr}T00:00:00`).getTime();
  const end = raw.latestDaily?.last_ping_ts ? new Date(raw.latestDaily.last_ping_ts).getTime() : new Date(`${raw.period.endStr}T23:59:59`).getTime();
  const bars = raw.dtcEvents
    .map((e) => {
      const from = new Date(e.first_seen_ts).getTime();
      let to = end;
      if (e.cleared_ts) to = new Date(e.cleared_ts).getTime();
      else if (isIntermittent(e)) to = new Date(e.last_seen_ts ?? e.first_seen_ts).getTime();
      return { event: e, from, to, label: dtcLabel(e), lamp: e.lamp_status, status: e.status };
    })
    .filter((b) => b.to >= start && b.from <= end)
    .map((b) => ({ ...b, from: Math.max(b.from, start), to: Math.max(Math.min(b.to, end), Math.max(b.from, start) + 3 * 3600 * 1000) }))
    .sort((a, b) => a.from - b.from);
  return { bars, domain: [start, end] };
}

/** Weekly failure probability per monitored part (top parts by peak probability) + alert markers. */
export function partRiskTrend(raw, maxParts = 5) {
  const names = new Map();
  const peak = new Map();
  for (const h of raw.health) {
    names.set(h.part_id, h.dim_part?.part_name ?? h.part_id);
    peak.set(h.part_id, Math.max(peak.get(h.part_id) ?? 0, num(h.failure_probability)));
  }
  const parts = [...peak.entries()].sort((a, b) => b[1] - a[1]).slice(0, maxParts).map(([id]) => id);
  const byDate = new Map();
  for (const h of raw.health) {
    if (h.trigger !== "weekly" || !parts.includes(h.part_id)) continue;
    const row = byDate.get(h.date_id) ?? { date: h.date_id };
    row[names.get(h.part_id)] = Number((num(h.failure_probability) * 100).toFixed(1));
    byDate.set(h.date_id, row);
  }
  const alerts = raw.health
    .filter((h) => h.trigger === "alert")
    .map((h) => ({ date: h.date_id, part: names.get(h.part_id), p: num(h.failure_probability) * 100 }));
  return { rows: [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1)), parts: parts.map((id) => names.get(id)), alerts };
}

/** Workshop history: repair orders with the parts replaced on each. */
export function serviceHistory(raw) {
  const partsByRo = new Map();
  for (const r of raw.replacements) {
    const list = partsByRo.get(r.ro_id) ?? [];
    list.push(r);
    partsByRo.set(r.ro_id, list);
  }
  return raw.repairOrders
    .map((ro) => {
      const parts = partsByRo.get(ro.ro_id) ?? [];
      return {
        roId: ro.ro_id,
        date: ro.open_ts ? dayOf(ro.open_ts) : ro.date_id,
        visitType: ro.visit_type,
        parts: parts.map((p) => p.dim_part?.part_name ?? p.part_id).join(", ") || "—",
        failureModes: [...new Set(parts.map((p) => p.failure_mode).filter(Boolean))].join(", ") || "—",
        odometer: ro.odometer_km,
        downtime: ro.downtime_hours,
        predicted: parts.some((p) => p.was_predicted),
        inWarranty: parts.some((p) => p.in_warranty),
        cost: num(ro.parts_cost) + num(ro.labor_cost),
        note: ro.nlp_3c_text,
      };
    })
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

/** Actions and likely parts for the next workshop visit. */
export function workshopPrep(raw) {
  const v = raw.vehicle;
  if (!v) return { actions: [], parts: [] };
  const active = raw.dtcEvents
    .filter((e) => e.status === "active")
    .sort((a, b) => (SEVERITY_RANK[a.dim_dtc?.severity_class] ?? 3) - (SEVERITY_RANK[b.dim_dtc?.severity_class] ?? 3));
  const actions = active.map((e) => ({
    key: e.dtc_event_id,
    source: `${e.dtc_id} · ${e.lamp_status}`,
    title: dtcLabel(e),
    action: e.dim_dtc?.recommended_action ?? "Inspect",
    urgency: actionFor(e.lamp_status),
  }));

  const health = [...latestHealthByPart(raw.health).values()];
  for (const h of health) {
    const band = riskBandFor(num(h.failure_probability));
    if ((band === "Critical" || band === "High") && h.ai_prescriptive_action) {
      actions.push({
        key: h.health_id,
        source: `Prediction · ${band}`,
        title: h.dim_part?.part_name ?? h.part_id,
        action: h.ai_prescriptive_action,
        urgency: band === "Critical" ? "Immediate Service" : "Plan Workshop",
      });
    }
  }

  const parts = new Map();
  const activeIds = new Set(active.map((e) => e.dtc_id));
  for (const b of raw.bridge) {
    if (!activeIds.has(b.dtc_id)) continue;
    const cur = parts.get(b.part_id);
    if (!cur || num(b.likelihood) > cur.score) parts.set(b.part_id, { partId: b.part_id, partName: b.dim_part?.part_name ?? b.part_id, score: num(b.likelihood), reason: `DTC ${b.dtc_id}` });
  }
  for (const h of health) {
    const p = num(h.failure_probability);
    const band = riskBandFor(p);
    if (band !== "Critical" && band !== "High") continue;
    const cur = parts.get(h.part_id);
    if (!cur || p > cur.score) parts.set(h.part_id, { partId: h.part_id, partName: h.dim_part?.part_name ?? h.part_id, score: p, reason: `${band} risk` });
  }
  const regionIds = new Set([v.region_id]);
  return {
    actions,
    parts: [...parts.values()]
      .map((p) => ({ ...p, ...stockFor(raw.inventory, p.partId, { locationId: v.location_id, regionIds }) }))
      .sort((a, b) => b.score - a.score),
  };
}

export function workOrderText(raw, summary, prep) {
  const v = raw.vehicle;
  const lines = [
    `Work order draft · ${v.vin} (${v.model_label})`,
    `Region: ${v.region_name} · Home: ${v.location_name ?? v.location_id}`,
    `Odometer: ${summary.odometer ? Math.round(summary.odometer).toLocaleString("en-IN") : "—"} km · Warranty: ${summary.warranty ? (summary.warranty.inWarranty ? "in warranty" : "out of warranty") : "unknown"}`,
    "",
    "Actions:",
    ...(prep.actions.length ? prep.actions.map((a) => `- [${a.urgency}] ${a.title} (${a.source}): ${a.action}`) : ["- No open actions"]),
    "",
    "Parts to stage:",
    ...(prep.parts.length ? prep.parts.map((p) => `- ${p.partName} (${p.reason}) · stock at home depot ${p.atLocation}, region ${p.inRegions}`) : ["- None"]),
  ];
  return lines.join("\n");
}
