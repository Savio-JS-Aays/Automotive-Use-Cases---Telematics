/**
 * Pure aggregations for the Telematics module. Inputs are the normalised rows returned by
 * `useTelematicsFleetData` / `useTelematicsAssetData`; tab components call these inside
 * useMemo, passing their local filters. Every formula is documented in
 * Documentation/metrics/telematics.md.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
export const DIESEL_PRICE_INR_PER_L = 90; // same constant the simulator uses
export const ADBLUE_NORMAL_PCT = 5.5;
export const ADBLUE_LOW_PCT = 3; // below this a diesel truck is flagged (DEF fault / tampering)
export const ADBLUE_MIN_FUEL_L = 100; // min diesel volume before the ratio is rated
export const ROLLING_DAYS = 7;
export const MATRIX_MIN_TRUCKS = 5;
export const MIN_PREV_COVERAGE = 0.8; // share of expected vehicle-days needed to show a delta
// last_ping_ts is the last *report*; parked trucks still send hourly heartbeats (counted in
// packets_received), so a truck is silent only when nothing arrived on its latest day or the
// last report is older than this (same 48 h stale rule as the Overview).
export const SILENT_HOURS = 48;
export const LOW_COMPLETENESS_PCT = 90;
export const IDLE_RANKING_MIN_ENGINE_H = 10;
export const OVERSPEED_LIMIT_KMH = 80;

export const EVENT_LABELS = {
  harsh_brake: "Harsh braking",
  harsh_accel: "Harsh acceleration",
  harsh_cornering: "Harsh cornering",
  overspeed: "Overspeed",
  over_rev: "Over-rev",
  excessive_idle: "Excessive idle",
  aba_warning: "ABA warning",
  aba_full_brake: "ABA full brake",
  lane_departure: "Lane departure",
  close_following: "Close following",
};

export const EVENT_FAMILIES = [
  { name: "Harsh driving", color: "#e11d48", types: ["harsh_brake", "harsh_accel", "harsh_cornering"] },
  { name: "Speed & RPM", color: "#f59e0b", types: ["overspeed", "over_rev"] },
  { name: "ADAS", color: "#8b5cf6", types: ["aba_warning", "aba_full_brake", "lane_departure", "close_following"] },
  { name: "Idling", color: "#94a3b8", types: ["excessive_idle"] },
];
const FAMILY_OF = Object.fromEntries(EVENT_FAMILIES.flatMap((f) => f.types.map((t) => [t, f.name])));
const ADAS_TYPES = new Set(EVENT_FAMILIES.find((f) => f.name === "ADAS").types);

export const SEVERITIES = ["high", "medium", "low"];

export const SAFETY_BANDS = [
  { name: "Coach now", min: 0, max: 70, color: "#e11d48" },
  { name: "Watch", min: 70, max: 85, color: "#f59e0b" },
  { name: "Good", min: 85, max: 101, color: "#10b981" },
];

export const UTILIZATION_BANDS = [
  { name: "Under-used", min: 0, max: 20, color: "#f59e0b" },
  { name: "Normal", min: 20, max: 50, color: "#0ea5e9" },
  { name: "High", min: 50, max: 101, color: "#10b981" },
];

export const SPEED_BANDS = [
  { key: "0-30", label: "0–30 km/h", color: "#cbd5e1" },
  { key: "30-50", label: "30–50", color: "#7dd3fc" },
  { key: "50-70", label: "50–70", color: "#0ea5e9" },
  { key: "70-80", label: "70–80", color: "#0369a1" },
  { key: ">80", label: "> 80", color: "#e11d48" },
];

export const TRUCK_STATUSES = ["Active", "Parked", "Workshop", "Derated", "Silent"];

const MODEL_PALETTE = ["#0ea5e9", "#10b981", "#f59e0b", "#8b5cf6", "#e11d48", "#14b8a6", "#64748b"];
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
const num = (v) => (v === null || v === undefined || Number.isNaN(Number(v)) ? 0 : Number(v));
const ratio = (a, b, scale = 1) => (b > 0 ? (a / b) * scale : null);

function pad(n) {
  return String(n).padStart(2, "0");
}

function dateStr(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function parseDateId(id) {
  const [y, m, d] = id.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(id, n) {
  return dateStr(new Date(parseDateId(id).getTime() + n * DAY_MS));
}

/** Monday of the ISO week containing date_id. */
export function weekStart(id) {
  const d = parseDateId(id);
  const dow = (d.getDay() + 6) % 7;
  return dateStr(new Date(d.getTime() - dow * DAY_MS));
}

/** Every date_id in the period, optionally starting `lookback` days earlier. */
export function periodDates(period, lookback = 0) {
  const out = [];
  for (let d = addDays(period.startStr, -lookback); d <= period.endStr; d = addDays(d, 1)) out.push(d);
  return out;
}

function inCurrent(period, id) {
  return id >= period.startStr && id <= period.endStr;
}

function inPrevious(period, id) {
  return id >= period.prevStartStr && id < period.startStr;
}

export function splitDaily(raw) {
  const cur = [];
  const prev = [];
  if (!raw.period) return { cur, prev };
  for (const d of raw.daily) {
    if (inCurrent(raw.period, d.date_id)) cur.push(d);
    else if (inPrevious(raw.period, d.date_id)) prev.push(d);
  }
  return { cur, prev };
}

function hasPrevCoverage(raw, prevRows) {
  const expected = raw.vehicles.length * (raw.period?.days ?? 0);
  return expected > 0 && prevRows.length / expected >= MIN_PREV_COVERAGE;
}

/** Distance-weighted mean of `field` over rows (skips null scores and zero-km rows). */
function distanceWeighted(rows, field, kmField = "distance_km") {
  let w = 0;
  let s = 0;
  for (const r of rows) {
    const v = r[field];
    const km = num(r[kmField]);
    if (v === null || v === undefined || km <= 0) continue;
    w += km;
    s += Number(v) * km;
  }
  return w > 0 ? s / w : null;
}

export function modelColors(vehicles) {
  const ids = [...new Set(vehicles.map((v) => v.model_id))].sort();
  return Object.fromEntries(ids.map((id, i) => [id, MODEL_PALETTE[i % MODEL_PALETTE.length]]));
}

function vehicleIndex(raw) {
  return new Map(raw.vehicles.map((v) => [v.vehicle_id, v]));
}

/** Latest ping across the scope: the "data now" used for silence checks. */
export function dataNow(raw) {
  let max = null;
  for (const d of raw.daily) if (d.last_ping_ts && (!max || d.last_ping_ts > max)) max = d.last_ping_ts;
  return max ? new Date(max).getTime() : Date.now();
}

/**
 * Rolling ratio series: for each date, Σnumerator / Σdenominator over the trailing
 * `window` days × scale. Ratio of sums, not an average of daily ratios.
 */
