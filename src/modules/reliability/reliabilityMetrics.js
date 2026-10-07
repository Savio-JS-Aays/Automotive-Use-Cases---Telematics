/**
 * Pure reliability analytics for the Component Reliability module. Input = the rows returned by
 * `useReliabilityData` (lifetime part replacements + current odometers). Every formula is
 * documented in Documentation/metrics/reliability.md.
 *
 * Life model (renewal): a part's life is the km it ran since it was fitted, i.e. the odometer at
 * failure minus the odometer at the previous replacement of the same part on the same truck (or
 * 0 for the factory-fitted part). Parts still running are suspensions (right-censored) at
 * current odometer − last replacement odometer.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
export const MILES_TO_KM = 1.609344;
export const MIN_GROUP_FAILURES = 5; // below this a group shows "Insufficient Data"
export const MIN_WEIBULL_FAILURES = 10; // failures needed before a Weibull fit is shown
export const MIN_PRECURSOR_FAILURES = 3;
export const MIN_GROUP_TRUCKS = 5;
export const REPEAT_KM = 10000;
export const REPEAT_DAYS = 30;
export const HAZARD_BUCKET_KM = 50000;
export const B10_TARGET = 0.9; // survival at B10
const Z90 = 1.645; // two-sided 90 % band
const DAY_MS = 24 * 60 * 60 * 1000;

export const HAZARD_STATUSES = ["Critical", "Watch", "On Spec", "Insufficient Data"];
export const HAZARD_STYLES = {
  Critical: "bg-rose-100 text-rose-700",
  Watch: "bg-amber-100 text-amber-700",
  "On Spec": "bg-emerald-100 text-emerald-700",
  "Insufficient Data": "bg-slate-100 text-slate-500",
};
export const HAZARD_COLORS = { Critical: "#e11d48", Watch: "#f59e0b", "On Spec": "#10b981", "Insufficient Data": "#94a3b8" };
export const RISK_TIER_COLORS = { High: "#e11d48", Medium: "#f59e0b", Low: "#10b981" };
export const GROUP_PALETTE = ["#0ea5e9", "#8b5cf6", "#f59e0b", "#10b981", "#e11d48", "#64748b"];
export const CLEAR_CAUSE_SHARE = 40; // one failure mode at or above this % of a part's failures is a clear corrective-action target
export const MAIN_CAUSE_PARTS = 10;

export const GROUP_TYPES = [
  { value: "all", label: "All" },
  { value: "supplier", label: "Supplier" },
  { value: "model", label: "Model" },
  { value: "application", label: "Application" },
];

export const AGE_BUCKETS = [
  { id: "0-12", label: "0–12 mo", min: 0, max: 12 },
  { id: "12-24", label: "12–24 mo", min: 12, max: 24 },
  { id: "24-36", label: "24–36 mo", min: 24, max: 36 },
  { id: "36-48", label: "36–48 mo", min: 36, max: 48 },
  { id: "48+", label: "48+ mo", min: 48, max: Infinity },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const num = (v) => (v === null || v === undefined || Number.isNaN(Number(v)) ? 0 : Number(v));

function parseDateId(id) {
  const [y, m, d] = id.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function daysBetween(a, b) {
  return Math.round((parseDateId(b) - parseDateId(a)) / DAY_MS);
}

function mean(values) {
  return values.length ? values.reduce((s, v) => s + v, 0) / values.length : null;
}

/** Compact km label (k / M). */
export function formatKm(km) {
  if (km === null || km === undefined) return "—";
  if (km >= 1e6) return `${(km / 1e6).toFixed(2)}M km`;
  if (km >= 1e3) return `${Math.round(km / 1e3).toLocaleString("en-IN")}k km`;
  return `${Math.round(km)} km`;
}

export function patternLabel(beta) {
  if (beta === null || beta === undefined) return null;
  if (beta < 0.9) return "Infant mortality";
  if (beta <= 1.1) return "Random";
  return "Wear-out";
}

export function hazardStatus(variancePct, failures) {
  if (variancePct === null || variancePct === undefined || failures < MIN_GROUP_FAILURES) return "Insufficient Data";
  if (variancePct < -20) return "Critical";
  if (variancePct < 0) return "Watch";
  return "On Spec";
}

export function designB10Km(part) {
  return part?.b10_design_life_miles ? Number(part.b10_design_life_miles) * MILES_TO_KM : null;
}

function quarterOf(dateId) {
  if (!dateId) return null;
  const [y, m] = dateId.split("-").map(Number);
  return `${y} Q${Math.floor((m - 1) / 3) + 1}`;
}