function rollingRatio(dates, numByDate, denByDate, window, scale) {
  return dates.map((date) => {
    let n = 0;
    let dd = 0;
    for (let i = 0; i < window; i += 1) {
      const key = addDays(date, -i);
      n += numByDate.get(key) ?? 0;
      dd += denByDate.get(key) ?? 0;
    }
    return { date, value: dd > 0 ? (n / dd) * scale : null };
  });
}

function addTo(map, key, value) {
  map.set(key, (map.get(key) ?? 0) + value);
}

export function bandOf(bands, value) {
  if (value === null || value === undefined) return null;
  return bands.find((b) => value >= b.min && value < b.max) ?? bands[bands.length - 1];
}

// ---------------------------------------------------------------------------
// Per-truck rollup (roster, rankings, distribution, data health)
// ---------------------------------------------------------------------------
export function truckStats(raw) {
  if (!raw.period) return [];
  const byVehicle = new Map();
  for (const v of raw.vehicles) {
    byVehicle.set(v.vehicle_id, {
      vehicle: v,
      rows: [],
      latest: null,
      lastPing: null,
    });
  }
  for (const d of raw.daily) {
    const t = byVehicle.get(d.vehicle_id);
    if (!t) continue;
    if (d.last_ping_ts && (!t.lastPing || d.last_ping_ts > t.lastPing)) t.lastPing = d.last_ping_ts;
    if (!inCurrent(raw.period, d.date_id)) continue;
    t.rows.push(d);
    if (!t.latest || d.date_id > t.latest.date_id) t.latest = d;
  }

  const now = dataNow(raw);
  return [...byVehicle.values()].map(({ vehicle: v, rows, latest, lastPing }) => {
    const sum = (f) => rows.reduce((s, r) => s + num(r[f]), 0);
    const days = rows.length;
    const engineH = sum("engine_hours");
    const km = sum("distance_km");
    const expected = sum("packets_expected");
    const received = sum("packets_received");
    const silentHours = lastPing ? (now - new Date(lastPing).getTime()) / HOUR_MS : null;

    const noPacketsLatest = latest ? num(latest.packets_expected) > 0 && num(latest.packets_received) === 0 : true;
    let status = "Parked";
    if (latest?.in_workshop) status = "Workshop";
    else if (latest?.derate_active || latest?.red_lamp_flag) status = "Derated";
    else if (noPacketsLatest || silentHours === null || silentHours > SILENT_HOURS) status = "Silent";
    else if (latest?.is_operating) status = "Active";

    const fuel = sum("fuel_l");
    const adblue = sum("adblue_l");
    const bev = v.powertrain === "bev";
    return {
      vehicleId: v.vehicle_id,
      vin: v.vin,
      modelId: v.model_id,
      modelLabel: v.model_label,
      regionId: v.region_id,
      regionName: v.region_name,
      applicationName: v.application_name,
      telematicsSource: v.telematics_source,
      powertrain: v.powertrain,
      driverAlias: v.primary_driver_alias,
      days,
      operatingDays: rows.filter((r) => r.is_operating).length,
      workshopDays: rows.filter((r) => r.in_workshop).length,
      km,
      engineH,
      idleH: sum("idle_hours"),
      utilization: days > 0 ? (engineH / (days * 24)) * 100 : null,
      idlePct: ratio(sum("idle_hours"), engineH, 100),
      consumption: bev ? ratio(sum("energy_kwh"), km, 100) : ratio(fuel, km, 100),
      consumptionUnit: bev ? "kWh/100 km" : "L/100 km",
      idleCostInr: sum("idle_fuel_l") * DIESEL_PRICE_INR_PER_L,
      adbluePct: !bev && fuel >= ADBLUE_MIN_FUEL_L ? ratio(adblue, fuel, 100) : null,
      safety: distanceWeighted(rows, "safety_score"),
      eco: distanceWeighted(rows, "eco_score"),
      harshEvents: sum("harsh_event_count"),
      expected,
      received,
      completeness: ratio(received, expected, 100),
      lastPing,
      silentHours,
      status,
    };
  });
}

// ---------------------------------------------------------------------------
// Utilization & uptime
// ---------------------------------------------------------------------------
export function utilizationKpis(raw) {
  const { cur, prev } = splitDaily(raw);
  const util = (rows) => (rows.length ? (rows.reduce((s, r) => s + num(r.engine_hours), 0) / (rows.length * 24)) * 100 : null);
  const uptime = (rows) => (rows.length ? (1 - rows.filter((r) => r.in_workshop).length / rows.length) * 100 : null);
  const kmPerOpDay = (rows) => {
    const op = rows.filter((r) => r.is_operating);
    return op.length ? op.reduce((s, r) => s + num(r.distance_km), 0) / op.length : null;
  };
  const withPrev = hasPrevCoverage(raw, prev);
  const delta = (f) => (withPrev && f(cur) !== null && f(prev) !== null ? f(cur) - f(prev) : null);

  const endStr = raw.period?.endStr;
  const latestRows = cur.filter((r) => r.date_id === endStr);

  const engineByDate = new Map();
  const daysByDate = new Map();
  for (const r of [...prev, ...cur]) {
    addTo(engineByDate, r.date_id, num(r.engine_hours));
    addTo(daysByDate, r.date_id, 24);
  }
  const sparkline = raw.period
    ? rollingRatio(periodDates(raw.period), engineByDate, daysByDate, ROLLING_DAYS, 100)
    : [];

  return {
    fleetSize: raw.vehicles.length,
    utilization: util(cur),
    utilizationDelta: delta(util),
    sparkline,
    activeTrucks: latestRows.filter((r) => r.is_operating).length,
    latestDate: endStr,
    uptime: uptime(cur),
    uptimeDelta: delta(uptime),
    workshopDays: cur.filter((r) => r.in_workshop).length,
    derateDays: cur.filter((r) => r.derate_active || r.red_lamp_flag).length,
    kmPerOpDay: kmPerOpDay(cur),
    kmPerOpDayDelta: delta(kmPerOpDay),
  };
}

/** Average drive / idle / PTO hours per truck-day, bucketed by day or ISO week. */
export function hoursSplit(raw, grain) {
  const { cur, prev } = splitDaily(raw);
  const buckets = new Map();
  for (const r of cur) {
    const key = grain === "week" ? weekStart(r.date_id) : r.date_id;
    const b = buckets.get(key) ?? { key, days: 0, drive: 0, idle: 0, pto: 0, engine: 0 };
    b.days += 1;
    b.drive += num(r.drive_hours);
    b.idle += num(r.idle_hours);
    b.pto += num(r.pto_hours);
    b.engine += num(r.engine_hours);
    buckets.set(key, b);
  }

  let rolling = new Map();
  if (grain !== "week" && raw.period) {
    const engineByDate = new Map();
    const daysByDate = new Map();
    for (const r of [...prev, ...cur]) {
      addTo(engineByDate, r.date_id, num(r.engine_hours));
      addTo(daysByDate, r.date_id, 24);
    }
    rolling = new Map(
      rollingRatio(periodDates(raw.period), engineByDate, daysByDate, ROLLING_DAYS, 100).map((p) => [p.date, p.value])
    );
  }

  return [...buckets.values()]
    .sort((a, b) => (a.key < b.key ? -1 : 1))
    .map((b) => ({
      date: b.key,
      Drive: Number((b.drive / b.days).toFixed(2)),
      Idle: Number((b.idle / b.days).toFixed(2)),
      PTO: Number((b.pto / b.days).toFixed(2)),
      utilization:
        grain === "week"
          ? Number(((b.engine / (b.days * 24)) * 100).toFixed(1))
          : rolling.get(b.key) !== null && rolling.get(b.key) !== undefined
            ? Number(rolling.get(b.key).toFixed(1))
            : null,
    }));
}

/**
 * Hour-of-day × weekday grid from trips (local time).
 * - "running": % of the fleet with the engine on in that hour = engine-on hours / (trucks × n weekdays);
 * - "starts": average trip starts per day in that hour.
 */
export function activityHeatmap(raw, metric) {
  const grid = WEEKDAYS.map(() => Array(24).fill(0));
  if (!raw.period) return { weekdays: WEEKDAYS, grid, max: 0 };

  const weekdayCount = Array(7).fill(0);
  for (const d of periodDates(raw.period)) weekdayCount[(parseDateId(d).getDay() + 6) % 7] += 1;

  for (const t of raw.trips) {
    const start = new Date(t.start_ts).getTime();
    const end = new Date(t.end_ts).getTime();
    if (Number.isNaN(start) || Number.isNaN(end) || end <= start) continue;
    if (metric === "starts") {
      const d = new Date(start);
      grid[(d.getDay() + 6) % 7][d.getHours()] += 1;
      continue;
    }
    let cursor = start;
    while (cursor < end) {
      const d = new Date(cursor);
      const hourEnd = new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours() + 1).getTime();
      const sliceEnd = Math.min(end, hourEnd);
      grid[(d.getDay() + 6) % 7][d.getHours()] += (sliceEnd - cursor) / HOUR_MS;
      cursor = sliceEnd;
    }
  }

  const trucks = raw.vehicles.length;
  let max = 0;
  for (let w = 0; w < 7; w += 1) {
    for (let h = 0; h < 24; h += 1) {
      const n = weekdayCount[w];
      const value = n === 0 ? 0 : metric === "starts" ? grid[w][h] / n : trucks > 0 ? (grid[w][h] / (trucks * n)) * 100 : 0;
      grid[w][h] = value;
      if (value > max) max = value;
    }
  }
  return { weekdays: WEEKDAYS, grid, max };
}

/** Region × Model utilization (engine-on hours / 24 h per vehicle-day). */
export function utilizationMatrix(trucks) {
  const regions = new Map();
  const models = new Map();
  const cells = new Map();
  for (const t of trucks) {
    regions.set(t.regionId, t.regionName);
    models.set(t.modelId, t.modelLabel);
    const key = `${t.regionId}|${t.modelId}`;
    const c = cells.get(key) ?? { trucks: 0, engineH: 0, days: 0 };
    c.trucks += 1;
    c.engineH += t.engineH;
    c.days += t.days;
    cells.set(key, c);
  }
  const sorted = (m) => [...m.entries()].sort(([a], [b]) => String(a).localeCompare(String(b))).map(([id, label]) => ({ id, label }));
  const rows = sorted(regions);
  const cols = sorted(models);
  return {
    rows,
    cols,
    minTrucks: MATRIX_MIN_TRUCKS,
    cells: rows.map((r) =>
      cols.map((c) => {
        const cell = cells.get(`${r.id}|${c.id}`) ?? { trucks: 0, engineH: 0, days: 0 };
        return {
          rowId: r.id,
          colId: c.id,
          trucks: cell.trucks,
          value: cell.days > 0 ? (cell.engineH / (cell.days * 24)) * 100 : null,
          lowSample: cell.trucks < MATRIX_MIN_TRUCKS,
        };
      })
    ),
  };
}

/** Trucks per 10-point utilization bin (last bin open-ended). */
export function utilizationDistribution(trucks) {
  const bins = [0, 10, 20, 30, 40, 50, 60].map((lo) => ({
    lo,
    hi: lo === 60 ? 101 : lo + 10,
    label: lo === 60 ? "60+" : `${lo}–${lo + 10}`,
    trucks: 0,
  }));
  for (const t of trucks) {
    if (t.utilization === null) continue;
    const bin = bins.find((b) => t.utilization >= b.lo && t.utilization < b.hi) ?? bins[bins.length - 1];
    bin.trucks += 1;
  }
  return bins.map((b) => ({ ...b, color: bandOf(UTILIZATION_BANDS, b.lo).color }));
}

export function utilizationByApplication(trucks) {
  const byApp = new Map();
  for (const t of trucks) {
    const key = t.applicationName ?? "Unknown";
    const a = byApp.get(key) ?? { name: key, trucks: 0, engineH: 0, days: 0, km: 0, opDays: 0 };
    a.trucks += 1;
    a.engineH += t.engineH;
    a.days += t.days;
    a.km += t.km;
    a.opDays += t.operatingDays;
    byApp.set(key, a);
  }
  return [...byApp.values()]
    .map((a) => ({
      name: a.name,
      trucks: a.trucks,
      utilization: a.days > 0 ? Number(((a.engineH / (a.days * 24)) * 100).toFixed(1)) : 0,
      kmPerOpDay: a.opDays > 0 ? Math.round(a.km / a.opDays) : 0,
    }))
    .sort((a, b) => b.utilization - a.utilization);
}