// ---------------------------------------------------------------------------
// Life table
// ---------------------------------------------------------------------------
/**
 * Failures (one per replacement) and suspensions (one per truck × applicable part still
 * running). A part applies to a truck when any truck of the same model in scope has replaced it.
 */
export function buildLifeTable(raw) {
  const vehicles = new Map(raw.vehicles.map((v) => [v.vehicle_id, v]));
  const partsById = new Map(raw.parts.map((p) => [p.part_id, p]));
  const suppliersById = new Map(raw.suppliers.map((s) => [s.supplier_id, s]));
  const downtimeByRo = new Map(raw.repairOrders.map((r) => [r.ro_id, r.downtime_hours]));

  const odoByVehicle = new Map(raw.odometer.map((o) => [o.vehicle_id, num(o.odometer_km_end)]));
  for (const r of raw.replacements) {
    // fallback if a truck has no daily row on the latest day
    if (!odoByVehicle.has(r.vehicle_id)) odoByVehicle.set(r.vehicle_id, num(r.odometer_km_at_failure));
  }

  const pairs = new Map();
  for (const r of raw.replacements) {
    const key = `${r.vehicle_id}|${r.part_id}`;
    const list = pairs.get(key) ?? [];
    list.push(r);
    pairs.set(key, list);
  }

  const applicable = new Map(); // model_id → Set(part_id)
  const supplierCounts = new Map(); // part → Map(supplier → n)
  for (const r of raw.replacements) {
    const model = vehicles.get(r.vehicle_id)?.model_id;
    if (!model) continue;
    const set = applicable.get(model) ?? new Set();
    set.add(r.part_id);
    applicable.set(model, set);
    const counts = supplierCounts.get(r.part_id) ?? new Map();
    counts.set(r.supplier_id, (counts.get(r.supplier_id) ?? 0) + 1);
    supplierCounts.set(r.part_id, counts);
  }
  const supplierShare = new Map();
  for (const [partId, counts] of supplierCounts) {
    const total = [...counts.values()].reduce((s, v) => s + v, 0);
    supplierShare.set(partId, new Map([...counts].map(([s, n]) => [s, n / total])));
  }

  const failures = [];
  const lastByPair = new Map();
  for (const [key, list] of pairs) {
    list.sort((a, b) => num(a.odometer_km_at_failure) - num(b.odometer_km_at_failure));
    let prev = null;
    for (const r of list) {
      const odo = num(r.odometer_km_at_failure);
      const life = odo - (prev ? num(prev.odometer_km_at_failure) : 0);
      const repeat = Boolean(prev) && (life <= REPEAT_KM || daysBetween(prev.date_id, r.date_id) <= REPEAT_DAYS);
      const v = vehicles.get(r.vehicle_id);
      failures.push({
        replacementId: r.replacement_id,
        roId: r.ro_id,
        vehicleId: r.vehicle_id,
        vin: v?.vin ?? r.vehicle_id,
        modelId: v?.model_id,
        partId: r.part_id,
        supplierId: r.supplier_id,
        life: Math.max(1, life),
        odometer: odo,
        date: r.date_id,
        ageMonths: num(r.vehicle_age_days) / 30.4375,
        mode: r.failure_mode,
        visitType: r.visit_type,
        predicted: Boolean(r.was_predicted),
        inWarranty: Boolean(r.in_warranty),
        cost: num(r.part_cost_inr),
        downtime: downtimeByRo.get(r.ro_id) ?? null,
        dtcEventId: r.dtc_event_id,
        repeat,
      });
      prev = r;
    }
    lastByPair.set(key, prev);
  }

  const suspensions = [];
  for (const v of raw.vehicles) {
    const parts = applicable.get(v.model_id);
    if (!parts) continue;
    const odo = odoByVehicle.get(v.vehicle_id) ?? 0;
    for (const partId of parts) {
      const last = lastByPair.get(`${v.vehicle_id}|${partId}`);
      const life = odo - (last ? num(last.odometer_km_at_failure) : 0);
      if (life <= 0) continue;
      suspensions.push({ vehicleId: v.vehicle_id, modelId: v.model_id, partId, supplierId: last?.supplier_id ?? null, life });
    }
  }

  return { failures, suspensions, partsById, suppliersById, supplierShare, odoByVehicle, vehicles };
}

/** Life-table items of one part, optionally restricted to a group (supplier / model / application). */
function itemsFor(lt, partId, group) {
  const share = lt.supplierShare.get(partId) ?? new Map();
  const items = [];
  for (const f of lt.failures) {
    if (f.partId !== partId) continue;
    if (group && !groupMatch(lt, group, f)) continue;
    items.push({ t: f.life, failed: true, w: 1 });
  }
  for (const s of lt.suspensions) {
    if (s.partId !== partId) continue;
    let w = 1;
    if (group?.type === "supplier") {
      // unknown original supplier (factory-fitted part never replaced): split by sourcing share
      w = s.supplierId ? (s.supplierId === group.id ? 1 : 0) : share.get(group.id) ?? 0;
    } else if (group && !groupMatch(lt, group, s)) continue;
    if (w > 0) items.push({ t: s.life, failed: false, w });
  }
  return items;
}

function groupMatch(lt, group, item) {
  if (group.type === "supplier") return item.supplierId === group.id;
  if (group.type === "model") return item.modelId === group.id;
  if (group.type === "application") return lt.vehicles.get(item.vehicleId)?.application_id === group.id;
  return true;
}

// ---------------------------------------------------------------------------
// Kaplan–Meier and Weibull
// ---------------------------------------------------------------------------
/** Weighted Kaplan–Meier with a Greenwood 90 % band. Failures precede suspensions at tied times. */
export function kaplanMeier(items) {
  const sorted = [...items].sort((a, b) => a.t - b.t || (a.failed === b.failed ? 0 : a.failed ? -1 : 1));
  let atRisk = sorted.reduce((s, i) => s + i.w, 0);
  let S = 1;
  let varSum = 0;
  const steps = [{ t: 0, S: 1, lo: 1, hi: 1 }];
  const points = []; // plotting positions at each failure time
  let i = 0;
  while (i < sorted.length) {
    const t = sorted[i].t;
    let d = 0;
    let c = 0;
    let count = 0;
    while (i < sorted.length && sorted[i].t === t) {
      if (sorted[i].failed) {
        d += sorted[i].w;
        count += 1;
      } else c += sorted[i].w;
      i += 1;
    }
    if (d > 0 && atRisk > 0) {
      const before = S;
      S *= 1 - d / atRisk;
      if (atRisk - d > 0) varSum += d / (atRisk * (atRisk - d));
      const se = S * Math.sqrt(varSum);
      steps.push({ t, S, lo: Math.max(0, S - Z90 * se), hi: Math.min(1, S + Z90 * se) });
      points.push({ t, F: 1 - (before + S) / 2, count });
    }
    atRisk -= d + c;
  }
  const failures = items.filter((x) => x.failed).length;
  const kmB10 = steps.find((s) => s.S <= B10_TARGET)?.t ?? null;
  return { steps, points, failures, kmB10 };
}

/** S(t) of a KM step list. */
function survivalAt(steps, t) {
  let s = steps[0];
  for (const step of steps) {
    if (step.t > t) break;
    s = step;
  }
  return s;
}

/** Weibull rank regression (y on x) on KM plotting positions. */
export function weibullFit(points, failures) {
  const usable = points.filter((p) => p.F > 0 && p.F < 1 && p.t > 0);
  if (failures < MIN_WEIBULL_FAILURES || usable.length < 3) return null;
  const xs = usable.map((p) => Math.log(p.t));
  const ys = usable.map((p) => Math.log(-Math.log(1 - p.F)));
  const n = xs.length;
  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = ys.reduce((s, v) => s + v, 0) / n;
  const sxx = xs.reduce((s, v) => s + (v - mx) ** 2, 0);
  if (sxx === 0) return null;
  const beta = xs.reduce((s, v, k) => s + (v - mx) * (ys[k] - my), 0) / sxx;
  if (!(beta > 0)) return null;
  const intercept = my - beta * mx;
  const eta = Math.exp(-intercept / beta);
  const syy = ys.reduce((s, v) => s + (v - my) ** 2, 0);
  const r2 = syy > 0 ? (beta * beta * sxx) / syy : null;
  return { beta, eta, b10: eta * Math.pow(-Math.log(B10_TARGET), 1 / beta), r2 };
}