// ---------------------------------------------------------------------------
// Fuel, energy & emissions
// ---------------------------------------------------------------------------
export function fuelKpis(raw) {
  const { cur, prev } = splitDaily(raw);
  const vIdx = vehicleIndex(raw);
  const isBev = (r) => vIdx.get(r.vehicle_id)?.powertrain === "bev";
  const withPrev = hasPrevCoverage(raw, prev);

  const agg = (rows) => {
    let dieselFuel = 0;
    let dieselKm = 0;
    let bevKwh = 0;
    let bevKm = 0;
    let idleFuel = 0;
    let adblue = 0;
    let idleH = 0;
    let engineH = 0;
    let co2 = 0;
    let km = 0;
    for (const r of rows) {
      const bev = isBev(r);
      km += num(r.distance_km);
      idleH += num(r.idle_hours);
      engineH += num(r.engine_hours);
      co2 += num(r.co2_kg);
      if (bev) {
        bevKwh += num(r.energy_kwh);
        bevKm += num(r.distance_km);
      } else {
        dieselFuel += num(r.fuel_l);
        dieselKm += num(r.distance_km);
        idleFuel += num(r.idle_fuel_l);
        adblue += num(r.adblue_l);
      }
    }
    return {
      lPer100: ratio(dieselFuel, dieselKm, 100),
      kwhPer100: ratio(bevKwh, bevKm, 100),
      idleCost: idleFuel * DIESEL_PRICE_INR_PER_L,
      idleFuel,
      idlePct: ratio(idleH, engineH, 100),
      co2T: co2 / 1000,
      co2PerKm: ratio(co2, km),
      adbluePct: ratio(adblue, dieselFuel, 100),
      dieselFuel,
    };
  };
  const c = agg(cur);
  const p = agg(prev);
  const d = (k) => (withPrev && c[k] !== null && p[k] !== null ? c[k] - p[k] : null);
  const pctChange = (k) => (withPrev && p[k] > 0 ? ((c[k] - p[k]) / p[k]) * 100 : null);

  const trucks = raw.vehicles.length;
  const days = raw.period?.days ?? 0;
  const lowAdblueTrucks = truckStats(raw).filter((t) => t.adbluePct !== null && t.adbluePct < ADBLUE_LOW_PCT).length;

  return {
    ...c,
    lPer100Delta: d("lPer100"),
    kwhPer100Delta: d("kwhPer100"),
    idleCostChangePct: pctChange("idleCost"),
    idlePctDelta: d("idlePct"),
    co2ChangePct: pctChange("co2T"),
    adbluePctDelta: d("adbluePct"),
    idleCostPerTruckMonth: trucks > 0 && days > 0 ? (c.idleCost / trucks / days) * 30 : null,
    lowAdblueTrucks,
    hasDiesel: raw.vehicles.some((v) => v.powertrain !== "bev"),
    hasBev: raw.vehicles.some((v) => v.powertrain === "bev"),
  };
}

/**
 * 7-day rolling consumption per model (L/100 km diesel, kWh/100 km BEV), ratio of sums.
 * Returns one row per date with a key per model_id.
 */
export function consumptionTrend(raw, mode) {
  if (!raw.period) return { data: [], series: [] };
  const colors = modelColors(raw.vehicles);
  const vIdx = vehicleIndex(raw);
  const wantBev = mode === "bev";
  const numBy = new Map();
  const kmBy = new Map();
  for (const r of raw.daily) {
    const v = vIdx.get(r.vehicle_id);
    if (!v || (v.powertrain === "bev") !== wantBev) continue;
    const n = wantBev ? num(r.energy_kwh) : num(r.fuel_l);
    const km = num(r.distance_km);
    if (!numBy.has(v.model_id)) {
      numBy.set(v.model_id, new Map());
      kmBy.set(v.model_id, new Map());
    }
    addTo(numBy.get(v.model_id), r.date_id, n);
    addTo(kmBy.get(v.model_id), r.date_id, km);
  }
  const dates = periodDates(raw.period);
  const ratedBy = new Map(raw.models.map((m) => [m.model_id, m.base_consumption]));
  const labelBy = new Map(raw.vehicles.map((v) => [v.model_id, v.model_label]));
  const series = [...numBy.keys()].sort().map((id) => ({
    key: id,
    label: labelBy.get(id) ?? id,
    color: colors[id],
    rated: ratedBy.get(id) ?? null,
  }));
  const perModel = new Map(
    series.map((s) => [s.key, new Map(rollingRatio(dates, numBy.get(s.key), kmBy.get(s.key), ROLLING_DAYS, 100).map((p) => [p.date, p.value]))])
  );
  const data = dates.map((date) => {
    const row = { date };
    for (const s of series) {
      const v = perModel.get(s.key).get(date);
      row[s.key] = v === null || v === undefined ? null : Number(v.toFixed(1));
    }
    return row;
  });
  return { data, series };
}

export function worstIdleTrucks(trucks, limit = 10) {
  return trucks
    .filter((t) => t.engineH >= IDLE_RANKING_MIN_ENGINE_H && t.idlePct !== null)
    .sort((a, b) => b.idlePct - a.idlePct)
    .slice(0, limit)
    .map((t) => ({
      vehicleId: t.vehicleId,
      label: t.vin ?? t.vehicleId,
      modelLabel: t.modelLabel,
      idlePct: Number(t.idlePct.toFixed(1)),
      idleH: Number(t.idleH.toFixed(1)),
      idleCostInr: t.idleCostInr,
    }));
}

const MAX_SCATTER_POINTS_PER_MODEL = 400;

/**
 * Per trip: consumption (y) against average gross combination weight in tonnes (x),
 * one series per model. Trips shorter than `minKm` are dropped (start-up fuel distorts them).
 */
export function consumptionVsLoad(raw, mode, minKm) {
  const colors = modelColors(raw.vehicles);
  const vIdx = vehicleIndex(raw);
  const wantBev = mode === "bev";
  const byModel = new Map();
  for (const t of raw.trips) {
    const v = vIdx.get(t.vehicle_id);
    if (!v || (v.powertrain === "bev") !== wantBev) continue;
    const km = num(t.distance_km);
    if (km < minKm || !t.avg_gcw_kg) continue;
    const used = wantBev ? t.energy_used_kwh : t.fuel_used_l;
    if (used === null || used === undefined) continue;
    const y = (Number(used) / km) * 100;
    if (!Number.isFinite(y) || y <= 0) continue;
    if (!byModel.has(v.model_id)) byModel.set(v.model_id, { key: v.model_id, label: v.model_label, color: colors[v.model_id], points: [] });
    byModel.get(v.model_id).points.push({
      x: Number((t.avg_gcw_kg / 1000).toFixed(1)),
      y: Number(y.toFixed(1)),
      km: Number(km.toFixed(1)),
      tripId: t.trip_id,
      vehicleId: t.vehicle_id,
    });
  }
  return [...byModel.values()]
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((s) => {
      const stride = Math.ceil(s.points.length / MAX_SCATTER_POINTS_PER_MODEL);
      return { ...s, total: s.points.length, points: stride > 1 ? s.points.filter((_, i) => i % stride === 0) : s.points };
    });
}

/** Diesel fuel split into driving / idle / PTO per application (share %, with litres). */
export function fuelSplitByApplication(raw) {
  const vIdx = vehicleIndex(raw);
  const byApp = new Map();
  for (const t of raw.trips) {
    const v = vIdx.get(t.vehicle_id);
    if (!v || v.powertrain === "bev" || t.fuel_used_l === null) continue;
    const key = v.application_name ?? "Unknown";
    const a = byApp.get(key) ?? { name: key, total: 0, idle: 0, pto: 0 };
    a.total += num(t.fuel_used_l);
    a.idle += num(t.idle_fuel_l);
    a.pto += num(t.pto_fuel_l);
    byApp.set(key, a);
  }
  return [...byApp.values()]
    .filter((a) => a.total > 0)
    .map((a) => {
      const drive = Math.max(0, a.total - a.idle - a.pto);
      return {
        name: a.name,
        Driving: Number(((drive / a.total) * 100).toFixed(1)),
        Idle: Number(((a.idle / a.total) * 100).toFixed(1)),
        PTO: Number(((a.pto / a.total) * 100).toFixed(1)),
        litres: { Driving: drive, Idle: a.idle, PTO: a.pto },
      };
    })
    .sort((a, b) => b.Idle + b.PTO - (a.Idle + a.PTO));
}