/** Everything the UI needs for one life-table group. */
function analyze(items, designKm) {
  const km = kaplanMeier(items);
  const fit = weibullFit(km.points, km.failures);
  const fieldB10 = km.kmB10 ?? fit?.b10 ?? null;
  const exposure = items.reduce((s, i) => s + i.t * i.w, 0);
  const variancePct = fieldB10 !== null && designKm ? (fieldB10 / designKm - 1) * 100 : null;
  return {
    km,
    fit,
    failures: km.failures,
    suspensions: items.filter((i) => !i.failed).reduce((s, i) => s + i.w, 0),
    fieldB10,
    extrapolated: km.kmB10 === null && fit !== null,
    exposure,
    ratePer100k: exposure > 0 ? (km.failures / exposure) * 1e5 : null,
    mtbf: km.failures > 0 ? exposure / km.failures : null,
    variancePct,
    status: hazardStatus(variancePct, km.failures),
  };
}

// ---------------------------------------------------------------------------
// Part and supplier summaries
// ---------------------------------------------------------------------------
export function partSummaries(lt) {
  const byPart = new Map();
  for (const f of lt.failures) {
    const list = byPart.get(f.partId) ?? [];
    list.push(f);
    byPart.set(f.partId, list);
  }
  const out = [];
  for (const [partId, fails] of byPart) {
    const part = lt.partsById.get(partId);
    const designKm = designB10Km(part);
    const all = analyze(itemsFor(lt, partId, null), designKm);
    const suppliers = [...new Set(fails.map((f) => f.supplierId))].map((supplierId) => {
      const s = lt.suppliersById.get(supplierId);
      return {
        supplierId,
        supplierName: s?.supplier_name ?? supplierId,
        riskTier: s?.risk_tier ?? null,
        ...analyze(itemsFor(lt, partId, { type: "supplier", id: supplierId }), designKm),
      };
    });
    const downtimes = fails.map((f) => f.downtime).filter((v) => v !== null && v !== undefined);
    out.push({
      partId,
      partName: part?.part_name ?? partId,
      partType: part?.part_type,
      subsystem: part?.vehicle_subsystem,
      designKm,
      ...all,
      beta: all.fit?.beta ?? null,
      eta: all.fit?.eta ?? null,
      pattern: patternLabel(all.fit?.beta),
      predictedPct: (fails.filter((f) => f.predicted).length / fails.length) * 100,
      repeatPct: (fails.filter((f) => f.repeat).length / fails.length) * 100,
      meanDowntime: mean(downtimes),
      meanCost: mean(fails.map((f) => f.cost)),
      suppliers: suppliers.sort((a, b) => b.failures - a.failures),
    });
  }
  return out.sort((a, b) => b.failures - a.failures);
}

export function reliabilityKpis(lt, summaries) {
  const rated = summaries.filter((s) => s.status !== "Insufficient Data");
  let worst = null;
  for (const p of summaries) {
    for (const s of p.suppliers) {
      if (s.failures < MIN_GROUP_FAILURES || s.variancePct === null) continue;
      if (!worst || s.variancePct < worst.variancePct) worst = { ...s, partName: p.partName, partId: p.partId };
    }
  }
  const fails = lt.failures;
  const fleetKm = [...lt.odoByVehicle.values()].reduce((s, v) => s + v, 0);
  const downtimes = fails.map((f) => f.downtime).filter((v) => v !== null && v !== undefined);
  return {
    partsBelowDesign: rated.filter((s) => s.variancePct < 0).length,
    partsRated: rated.length,
    worst,
    fleetMtbf: fails.length ? fleetKm / fails.length : null,
    failures: fails.length,
    predictedPct: fails.length ? (fails.filter((f) => f.predicted).length / fails.length) * 100 : null,
    meanDowntime: mean(downtimes),
    repeatPct: fails.length ? (fails.filter((f) => f.repeat).length / fails.length) * 100 : null,
    trucks: lt.vehicles.size,
  };
}

/** Parts with a Weibull fit, for the β × η failure-pattern map. */
export function failurePatternMap(summaries) {
  return summaries
    .filter((s) => s.fit)
    .map((s) => ({ partId: s.partId, label: s.partName, x: s.eta, y: s.beta, z: s.failures, status: s.status, variancePct: s.variancePct, pattern: s.pattern }));
}

// ---------------------------------------------------------------------------
// Survival, hazard and Weibull plot data
// ---------------------------------------------------------------------------
export function groupOptions(lt, partId, type) {
  if (type === "all") return [{ type: "all", id: "all", label: "All suppliers" }];
  const ids = new Map();
  for (const f of lt.failures) {
    if (f.partId !== partId) continue;
    let id;
    let label;
    if (type === "supplier") {
      id = f.supplierId;
      label = lt.suppliersById.get(id)?.supplier_name ?? id;
    } else if (type === "model") {
      id = f.modelId;
      label = lt.vehicles.get(f.vehicleId)?.model_label ?? id;
    } else {
      const v = lt.vehicles.get(f.vehicleId);
      id = v?.application_id;
      label = v?.application_name ?? id;
    }
    const g = ids.get(id) ?? { type, id, label, failures: 0 };
    g.failures += 1;
    ids.set(id, g);
  }
  return [...ids.values()].filter((g) => g.failures >= MIN_GROUP_FAILURES).sort((a, b) => b.failures - a.failures).slice(0, 5);
}

/** KM curves on a common km grid (step function), one per group; band only for a single group. */
export function survivalCurves(lt, partId, groupType) {
  const groups = groupOptions(lt, partId, groupType).map((g, i) => {
    const items = itemsFor(lt, partId, g.type === "all" ? null : g);
    return { ...g, color: GROUP_PALETTE[i % GROUP_PALETTE.length], km: kaplanMeier(items), n: items.length };
  });
  if (groups.length === 0) return { rows: [], groups: [] };
  const allT = groups.flatMap((g) => g.km.steps.map((s) => s.t));
  const maxT = Math.max(...allT, 1);
  const STEPS = 80;
  const rows = Array.from({ length: STEPS + 1 }, (_, k) => {
    const t = (maxT * k) / STEPS;
    const row = { km: Math.round(t) };
    for (const g of groups) {
      const s = survivalAt(g.km.steps, t);
      row[g.label] = Number((s.S * 100).toFixed(2));
      if (groups.length === 1) row.band = [Number((s.lo * 100).toFixed(2)), Number((s.hi * 100).toFixed(2))];
    }
    return row;
  });
  return { rows, groups };
}

/** Actuarial hazard per km bucket: failures per 1,000 units at risk per bucket. */
export function hazardByBucket(lt, partId) {
  const items = itemsFor(lt, partId, null);
  if (items.length === 0) return [];
  const maxT = Math.max(...items.map((i) => i.t));
  const out = [];
  for (let start = 0; start < maxT; start += HAZARD_BUCKET_KM) {
    const end = start + HAZARD_BUCKET_KM;
    let atRisk = 0;
    let d = 0;
    let c = 0;
    for (const i of items) {
      if (i.t < start) continue;
      atRisk += i.w;
      if (i.t < end) {
        if (i.failed) d += i.w;
        else c += i.w;
      }
    }
    if (atRisk < MIN_GROUP_TRUCKS) break;
    const units = atRisk - c / 2;
    out.push({ label: `${start / 1000}–${end / 1000}k`, start, rate: units > 0 ? Number(((d / units) * 1000).toFixed(1)) : 0, failures: d, atRisk: Math.round(atRisk) });
  }
  return out;
}

/** Linearised Weibull plot: points and fit line per group (All + suppliers with ≥ 5 failures). */
export function weibullPlot(lt, partId) {
  const groups = [{ type: "all", id: "all", label: "All suppliers" }, ...groupOptions(lt, partId, "supplier")];
  const out = groups.map((g, i) => {
    const km = kaplanMeier(itemsFor(lt, partId, g.type === "all" ? null : g));
    const fit = weibullFit(km.points, km.failures);
    const points = km.points
      .filter((p) => p.F > 0 && p.F < 1)
      .map((p) => ({ x: Math.log(p.t), y: Math.log(-Math.log(1 - p.F)), km: p.t, F: p.F * 100 }));
    let line = [];
    if (fit && points.length) {
      const xs = points.map((p) => p.x);
      const x0 = Math.min(...xs) - 0.2;
      const x1 = Math.max(...xs) + 0.2;
      line = [x0, x1].map((x) => ({ x, y: fit.beta * (x - Math.log(fit.eta)) }));
    }
    return { ...g, color: i === 0 ? "#0f172a" : GROUP_PALETTE[(i - 1) % GROUP_PALETTE.length], points, line, fit, failures: km.failures };
  });
  return out.filter((g) => g.points.length > 0);
}

export const WEIBULL_F_TICKS = [1, 2, 5, 10, 20, 50, 80, 95, 99];
export function weibullY(Fpct) {
  return Math.log(-Math.log(1 - Fpct / 100));
}