/** One row per model: actual vs rated consumption and the efficiency indicators around it. */
export function modelBenchmark(raw) {
  const { cur } = splitDaily(raw);
  const vIdx = vehicleIndex(raw);
  const byModel = new Map();
  const ensure = (v) => {
    if (!byModel.has(v.model_id)) {
      byModel.set(v.model_id, {
        modelId: v.model_id,
        modelLabel: v.model_label,
        powertrain: v.powertrain,
        trucks: new Set(),
        km: 0,
        fuel: 0,
        kwh: 0,
        adblue: 0,
        idleH: 0,
        engineH: 0,
        co2: 0,
        ecoW: 0,
        ecoKm: 0,
      });
    }
    return byModel.get(v.model_id);
  };
  for (const r of cur) {
    const v = vIdx.get(r.vehicle_id);
    if (!v) continue;
    const m = ensure(v);
    m.trucks.add(r.vehicle_id);
    m.km += num(r.distance_km);
    m.fuel += num(r.fuel_l);
    m.kwh += num(r.energy_kwh);
    m.adblue += num(r.adblue_l);
    m.idleH += num(r.idle_hours);
    m.engineH += num(r.engine_hours);
    m.co2 += num(r.co2_kg);
  }
  for (const t of raw.trips) {
    const v = vIdx.get(t.vehicle_id);
    if (!v || t.eco_score === null) continue;
    const m = ensure(v);
    const km = num(t.distance_km);
    m.ecoW += Number(t.eco_score) * km;
    m.ecoKm += km;
  }
  const modelRef = new Map(raw.models.map((m) => [m.model_id, m]));
  return [...byModel.values()]
    .sort((a, b) => a.modelId.localeCompare(b.modelId))
    .map((m) => {
      const bev = m.powertrain === "bev";
      const actual = bev ? ratio(m.kwh, m.km, 100) : ratio(m.fuel, m.km, 100);
      const rated = modelRef.get(m.modelId)?.base_consumption ?? null;
      return {
        modelId: m.modelId,
        modelLabel: m.modelLabel,
        powertrain: m.powertrain,
        unit: modelRef.get(m.modelId)?.consumption_unit ?? (bev ? "kWh/100km" : "L/100km"),
        trucks: m.trucks.size,
        km: m.km,
        actual,
        rated,
        gapPct: actual !== null && rated ? ((actual - rated) / rated) * 100 : null,
        idlePct: ratio(m.idleH, m.engineH, 100),
        adbluePct: bev ? null : ratio(m.adblue, m.fuel, 100),
        co2PerKm: bev ? 0 : ratio(m.co2, m.km),
        eco: m.ecoKm > 0 ? m.ecoW / m.ecoKm : null,
      };
    });
}

export function evStats(raw, minKm) {
  const vIdx = vehicleIndex(raw);
  const byType = new Map();
  let kwh = 0;
  let cost = 0;
  for (const s of raw.charging) {
    const type = s.charger_type ?? "Unknown";
    const b = byType.get(type) ?? { type, sessions: 0, kwh: 0, cost: 0, socGain: 0 };
    b.sessions += 1;
    b.kwh += num(s.energy_kwh);
    b.cost += num(s.cost_inr);
    b.socGain += num(s.soc_end_pct) - num(s.soc_start_pct);
    byType.set(type, b);
    kwh += num(s.energy_kwh);
    cost += num(s.cost_inr);
  }
  const chargerMix = [...byType.values()].map((b) => ({
    type: b.type === "DEPOT_DC" ? "Depot DC" : b.type === "PUBLIC_DC" ? "Public DC" : b.type,
    sessions: b.sessions,
    kwh: Math.round(b.kwh),
    cost: Math.round(b.cost),
    perKwh: b.kwh > 0 ? Number((b.cost / b.kwh).toFixed(1)) : null,
    avgSocGain: b.sessions > 0 ? Number((b.socGain / b.sessions).toFixed(1)) : null,
  }));
  const publicKwh = byType.get("PUBLIC_DC")?.kwh ?? 0;

  const tempPoints = [];
  let regen = 0;
  let used = 0;
  for (const t of raw.trips) {
    if (vIdx.get(t.vehicle_id)?.powertrain !== "bev") continue;
    regen += num(t.regen_kwh);
    used += num(t.energy_used_kwh);
    const km = num(t.distance_km);
    if (km < minKm || t.energy_used_kwh === null || t.ambient_temp_c === null) continue;
    tempPoints.push({
      x: Number(Number(t.ambient_temp_c).toFixed(1)),
      y: Number(((Number(t.energy_used_kwh) / km) * 100).toFixed(1)),
      km: Number(km.toFixed(1)),
      vehicleId: t.vehicle_id,
    });
  }
  const stride = Math.ceil(tempPoints.length / 600);
  return {
    sessions: raw.charging.length,
    kwh,
    cost,
    perKwh: kwh > 0 ? cost / kwh : null,
    publicSharePct: kwh > 0 ? (publicKwh / kwh) * 100 : null,
    // energy_used_kwh is net of regen, so regen share = regen / (net + regen)
    regenSharePct: used + regen > 0 ? (regen / (used + regen)) * 100 : null,
    chargerMix,
    tempPoints: stride > 1 ? tempPoints.filter((_, i) => i % stride === 0) : tempPoints,
  };
}

// ---------------------------------------------------------------------------
// Driver behaviour & safety
// ---------------------------------------------------------------------------
export const EMPTY_EVENT_FILTER = { families: null, severity: "all", eventType: null };

export function eventMatches(e, filter) {
  if (filter.eventType && e.event_type !== filter.eventType) return false;
  if (filter.families && !filter.families.includes(FAMILY_OF[e.event_type])) return false;
  if (filter.severity !== "all" && e.severity !== filter.severity) return false;
  return true;
}

export function familyOf(type) {
  return FAMILY_OF[type] ?? "Other";
}