// ---------------------------------------------------------------------------
// Supplier & build quality
// ---------------------------------------------------------------------------
export function supplierScorecard(summaries, limit = 15) {
  const rows = [];
  for (const p of summaries) {
    if (!p.designKm) continue;
    for (const s of p.suppliers) {
      if (s.failures < MIN_GROUP_FAILURES || s.fieldB10 === null) continue;
      rows.push({
        key: `${p.partId}|${s.supplierId}`,
        partId: p.partId,
        label: `${p.partName} · ${s.supplierName}`,
        partName: p.partName,
        supplierName: s.supplierName,
        riskTier: s.riskTier,
        pctOfDesign: (s.fieldB10 / p.designKm) * 100,
        fieldB10: s.fieldB10,
        extrapolated: s.extrapolated,
        failures: s.failures,
        status: s.status,
      });
    }
  }
  return rows.sort((a, b) => a.pctOfDesign - b.pctOfDesign).slice(0, limit);
}

/**
 * Supplier risk tier summary: median field B10 as % of design across the tier's
 * part × supplier groups with at least 5 failures (same groups as the scorecard).
 */
export function riskTierSummary(summaries) {
  const tiers = new Map();
  for (const p of summaries) {
    if (!p.designKm) continue;
    for (const s of p.suppliers) {
      if (s.failures < MIN_GROUP_FAILURES || s.fieldB10 === null || !s.riskTier) continue;
      const t = tiers.get(s.riskTier) ?? { tier: s.riskTier, pcts: [], failures: 0 };
      t.pcts.push((s.fieldB10 / p.designKm) * 100);
      t.failures += s.failures;
      tiers.set(s.riskTier, t);
    }
  }
  return ["High", "Medium", "Low"]
    .filter((tier) => tiers.has(tier))
    .map((tier) => {
      const t = tiers.get(tier);
      const sorted = [...t.pcts].sort((x, y) => x - y);
      const mid = sorted.length / 2;
      const median = sorted.length % 2 ? sorted[Math.floor(mid)] : (sorted[mid - 1] + sorted[mid]) / 2;
      return { tier, median: Number(median.toFixed(1)), groups: sorted.length, failures: t.failures, color: RISK_TIER_COLORS[tier] };
    });
}