export function safetyKpis(raw, filter) {
  const { cur, prev } = splitDaily(raw);
  const withPrev = hasPrevCoverage(raw, prev);
  const vIdx = vehicleIndex(raw);
  const km = (rows) => rows.reduce((s, r) => s + num(r.distance_km), 0);
  const kmCur = km(cur);
  const kmPrev = km(prev);

  let evCur = 0;
  let evPrev = 0;
  let high = 0;
  let adas = 0;
  for (const e of raw.events) {
    if (!eventMatches(e, filter)) continue;
    if (inCurrent(raw.period, e.date_id)) {
      evCur += 1;
      if (e.severity === "high") high += 1;
    } else if (inPrevious(raw.period, e.date_id)) evPrev += 1;
  }
  for (const e of raw.events) {
    if (ADAS_TYPES.has(e.event_type) && inCurrent(raw.period, e.date_id) && vIdx.get(e.vehicle_id)?.adas_equipped) adas += 1;
  }
  const adasKm = cur.filter((r) => vIdx.get(r.vehicle_id)?.adas_equipped).reduce((s, r) => s + num(r.distance_km), 0);

  const safety = distanceWeighted(cur, "safety_score");
  const safetyPrev = distanceWeighted(prev, "safety_score");
  const rate = ratio(evCur, kmCur, 1000);
  const ratePrev = ratio(evPrev, kmPrev, 1000);

  let ecoW = 0;
  let ecoKm = 0;
  for (const t of raw.trips) {
    if (t.eco_score === null) continue;
    ecoW += Number(t.eco_score) * num(t.distance_km);
    ecoKm += num(t.distance_km);
  }

  return {
    safety,
    safetyDelta: withPrev && safety !== null && safetyPrev !== null ? safety - safetyPrev : null,
    eventsPer1000: rate,
    eventsPer1000Delta: withPrev && rate !== null && ratePrev !== null ? rate - ratePrev : null,
    events: evCur,
    highEvents: high,
    eco: ecoKm > 0 ? ecoW / ecoKm : null,
    adasPer1000: ratio(adas, adasKm, 1000),
    adasTrucks: raw.vehicles.filter((v) => v.adas_equipped).length,
  };
}

/** Events per 1,000 km per family, 7-day rolling (events in window / km in window). */
export function eventRateTrend(raw, filter) {
  if (!raw.period) return { data: [], families: [] };
  const kmByDate = new Map();
  for (const r of raw.daily) addTo(kmByDate, r.date_id, num(r.distance_km));
  const families = EVENT_FAMILIES.filter((f) => !filter.families || filter.families.includes(f.name));
  const countBy = new Map(families.map((f) => [f.name, new Map()]));
  for (const e of raw.events) {
    if (!eventMatches(e, filter)) continue;
    const m = countBy.get(FAMILY_OF[e.event_type]);
    if (m) addTo(m, e.date_id, 1);
  }
  const dates = periodDates(raw.period);
  const perFamily = new Map(
    families.map((f) => [f.name, new Map(rollingRatio(dates, countBy.get(f.name), kmByDate, ROLLING_DAYS, 1000).map((p) => [p.date, p.value]))])
  );
  const data = dates.map((date) => {
    const row = { date };
    for (const f of families) {
      const v = perFamily.get(f.name).get(date);
      row[f.name] = v === null || v === undefined ? 0 : Number(v.toFixed(2));
    }
    return row;
  });
  return { data, families };
}

/**
 * One row per driver. Safety and km come from the vehicle-days the driver was assigned
 * (`fact_vehicle_daily.driver_id`); events from `fact_harsh_events.driver_id`; driving style
 * from trips (`fact_trip.driver_id`).
 */