/** Build-quarter × age-at-failure matrix: failures per 100 trucks of the cohort that reached that age. */
export function cohortMatrix(lt, latestDate) {
  const cohorts = new Map();
  for (const v of lt.vehicles.values()) {
    const q = quarterOf(v.production_date);
    if (!q) continue;
    const c = cohorts.get(q) ?? { id: q, label: q, trucks: [], ages: [] };
    c.trucks.push(v.vehicle_id);
    c.ages.push(latestDate && v.in_service_date ? daysBetween(v.in_service_date, latestDate) / 30.4375 : 0);
    cohorts.set(q, c);
  }
  const counts = new Map();
  for (const f of lt.failures) {
    const q = quarterOf(lt.vehicles.get(f.vehicleId)?.production_date);
    const bucket = AGE_BUCKETS.find((b) => f.ageMonths >= b.min && f.ageMonths < b.max);
    if (!q || !bucket) continue;
    const key = `${q}|${bucket.id}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const rows = [...cohorts.values()].sort((a, b) => a.id.localeCompare(b.id));
  const cells = new Map();
  let max = 0;
  for (const r of rows) {
    for (const b of AGE_BUCKETS) {
      const exposed = r.ages.filter((a) => a >= b.min).length;
      const count = counts.get(`${r.id}|${b.id}`) ?? 0;
      const per100 = exposed ? (count / exposed) * 100 : 0;
      const muted = exposed < MIN_GROUP_TRUCKS;
      if (!muted) max = Math.max(max, per100);
      cells.set(`${r.id}|${b.id}`, { count, exposed, per100, muted });
    }
  }
  return { rows: rows.map((r) => ({ id: r.id, label: r.label, trucks: r.trucks.length })), cols: AGE_BUCKETS, cells, max };
}

/** Top parts × application / region / model: failures per 100k km of part exposure. */
export function whereFails(lt, summaries, dim, topParts = 12) {
  const keyOf = (vehicleId) => {
    const v = lt.vehicles.get(vehicleId);
    if (!v) return null;
    if (dim === "region") return { id: v.region_id, label: v.region_name };
    if (dim === "model") return { id: v.model_id, label: v.model_label };
    return { id: v.application_id, label: v.application_name };
  };
  const cols = new Map();
  for (const v of lt.vehicles.values()) {
    const k = keyOf(v.vehicle_id);
    const c = cols.get(k.id) ?? { ...k, trucks: 0 };
    c.trucks += 1;
    cols.set(k.id, c);
  }
  const parts = summaries.slice(0, topParts);
  const cells = new Map();
  const acc = (key, field, value) => {
    const c = cells.get(key) ?? { failures: 0, exposure: 0, trucks: new Set() };
    c[field] += value;
    cells.set(key, c);
    return c;
  };
  const partIds = new Set(parts.map((p) => p.partId));
  for (const f of lt.failures) {
    if (!partIds.has(f.partId)) continue;
    const k = keyOf(f.vehicleId);
    const c = acc(`${f.partId}|${k.id}`, "failures", 1);
    c.exposure += f.life;
    c.trucks.add(f.vehicleId);
  }
  for (const s of lt.suspensions) {
    if (!partIds.has(s.partId)) continue;
    const k = keyOf(s.vehicleId);
    const c = acc(`${s.partId}|${k.id}`, "exposure", s.life);
    c.trucks.add(s.vehicleId);
  }
  let max = 0;
  const out = new Map();
  for (const p of parts) {
    for (const col of cols.values()) {
      const c = cells.get(`${p.partId}|${col.id}`);
      const trucks = c?.trucks.size ?? 0;
      const rate = c && c.exposure > 0 ? (c.failures / c.exposure) * 1e5 : null;
      const muted = trucks < MIN_GROUP_TRUCKS;
      if (!muted && rate !== null) max = Math.max(max, rate);
      out.set(`${p.partId}|${col.id}`, { rate, failures: c?.failures ?? 0, trucks, muted, empty: !c });
    }
  }
  return {
    rows: parts.map((p) => ({ id: p.partId, label: p.partName })),
    cols: [...cols.values()].sort((a, b) => a.label.localeCompare(b.label)),
    cells: out,
    max,
  };
}

// ---------------------------------------------------------------------------
// Root cause
// ---------------------------------------------------------------------------
/**
 * Main failure cause per part, for the most-replaced parts. Each row: failures, the most common
 * `failure_mode` and its share, the next one, and every mode (for the tooltip). `clear` = the main
 * mode is at least CLEAR_CAUSE_SHARE % of the failures, on a sample of MIN_GROUP_FAILURES or more.
 */
export function mainCauses(lt, summaries, topParts = MAIN_CAUSE_PARTS) {
  const parts = summaries.slice(0, topParts);
  const rows = parts.map((p) => {
    const counts = new Map();
    let total = 0;
    for (const f of lt.failures) {
      if (f.partId !== p.partId) continue;
      const m = f.mode ?? "Unknown";
      counts.set(m, (counts.get(m) ?? 0) + 1);
      total += 1;
    }
    const modes = [...counts.entries()]
      .map(([mode, count]) => ({ mode, count, share: total > 0 ? (count / total) * 100 : 0 }))
      .sort((a, b) => b.count - a.count || a.mode.localeCompare(b.mode));
    const main = modes[0] ?? null;
    return {
      partId: p.partId,
      partName: p.partName,
      failures: total,
      main,
      second: modes[1] ?? null,
      modes,
      clear: Boolean(main) && Math.round(main.share) >= CLEAR_CAUSE_SHARE && total >= MIN_GROUP_FAILURES, // judged on the rounded share that is displayed
    };
  });
  return { rows, max: Math.max(1, ...rows.map((r) => r.failures)), clearCount: rows.filter((r) => r.clear).length };
}

/**
 * Precursor ramp per part × signal: mean |z| in the 7 days before failure ÷ mean |z| 21–30 days
 * before, over the failures inside the telemetry window. A ramp > 1 means the signal drifted
 * towards the failure.
 */
export function precursorMatrix(raw, lt) {
  const partNames = new Map([...lt.partsById].map(([id, p]) => [id, p.part_name]));
  const cells = new Map();
  const signals = new Set();
  for (const r of raw.precursor) {
    if (r.early_mean_abs_z === null || r.late_mean_abs_z === null) continue;
    signals.add(r.signal_code);
    const key = `${r.part_id}|${r.signal_code}`;
    const c = cells.get(key) ?? { early: [], late: [], replacements: new Set() };
    c.early.push(Number(r.early_mean_abs_z));
    c.late.push(Number(r.late_mean_abs_z));
    c.replacements.add(r.replacement_id);
    cells.set(key, c);
  }
  const failuresByPart = new Map();
  for (const [key, c] of cells) {
    const partId = key.split("|")[0];
    failuresByPart.set(partId, Math.max(failuresByPart.get(partId) ?? 0, c.replacements.size));
  }
  const rows = [...failuresByPart.entries()]
    .filter(([, n]) => n >= MIN_PRECURSOR_FAILURES)
    .sort((a, b) => b[1] - a[1])
    .map(([id, n]) => ({ id, label: partNames.get(id) ?? id, failures: n }));
  const cols = [...signals].sort().map((s) => ({ id: s, label: s }));
  let max = 0;
  const out = new Map();
  for (const r of rows) {
    for (const col of cols) {
      const c = cells.get(`${r.id}|${col.id}`);
      if (!c || c.replacements.size < MIN_PRECURSOR_FAILURES) {
        out.set(`${r.id}|${col.id}`, { empty: true });
        continue;
      }
      const early = mean(c.early);
      const late = mean(c.late);
      const ramp = early > 0 ? late / early : null;
      if (ramp !== null) max = Math.max(max, ramp - 1);
      out.set(`${r.id}|${col.id}`, { ramp, early, late, n: c.replacements.size });
    }
  }
  return { rows, cols, cells: out, max };
}

/** Fault-catalog likelihood vs the observed share of resolved codes whose repair replaced the part. */
export function dtcConfirmation(raw, lt) {
  const partsByRo = new Map();
  for (const f of lt.failures) {
    const set = partsByRo.get(f.roId) ?? new Set();
    set.add(f.partId);
    partsByRo.set(f.roId, set);
  }
  const eventsByCode = new Map();
  for (const e of raw.dtcEvents) {
    if (!e.resolved_by_ro_id) continue;
    const list = eventsByCode.get(e.dtc_id) ?? [];
    list.push(e);
    eventsByCode.set(e.dtc_id, list);
  }
  return raw.bridge
    .map((b) => {
      const events = eventsByCode.get(b.dtc_id) ?? [];
      const hits = events.filter((e) => partsByRo.get(e.resolved_by_ro_id)?.has(b.part_id)).length;
      const observed = events.length ? (hits / events.length) * 100 : null;
      const d = events[0]?.dim_dtc;
      return {
        key: `${b.dtc_id}|${b.part_id}`,
        dtcId: b.dtc_id,
        dtcLabel: d ? `${d.spn_description} · FMI ${d.fmi}` : b.dtc_id,
        partId: b.part_id,
        partName: lt.partsById.get(b.part_id)?.part_name ?? b.part_id,
        likelihood: num(b.likelihood) * 100,
        observed,
        gap: observed !== null ? observed - num(b.likelihood) * 100 : null,
        resolved: events.length,
        hits,
      };
    })
    .filter((r) => r.resolved > 0)
    .sort((a, b) => b.resolved - a.resolved || a.dtcId.localeCompare(b.dtcId));
}

/** Days-before-failure signature: mean |z| per signal from 30 days before to the failure day. */
export function precursorSignature(rows, topSignals = 4) {
  const bySignal = new Map();
  for (const r of rows) {
    const s = bySignal.get(r.signal_code) ?? new Map();
    const d = s.get(r.days_before) ?? [];
    d.push(Number(r.mean_abs_z));
    s.set(r.days_before, d);
    bySignal.set(r.signal_code, s);
  }
  const ramps = [...bySignal.entries()].map(([signal, days]) => {
    const window = (lo, hi) => mean([...days.entries()].filter(([d]) => d >= lo && d <= hi).flatMap(([, v]) => v));
    const early = window(21, 30);
    const late = window(1, 7);
    return { signal, ramp: early > 0 && late !== null ? late / early : null, late };
  });
  const top = ramps.filter((r) => r.ramp !== null).sort((a, b) => b.ramp - a.ramp).slice(0, topSignals);
  const failures = new Set(rows.map((r) => r.replacement_id)).size;
  const data = [];
  for (let d = 30; d >= 1; d -= 1) {
    const row = { day: -d };
    for (const t of top) {
      const vals = bySignal.get(t.signal)?.get(d);
      row[t.signal] = vals?.length ? Number(mean(vals).toFixed(2)) : null;
    }
    data.push(row);
  }
  return { data, signals: top, failures };
}

export function partFailureRows(lt, partId) {
  return lt.failures
    .filter((f) => f.partId === partId)
    .map((f) => ({ ...f, supplierName: lt.suppliersById.get(f.supplierId)?.supplier_name ?? f.supplierId, modelLabel: lt.vehicles.get(f.vehicleId)?.model_label }))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

export function modeCounts(lt, partId) {
  const counts = new Map();
  for (const f of lt.failures) if (f.partId === partId) counts.set(f.mode ?? "Unknown", (counts.get(f.mode ?? "Unknown") ?? 0) + 1);
  return [...counts.entries()].map(([mode, count]) => ({ mode, count })).sort((a, b) => b.count - a.count);
}