export function driverStats(raw, filter) {
  if (!raw.period) return [];
  const aliasOf = new Map(raw.drivers.map((d) => [d.driver_id, d.driver_alias]));
  const vIdx = vehicleIndex(raw);
  const byDriver = new Map();
  const ensure = (id) => {
    if (!byDriver.has(id)) {
      byDriver.set(id, {
        driverId: id,
        alias: aliasOf.get(id) ?? id,
        cur: [],
        prev: [],
        trucks: new Map(),
        events: 0,
        byType: new Map(),
        trip: { km: 0, ecoW: 0, driveS: 0, idleS: 0, greenW: 0, greenS: 0, cruiseW: 0, coastW: 0, brakes: 0, overspeedS: 0, bev: false },
      });
    }
    return byDriver.get(id);
  };

  for (const r of raw.daily) {
    if (!r.driver_id) continue;
    const cur = inCurrent(raw.period, r.date_id);
    if (!cur && !inPrevious(raw.period, r.date_id)) continue;
    const d = ensure(r.driver_id);
    if (cur) {
      d.cur.push(r);
      if (num(r.distance_km) > 0) addTo(d.trucks, r.vehicle_id, num(r.distance_km));
    } else d.prev.push(r);
  }
  for (const e of raw.events) {
    if (!e.driver_id || !inCurrent(raw.period, e.date_id) || !eventMatches(e, filter)) continue;
    const d = ensure(e.driver_id);
    d.events += 1;
    addTo(d.byType, e.event_type, 1);
  }
  for (const t of raw.trips) {
    if (!t.driver_id) continue;
    const s = ensure(t.driver_id).trip;
    const km = num(t.distance_km);
    s.km += km;
    if (t.eco_score !== null) s.ecoW += Number(t.eco_score) * km;
    s.driveS += num(t.drive_s);
    s.idleS += num(t.idle_s);
    if (t.rpm_green_band_pct !== null) {
      s.greenW += Number(t.rpm_green_band_pct) * num(t.drive_s);
      s.greenS += num(t.drive_s);
    }
    s.cruiseW += num(t.cruise_distance_pct) * km;
    s.coastW += num(t.coasting_distance_pct) * km;
    s.brakes += num(t.brake_applications);
    s.overspeedS += num(t.overspeed_s);
    if (vIdx.get(t.vehicle_id)?.powertrain === "bev") s.bev = true;
  }

  return [...byDriver.values()]
    .map((d) => {
      const km = d.cur.reduce((s, r) => s + num(r.distance_km), 0);
      const safety = distanceWeighted(d.cur, "safety_score");
      const safetyPrev = distanceWeighted(d.prev, "safety_score");
      const topType = [...d.byType.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
      const t = d.trip;
      return {
        driverId: d.driverId,
        alias: d.alias,
        km,
        trucks: [...d.trucks.entries()].sort((a, b) => b[1] - a[1]).map(([vehicleId, tkm]) => ({ vehicleId, km: tkm, vin: vIdx.get(vehicleId)?.vin })),
        safety,
        safetyDelta: safety !== null && safetyPrev !== null && d.prev.length >= 3 ? safety - safetyPrev : null,
        band: bandOf(SAFETY_BANDS, safety)?.name ?? null,
        eco: t.km > 0 ? t.ecoW / t.km : null,
        events: d.events,
        eventsPer1000: ratio(d.events, km, 1000),
        topEventType: topType,
        byType: [...d.byType.entries()].map(([type, count]) => ({ type, label: EVENT_LABELS[type] ?? type, count })).sort((a, b) => b.count - a.count),
        idlePct: ratio(t.idleS, t.driveS + t.idleS, 100),
        greenBandPct: t.greenS > 0 ? t.greenW / t.greenS : null,
        cruisePct: t.km > 0 ? t.cruiseW / t.km : null,
        coastingPct: t.km > 0 ? t.coastW / t.km : null,
        brakesPer100: ratio(t.brakes, t.km, 100),
        overspeedPer100: ratio(t.overspeedS, t.km, 100),
        bev: t.bev,
        dailyRows: d.cur,
      };
    })
    .filter((d) => d.km > 0);
}

/** Plain-language coaching focus, from the driver's worst indicators vs fleet medians. */
export function coachingFocus(driver, drivers) {
  const median = (field) => {
    const vals = drivers.map((d) => d[field]).filter((v) => v !== null && v !== undefined).sort((a, b) => a - b);
    return vals.length ? vals[Math.floor(vals.length / 2)] : null;
  };
  const tips = [];
  if (driver.topEventType) {
    const share = driver.events > 0 ? (driver.byType[0].count / driver.events) * 100 : 0;
    tips.push(`${EVENT_LABELS[driver.topEventType] ?? driver.topEventType} is ${share.toFixed(0)}% of this driver's events.`);
  }
  const brakesMed = median("brakesPer100");
  if (driver.brakesPer100 !== null && brakesMed && driver.brakesPer100 > brakesMed * 1.3) {
    tips.push(`Anticipation: ${driver.brakesPer100.toFixed(0)} brake applications / 100 km vs fleet median ${brakesMed.toFixed(0)}.`);
  }
  const greenMed = median("greenBandPct");
  if (!driver.bev && driver.greenBandPct !== null && greenMed && driver.greenBandPct < greenMed - 10) {
    tips.push(`Gear use: ${driver.greenBandPct.toFixed(0)}% of drive time in the RPM green band vs median ${greenMed.toFixed(0)}%.`);
  }
  const idleMed = median("idlePct");
  if (driver.idlePct !== null && idleMed && driver.idlePct > idleMed * 1.3) {
    tips.push(`Idling: ${driver.idlePct.toFixed(0)}% of engine-on time vs median ${idleMed.toFixed(0)}%.`);
  }
  const cruiseMed = median("cruisePct");
  if (driver.cruisePct !== null && cruiseMed && driver.cruisePct < cruiseMed - 10) {
    tips.push(`Cruise control used on ${driver.cruisePct.toFixed(0)}% of distance vs median ${cruiseMed.toFixed(0)}%.`);
  }
  const overMed = median("overspeedPer100");
  if (driver.overspeedPer100 !== null && driver.overspeedPer100 > Math.max(overMed ?? 0, 1) * 1.5) {
    tips.push(`Overspeed: ${driver.overspeedPer100.toFixed(0)} s above ${OVERSPEED_LIMIT_KMH} km/h per 100 km.`);
  }
  if (tips.length === 0) tips.push("No indicator is clearly worse than the fleet median.");
  return tips;
}

/** Weekly km-weighted safety score for one driver. */
export function driverWeeklySafety(driver) {
  const weeks = new Map();
  for (const r of driver.dailyRows) {
    const key = weekStart(r.date_id);
    const w = weeks.get(key) ?? { week: key, rows: [] };
    w.rows.push(r);
    weeks.set(key, w);
  }
  return [...weeks.values()]
    .sort((a, b) => (a.week < b.week ? -1 : 1))
    .map((w) => {
      const s = distanceWeighted(w.rows, "safety_score");
      return { week: w.week, safety: s === null ? null : Number(s.toFixed(1)) };
    });
}

export function worstDrivers(drivers, minKm, limit = 10) {
  return drivers
    .filter((d) => d.km >= minKm && d.safety !== null)
    .sort((a, b) => a.safety - b.safety)
    .slice(0, limit)
    .map((d) => ({ ...d, safetyRounded: Number(d.safety.toFixed(1)), color: bandOf(SAFETY_BANDS, d.safety).color }));
}

export function safetyDistribution(drivers, minKm) {
  const edges = [0, 60, 65, 70, 75, 80, 85, 90, 95];
  const bins = edges.map((lo, i) => ({
    lo,
    hi: i === edges.length - 1 ? 101 : edges[i + 1],
    label: lo === 0 ? "< 60" : i === edges.length - 1 ? "95+" : `${lo}–${edges[i + 1]}`,
    drivers: 0,
  }));
  for (const d of drivers) {
    if (d.km < minKm || d.safety === null) continue;
    const bin = bins.find((b) => d.safety >= b.lo && d.safety < b.hi) ?? bins[bins.length - 1];
    bin.drivers += 1;
  }
  return bins.map((b) => ({ ...b, color: bandOf(SAFETY_BANDS, b.lo).color, band: bandOf(SAFETY_BANDS, b.lo).name }));
}

/** Event type × severity counts in the period (ignores the local filter; it *is* a filter). */
export function eventSeverityMatrix(raw) {
  const counts = new Map();
  let max = 0;
  for (const e of raw.events) {
    if (!inCurrent(raw.period, e.date_id)) continue;
    const key = `${e.event_type}|${e.severity}`;
    const n = (counts.get(key) ?? 0) + 1;
    counts.set(key, n);
    if (n > max) max = n;
  }
  const types = EVENT_FAMILIES.flatMap((f) => f.types).filter((t) => SEVERITIES.some((s) => counts.has(`${t}|${s}`)));
  return {
    rows: types.map((t) => ({ id: t, label: EVENT_LABELS[t] ?? t, family: FAMILY_OF[t] })),
    cols: SEVERITIES,
    counts,
    max,
  };
}

/** Share of driving time in each rFMS speed class, per group (application or model). */
export function speedProfile(raw, groupBy) {
  const vIdx = vehicleIndex(raw);
  const groups = new Map();
  for (const t of raw.trips) {
    const v = vIdx.get(t.vehicle_id);
    if (!v || !t.speed_class_s) continue;
    const key = groupBy === "model" ? v.model_label : v.application_name ?? "Unknown";
    const g = groups.get(key) ?? { name: key, total: 0, bands: Object.fromEntries(SPEED_BANDS.map((b) => [b.key, 0])) };
    for (const b of SPEED_BANDS) {
      const s = num(t.speed_class_s[b.key]);
      g.bands[b.key] += s;
      g.total += s;
    }
    groups.set(key, g);
  }
  return [...groups.values()]
    .filter((g) => g.total > 0)
    .map((g) => {
      const row = { name: g.name, hours: g.total / 3600 };
      for (const b of SPEED_BANDS) row[b.key] = Number(((g.bands[b.key] / g.total) * 100).toFixed(1));
      return row;
    })
    .sort((a, b) => b[">80"] - a[">80"]);
}

// ---------------------------------------------------------------------------
// Data health
// ---------------------------------------------------------------------------
export function dataHealthKpis(raw, trucks) {
  const { cur, prev } = splitDaily(raw);
  const completeness = (rows) => {
    const e = rows.reduce((s, r) => s + num(r.packets_expected), 0);
    const rc = rows.reduce((s, r) => s + num(r.packets_received), 0);
    return ratio(rc, e, 100);
  };
  const c = completeness(cur);
  const p = completeness(prev);
  return {
    connected: raw.vehicles.length,
    completeness: c,
    completenessDelta: hasPrevCoverage(raw, prev) && c !== null && p !== null ? c - p : null,
    lowCompletenessTrucks: trucks.filter((t) => t.completeness !== null && t.completeness < LOW_COMPLETENESS_PCT).length,
    silentTrucks: trucks.filter((t) => t.status === "Silent").length,
  };
}

export function completenessTrend(raw) {
  if (!raw.period) return [];
  const exp = new Map();
  const rec = new Map();
  for (const r of raw.daily) {
    addTo(exp, r.date_id, num(r.packets_expected));
    addTo(rec, r.date_id, num(r.packets_received));
  }
  return rollingRatio(periodDates(raw.period), rec, exp, ROLLING_DAYS, 100).map((p) => ({
    date: p.date,
    value: p.value === null ? null : Number(p.value.toFixed(2)),
  }));
}

export function completenessBy(trucks, key) {
  const field = { region: "regionName", source: "telematicsSource", model: "modelLabel" }[key];
  const groups = new Map();
  for (const t of trucks) {
    const name = t[field] ?? "Unknown";
    const g = groups.get(name) ?? { name, expected: 0, received: 0, trucks: 0 };
    g.expected += t.expected;
    g.received += t.received;
    g.trucks += 1;
    groups.set(name, g);
  }
  return [...groups.values()]
    .map((g) => ({ name: g.name, trucks: g.trucks, completeness: g.expected > 0 ? Number(((g.received / g.expected) * 100).toFixed(2)) : 0 }))
    .sort((a, b) => a.completeness - b.completeness);
}

// ---------------------------------------------------------------------------
// Asset View
// ---------------------------------------------------------------------------
export function assetKpis(raw) {
  const rows = raw.daily;
  const bev = raw.vehicle?.powertrain === "bev";
  const sum = (f) => rows.reduce((s, r) => s + num(r[f]), 0);
  const km = sum("distance_km");
  const engineH = sum("engine_hours");
  const consumption = bev ? ratio(sum("energy_kwh"), km, 100) : ratio(sum("fuel_l"), km, 100);
  const rated = raw.model?.base_consumption ?? null;
  let lastPing = null;
  for (const r of rows) if (r.last_ping_ts && (!lastPing || r.last_ping_ts > lastPing)) lastPing = r.last_ping_ts;
  const opDays = rows.filter((r) => r.is_operating).length;
  return {
    bev,
    safety: distanceWeighted(rows, "safety_score"),
    eco: distanceWeighted(rows, "eco_score"),
    km,
    kmPerOpDay: opDays > 0 ? km / opDays : null,
    opDays,
    days: rows.length,
    utilization: rows.length ? (engineH / (rows.length * 24)) * 100 : null,
    consumption,
    consumptionUnit: bev ? "kWh/100 km" : "L/100 km",
    rated,
    vsRatedPct: consumption !== null && rated ? ((consumption - rated) / rated) * 100 : null,
    idlePct: ratio(sum("idle_hours"), engineH, 100),
    idleCostInr: sum("idle_fuel_l") * DIESEL_PRICE_INR_PER_L,
    events: raw.events.length,
    eventsPer1000: ratio(raw.events.length, km, 1000),
    activeDtcs: raw.activeDtcs.length,
    redLampDtcs: raw.activeDtcs.filter((d) => d.lamp_status === "RSL" || d.caused_derate).length,
    lastPing,
  };
}

export function assetDailyTrend(raw) {
  return [...raw.daily]
    .sort((a, b) => (a.date_id < b.date_id ? -1 : 1))
    .map((r) => ({
      date: r.date_id,
      km: Math.round(num(r.distance_km)),
      engineH: Number(num(r.engine_hours).toFixed(1)),
      inWorkshop: Boolean(r.in_workshop),
    }));
}

export function assetTrips(raw) {
  const bev = raw.vehicle?.powertrain === "bev";
  return [...raw.trips]
    .sort((a, b) => (a.start_ts < b.start_ts ? 1 : -1))
    .map((t) => {
      const km = num(t.distance_km);
      const used = bev ? t.energy_used_kwh : t.fuel_used_l;
      const engineS = num(t.drive_s) + num(t.idle_s) + num(t.pto_s);
      return {
        tripId: t.trip_id,
        dateId: t.date_id,
        startTs: t.start_ts,
        endTs: t.end_ts,
        route: `${t.start_city ?? "?"} → ${t.end_city ?? "?"}`,
        km,
        durationH: (new Date(t.end_ts) - new Date(t.start_ts)) / HOUR_MS,
        consumption: used !== null && km > 0 ? (Number(used) / km) * 100 : null,
        idlePct: engineS > 0 ? (num(t.idle_s) / engineS) * 100 : null,
        events: num(t.harsh_event_count),
        eco: t.eco_score,
      };
    });
}

/** Speed trace points + event markers for one day (optionally narrowed to a trip). */
export function speedTrace(trace, tripId) {
  const status = tripId ? trace.status.filter((s) => s.trip_id === tripId) : trace.status;
  const points = status
    .map((s) => ({
      t: new Date(s.ts).getTime(),
      speed: s.wheel_speed_kmh === null ? null : Number(s.wheel_speed_kmh),
      level: s.soc_pct !== null && s.soc_pct !== undefined ? Number(s.soc_pct) : s.fuel_level_pct !== null ? Number(s.fuel_level_pct) : null,
      state: s.engine_state,
      workState: s.driver_working_state,
    }))
    .sort((a, b) => a.t - b.t);
  const events = (tripId ? trace.events.filter((e) => e.trip_id === tripId) : trace.events).map((e) => ({
    t: new Date(e.ts).getTime(),
    speed: e.speed_before_kmh === null ? 0 : Number(e.speed_before_kmh),
    type: e.event_type,
    label: EVENT_LABELS[e.event_type] ?? e.event_type,
    severity: e.severity,
  }));
  return { points, events };
}

/** Consecutive runs of the same state, as [start, end) spans for a timeline strip. */
export function stateSpans(points, field) {
  const spans = [];
  for (let i = 0; i < points.length; i += 1) {
    const p = points[i];
    const next = points[i + 1];
    const end = next ? next.t : p.t + 5 * 60 * 1000;
    const last = spans[spans.length - 1];
    if (last && last.state === p[field] && p.t - last.end < 30 * 60 * 1000) last.end = end;
    else spans.push({ state: p[field] ?? "unknown", start: p.t, end });
  }
  return spans;
}
