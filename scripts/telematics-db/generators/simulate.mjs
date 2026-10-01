// Day-by-day state machine per connected truck. Produces trips, 5-min status snapshots,
// harsh/ADAS events, DTC lifecycles, BEV charging, health-signal readings, weekly
// component-health predictions and daily rollups — all mutually consistent.

import {
  DIESEL_CO2_KG_PER_L,
  DTC_PART_MAP,
  HARSH_EVENT_TYPES,
  HEALTH_SIGNALS,
  MONITORED_PARTS,
  NUISANCE_WEIGHTS,
  SAFETY_SCALE,
  SCENARIOS,
  SPEED_GOVERNOR_KMH,
} from "../reference/catalog.mjs";
import { clamp, round } from "../lib/rng.mjs";
import {
  CITY_COORDS,
  REGION_CITIES,
  REGION_CLIMATE,
  ROAD_FACTOR,
  bearingDeg,
  clampToIndia,
  destinationPoint,
  haversineKm,
  interpolate,
  roadKm,
} from "../lib/geo.mjs";
import { DAY_MS, HOUR_MS, MINUTE_MS, addDays, dateIdIst, isoIst, istMidnightMs, weekday } from "../lib/time.mjs";
import {
  conditionalFailureProbability,
  createRepair,
  initPartLives,
  medianResidualKm,
  randomFailureMode,
  renewPart,
  simulateHistory,
} from "./service.mjs";

const PART_SIGNAL = {
  PART009: "SCR_EFFICIENCY",
  PART050: "COOLANT_TEMP",
  PART010: "DPF_SOOT_LOAD",
  PART037: "BATTERY_VOLTAGE",
  PART006: "FUEL_RAIL_PRESSURE",
  PART005: "BOOST_PRESSURE",
  PART030: "BRAKE_LINING_REMAINING",
  PART031: "AIR_PRESSURE",
  PART044: "HV_BATTERY_TEMP",
};
const BRAKE_PART = "PART030";
const BRAKE_DTC = "SPN1099-FMI18";
const SNAPSHOT_STEP_MS = 5 * MINUTE_MS;
const MODEL_VERSION = "fp-gbm-2026.09";
const SEVERITY_RANK = { critical: 3, major: 2, minor: 1 };

function nearestCity(point) {
  let best = null;
  let bestD = Infinity;
  for (const [name, c] of Object.entries(CITY_COORDS)) {
    const d = haversineKm(point, c);
    if (d < bestD) [best, bestD] = [name, d];
  }
  return best;
}

function riskBand(p) {
  if (p > 0.7) return "Critical";
  if (p >= 0.4) return "High";
  if (p >= 0.2) return "Medium";
  return "Low";
}

function prescriptiveAction(band, partName) {
  switch (band) {
    case "Critical":
      return `Immediate Service: replace ${partName} – book workshop within 48 h`;
    case "High":
      return `Plan workshop visit within 7 days: inspect ${partName}`;
    case "Medium":
      return `Monitor: re-check ${partName} at next scheduled service`;
    default:
      return "No action required";
  }
}

// Reverse lookup: part → most likely non-nuisance DTC (used for background failures)
function buildPartToCode(dtcsById) {
  const map = new Map();
  for (const [code, links] of Object.entries(DTC_PART_MAP)) {
    const dtc = dtcsById.get(code);
    if (!dtc || dtc.nuisance) continue;
    for (const [partId, likelihood] of links) {
      const current = map.get(partId);
      if (!current || likelihood > current.likelihood) map.set(partId, { code, likelihood });
    }
  }
  return map;
}

// ---------------------------------------------------------------------------
// Fault-scenario planning
// ---------------------------------------------------------------------------
function planScenarios(v, rng, days, dtcsById) {
  if (!rng.chance(0.25)) return [];
  const count = rng.chance(0.15) ? 2 : 1;
  const candidates = Object.entries(SCENARIOS).filter(
    ([, s]) => s.powertrain === "all" || s.powertrain === v.spec.powertrain
  );
  const chosen = [];
  for (let i = 0; i < count; i++) {
    const pool = candidates.filter(([k]) => !chosen.some((c) => c.key === k));
    if (!pool.length) break;
    const key = rng.weighted(pool.map(([k, s]) => [k, s.weight * (s.app_multiplier?.[v.application_id] ?? 1)]));
    const def = SCENARIOS[key];
    const L = rng.int(12, 40);
    const onset = rng.int(-Math.floor(L * 0.5), days - 4);
    const codes = def.codes.map(([code, at]) => ({ code, day: onset + at * L }));
    const derateCode = codes.find((c) => dtcsById.get(c.code).can_derate);
    const redCode = codes.find((c) => dtcsById.get(c.code).default_lamp === "RSL" || dtcsById.get(c.code).default_lamp === "PL");
    const failDay = Math.floor(onset + L);
    const detectP = v.spec.telematics_source === "Fleetboard" ? 0.72 : 0.5;
    let outcome = "breakdown";
    let detectDay = null;
    let repairDay = null;
    if (rng.chance(detectP)) {
      detectDay = Math.floor(onset + rng.uniform(0.5, 0.7) * L);
      repairDay = detectDay + rng.int(1, 4);
      if (repairDay < failDay) outcome = "predicted";
    }
    chosen.push({
      key,
      def,
      onset,
      L,
      codes,
      derateDay: derateCode ? derateCode.day : null,
      redDay: redCode ? redCode.day : null,
      failDay,
      detectDay: outcome === "predicted" ? detectDay : null,
      repairDay: outcome === "predicted" ? repairDay : null,
      outcome,
      resolved: false,
      events: [],
    });
  }
  return chosen;
}

const scenarioEndDay = (s) => (s.outcome === "predicted" ? s.repairDay : s.failDay);
const scenarioStage = (s, d) => clamp((d + 0.5 - s.onset) / s.L, 0, 1);
const scenarioActive = (s, d) => !s.resolved && d >= s.onset && d <= scenarioEndDay(s);

// ---------------------------------------------------------------------------
// Signal model
// ---------------------------------------------------------------------------
function baseSignal(code, v, st, env, rng) {
  switch (code) {
    case "COOLANT_TEMP":
      return 88 + 0.12 * (env.ambient - 30) + 3 * env.load + rng.normal(0, 1.4);
    case "OIL_PRESSURE":
      return 385 - (v.ageDaysAtStart / 365) * 6 + rng.normal(0, 22);
    case "BATTERY_VOLTAGE":
      return 27.9 + rng.normal(0, 0.15);
    case "DPF_SOOT_LOAD":
      return clamp(st.soot + rng.normal(0, 2), 0, 130);
    case "DPF_DIFF_PRESSURE":
      return 2 + st.soot * 0.09 + rng.normal(0, 0.45);
    case "SCR_EFFICIENCY":
      return clamp(95 + rng.normal(0, 1.2), 80, 99.5);
    case "BOOST_PRESSURE":
      return 175 + 70 * env.load + rng.normal(0, 8);
    case "FUEL_RAIL_PRESSURE":
      return 175 + rng.normal(0, 6);
    case "AIR_PRESSURE":
      return 830 + rng.normal(0, 18);
    case "BRAKE_LINING_REMAINING":
      return clamp(st.brakeRemaining + rng.normal(0, 0.6), 0, 100);
    case "TYRE_PRESSURE":
      return 815 + rng.normal(0, 12) - (st.tyreLeakDays > 0 ? rng.uniform(70, 180) : 0);
    case "HV_SOH":
      return st.sohBase + rng.normal(0, 0.2);
    case "HV_BATTERY_TEMP":
      return 27 + 0.45 * (env.ambient - 25) + 6 * env.load + rng.normal(0, 1.5);
    default:
      return null;
  }
}

function signalValue(code, v, st, env, rng) {
  let value = baseSignal(code, v, st, env, rng);
  for (const s of env.scenarios) {
    const target = s.def.drift[code];
    if (target === undefined) continue;
    const stage = env.stageOf(s);
    value = value + (target - value) * Math.pow(stage, 1.6);
    if (s.def.erratic) value += rng.normal(0, 18 * stage);
  }
  return value;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
export function simulateFleet(ctx) {
  const out = {
    trips: [],
    status: [],
    harsh: [],
    dtcEvents: [],
    charging: [],
    telemetry: [],
    health: [],
    daily: [],
  };
  const partToCode = buildPartToCode(ctx.dtcsById);
  for (const v of ctx.fleet) simulateVehicle(v, ctx, out, partToCode);
  return out;
}

function simulateVehicle(v, ctx, out, partToCode) {
  const { windowStart, days, snapshotDays, readingsPerDay, service, signalsByCode, dtcsById, partsById, nextId } = ctx;
  const rng = v.rng.fork("sim");
  const windowStartMs = istMidnightMs(windowStart);
  const bev = v.spec.powertrain === "bev";

  const lives = initPartLives({ vehicle: v, parts: ctx.parts, suppliersById: ctx.suppliersById, suppliers: ctx.suppliers });
  const scenarios = planScenarios(v, rng, days, dtcsById);
  v.scenarios = scenarios;
  simulateHistory(service, {
    vehicle: v,
    lives,
    windowStartMs,
    skipParts: new Set(scenarios.map((s) => s.def.part_id)),
  });

  // Continuous state
  const st = {
    odo: v.odometerStart,
    engineHours: v.odometerStart * v.hoursPerKm,
    totalFuel: bev ? null : v.odometerStart * (v.spec.base_consumption / 100) * 1.05,
    energyTotal: bev ? v.odometerStart * (v.spec.base_consumption / 100) : null,
    regenTotal: bev ? v.odometerStart * (v.spec.base_consumption / 100) * 0.14 : null,
    fuelLevel: bev ? null : rng.uniform(40, 95),
    adblueLevel: bev ? null : rng.uniform(40, 95),
    soc: bev ? rng.uniform(60, 95) : null,
    sohBase: bev ? 100 - (v.ageDaysAtStart / 365) * 2 - rng.uniform(0, 1.5) : null,
    soot: bev ? 0 : rng.uniform(10, 60),
    brakeRemaining: 100,
    tyreLeakDays: 0,
    pos: v.home,
    busyUntilMs: 0, // end of the last trip / charging session (trips can run past midnight)
  };
  const brakeLife = lives.get(BRAKE_PART);
  const updateBrake = () => {
    const span = Math.max(1, brakeLife.nextFailKm - brakeLife.lastReplaceKm);
    st.brakeRemaining = clamp(100 - 92 * ((st.odo - brakeLife.lastReplaceKm) / span), 0, 100);
  };
  updateBrake();

  const schedule = new Map(); // day → [job]
  const addJob = (day, job) => {
    if (!schedule.has(day)) schedule.set(day, []);
    schedule.get(day).push(job);
  };
  const workshopDays = new Set();
  const markWorkshop = (fromMs, toMs) => {
    for (let t = fromMs; t <= toMs; t += DAY_MS) {
      const d = Math.floor((t - windowStartMs) / DAY_MS);
      if (d >= 0 && d < days) workshopDays.add(d);
    }
  };
  const openDtcs = []; // { row, scenario?, part_id, kind }
  const brake = { dtc: null, pending: false };
  const pendingParts = new Set();

  for (const s of scenarios) if (s.outcome === "predicted" && s.repairDay >= 0 && s.repairDay < days) addJob(s.repairDay, { type: "scenario", scenario: s });

  // --- helpers -------------------------------------------------------------
  const freezeFrame = (env, extra = {}) => ({
    engine_rpm: bev ? null : Math.round(rng.uniform(1100, 1600)),
    engine_load_pct: round(rng.uniform(40, 85), 0),
    wheel_speed_kmh: round(rng.uniform(25, 70), 0),
    coolant_temp_c: bev ? null : round(signalValue("COOLANT_TEMP", v, st, env, rng), 1),
    battery_voltage_v: round(signalValue("BATTERY_VOLTAGE", v, st, env, rng), 1),
    ambient_temp_c: round(env.ambient, 1),
    ...extra,
  });

  const emitDtc = ({ code, ms, trip, driverId, env, meta }) => {
    const dtc = dtcsById.get(code);
    const signal = meta.scenario ? Object.keys(meta.scenario.def.drift)[0] : PART_SIGNAL[meta.part_id];
    const extra = signal && env ? { [signal.toLowerCase()]: round(signalValue(signal, v, st, env, rng), 1) } : {};
    const row = {
      dtc_event_id: nextId("DTE", 7),
      vehicle_id: v.vehicle_id,
      dtc_id: code,
      driver_id: driverId ?? v.primaryDriver.driver_id,
      trip_id: trip?.trip_id ?? null,
      date_id: dateIdIst(ms),
      first_seen_ts: isoIst(ms),
      last_seen_ts: isoIst(ms),
      cleared_ts: null,
      status: meta.nuisance ? "previously_active" : "active",
      occurrence_count: 1,
      lamp_status: dtc.default_lamp,
      odometer_km_at_first: round(meta.odo ?? st.odo, 1),
      engine_hours_at_first: round(meta.engineHours ?? st.engineHours, 1),
      caused_derate: Boolean(meta.causedDerate),
      freeze_frame: env ? freezeFrame(env, extra) : null,
      resolved_by_ro_id: null,
    };
    out.dtcEvents.push(row);
    if (!meta.nuisance) openDtcs.push({ row, ...meta });
    return row;
  };

  const resolveDtcs = (predicate, roId, clearMs) => {
    for (let i = openDtcs.length - 1; i >= 0; i--) {
      const o = openDtcs[i];
      if (!predicate(o)) continue;
      o.row.status = "cleared";
      o.row.cleared_ts = isoIst(clearMs);
      o.row.resolved_by_ro_id = roId;
      if (Date.parse(o.row.last_seen_ts) > clearMs) o.row.last_seen_ts = isoIst(clearMs);
      openDtcs.splice(i, 1);
    }
  };

  // fromDay: first calendar day the truck is off the road (breakdowns: the day after)
  const openRepair = (job, openMs, fromDay) => {
    let result;
    if (job.type === "scenario") {
      const s = job.scenario;
      const codes = s.events.map((e) => e.dtc_id);
      result = createRepair(service, {
        vehicle: v,
        rng,
        openMs,
        visitType: s.outcome === "predicted" ? "predicted" : "breakdown",
        odometerKm: st.odo,
        engineHours: st.engineHours,
        dtcEventId: s.events[0]?.dtc_event_id ?? null,
        dtcCodes: codes,
        wasPredicted: s.outcome === "predicted",
        complaint: s.def.complaint,
        cluster: s.def.cluster,
        items: [
          {
            part_id: s.def.part_id,
            supplier_id: lives.get(s.def.part_id)?.supplierId ?? partsById.get(s.def.part_id).supplier_id,
            failure_mode: s.def.failure_mode,
            costFactor: s.def.part_cost_factor,
            laborHours: s.def.labor_hours,
            kmSinceReplace: st.odo - (lives.get(s.def.part_id)?.lastReplaceKm ?? 0),
          },
        ],
      });
      s.resolved = true;
      resolveDtcs((o) => o.scenario === s, result.ro_id, openMs);
      const life = lives.get(s.def.part_id);
      if (life) {
        life.lastReplaceKm = st.odo;
        life.nextFailKm = Infinity; // stays out of the background process inside the window
      }
    } else if (job.type === "brake") {
      result = createRepair(service, {
        vehicle: v,
        rng,
        openMs,
        visitType: job.visitType,
        odometerKm: st.odo,
        engineHours: st.engineHours,
        dtcEventId: brake.dtc?.dtc_event_id ?? null,
        dtcCodes: brake.dtc ? [BRAKE_DTC] : [],
        wasPredicted: job.visitType === "predicted",
        complaint: "Brake lining wear warning on cluster",
        cluster: "CLS-BRK",
        items: [
          {
            part_id: BRAKE_PART,
            supplier_id: brakeLife.supplierId,
            failure_mode: "End-of-life wear",
            kmSinceReplace: st.odo - brakeLife.lastReplaceKm,
          },
        ],
      });
      resolveDtcs((o) => o.kind === "brake", result.ro_id, openMs);
      renewPart(brakeLife, st.odo);
      brake.dtc = null;
      brake.pending = false;
      updateBrake();
    } else if (job.type === "background") {
      const life = job.life;
      result = createRepair(service, {
        vehicle: v,
        rng,
        openMs,
        visitType: job.visitType,
        odometerKm: st.odo,
        engineHours: st.engineHours,
        dtcEventId: job.dtc?.dtc_event_id ?? null,
        dtcCodes: job.dtc ? [job.dtc.dtc_id] : [],
        items: [
          {
            part_id: life.part.part_id,
            supplier_id: life.supplierId,
            failure_mode: randomFailureMode(rng, life.part),
            kmSinceReplace: st.odo - life.lastReplaceKm,
          },
        ],
      });
      if (job.dtc) resolveDtcs((o) => o.row === job.dtc, result.ro_id, openMs);
      renewPart(life, st.odo);
      pendingParts.delete(life.part.part_id);
    } else if (job.type === "planned") {
      result = createRepair(service, { vehicle: v, rng, openMs, visitType: "planned", odometerKm: st.odo, engineHours: st.engineHours });
    }
    const untilMs = result.stillOpen ? windowStartMs + days * DAY_MS : result.closeMs;
    st.busyUntilMs = Math.max(st.busyUntilMs, untilMs);
    markWorkshop(istMidnightMs(addDays(windowStart, fromDay)), untilMs);
    return result;
  };

  const healthRow = ({ part_id, ms, trigger, stageOf }) => {
    const part = partsById.get(part_id);
    const life = lives.get(part_id);
    if (!life) return;
    const kmSince = Math.max(0, st.odo - life.lastReplaceKm);
    const horizonKm = v.avgDailyKm * 30;
    let p;
    let rulKm;
    const scenario = scenarios.find((s) => s.def.part_id === part_id && !s.resolved && ms >= windowStartMs + s.onset * DAY_MS);
    if (part_id === BRAKE_PART) {
      p = clamp((25 - st.brakeRemaining) / 20, 0.01, 0.95);
      rulKm = Math.max(0, ((st.brakeRemaining - 8) / 92) * (life.nextFailKm - life.lastReplaceKm));
    } else {
      p = conditionalFailureProbability(life, kmSince, horizonKm);
      rulKm = medianResidualKm(life, kmSince);
    }
    if (scenario) {
      const stage = stageOf(scenario);
      p = Math.max(p, 0.06 + 0.9 * Math.pow(stage, 1.4));
      rulKm = Math.min(rulKm, Math.max(0, (1 - stage) * scenario.L * v.avgDailyKm));
    }
    p = clamp(p + rng.normal(0, 0.015), 0.005, 0.97);
    const band = riskBand(p);
    const related = openDtcs
      .filter((o) => (DTC_PART_MAP[o.row.dtc_id] ?? []).some(([pid]) => pid === part_id))
      .map((o) => ({ o, dtc: dtcsById.get(o.row.dtc_id) }))
      .sort((a, b) => SEVERITY_RANK[b.dtc.severity_class] - SEVERITY_RANK[a.dtc.severity_class]);
    out.health.push({
      health_id: nextId("VHL", 7),
      vehicle_id: v.vehicle_id,
      part_id,
      ts: isoIst(ms),
      date_id: dateIdIst(ms),
      failure_probability: round(p, 3),
      rul_km: Math.round(rulKm),
      rul_days: Math.round(rulKm / Math.max(1, v.avgDailyKm)),
      risk_band: band,
      active_dtcs: related.map(({ o, dtc }) => ({
        dtc_id: dtc.dtc_id,
        spn: dtc.spn,
        fmi: dtc.fmi,
        lamp: o.row.lamp_status,
        severity: dtc.severity_class,
      })),
      ai_prescriptive_action: prescriptiveAction(band, part.part_name),
      driver_dtc_event_id: related[0]?.o.row.dtc_event_id ?? null,
      top_signal_code: scenario ? Object.keys(scenario.def.drift)[0] : PART_SIGNAL[part_id] ?? null,
      trigger,
      model_version: MODEL_VERSION,
    });
  };

  // Codes that fired before the window (scenario already in progress on day 0)
  for (const s of scenarios) {
    for (const c of s.codes) {
      if (c.day >= 0 || c.day > scenarioEndDay(s)) continue;
      const ms = windowStartMs + Math.floor(c.day) * DAY_MS + rng.uniform(8, 18) * HOUR_MS;
      const kmBack = -Math.floor(c.day) * v.avgDailyKm;
      const row = emitDtc({
        code: c.code,
        ms,
        env: null,
        meta: {
          scenario: s,
          part_id: s.def.part_id,
          kind: "scenario",
          causedDerate: s.derateDay !== null && c.day >= s.derateDay,
          odo: st.odo - kmBack,
          engineHours: st.engineHours - kmBack * v.hoursPerKm,
        },
      });
      s.events.push(row);
      c.emitted = true;
    }
  }

  const [climMean, climSwing] = REGION_CLIMATE[v.region_id] ?? [30, 4];
  const relief = v.reliefDriver && v.reliefDriver !== v.primaryDriver ? v.reliefDriver : null;
  const lifeList = [...lives.values()].filter((l) => l.part.part_id !== BRAKE_PART);
  const monitored = MONITORED_PARTS[v.spec.powertrain].filter((p) => lives.has(p));
  const healthSignals = HEALTH_SIGNALS[v.spec.powertrain];

  // --- daily loop ------------------------------------------------------------
  for (let d = 0; d < days; d++) {
    const date = addDays(windowStart, d);
    const dayMs = istMidnightMs(date);
    const dayAmbient = climMean + rng.normal(0, 1.5);
    const stageOf = (s) => scenarioStage(s, d);

    // 1. Workshop jobs due today
    for (const job of schedule.get(d) ?? []) {
      if (job.type === "scenario" && job.scenario.resolved) continue;
      // the truck may still be on a trip that ran past midnight
      const openMs = Math.max(dayMs + rng.uniform(8.5, 10.5) * HOUR_MS, st.busyUntilMs + rng.uniform(0.5, 2) * HOUR_MS);
      openRepair(job, openMs, d);
    }

    const activeScenarios = scenarios.filter((s) => scenarioActive(s, d));
    const derate = activeScenarios.some((s) => s.derateDay !== null && d >= Math.floor(s.derateDay));
    const inWorkshop = workshopDays.has(d);
    // a truck already in the workshop can't break down on the road: the failure moves to the next day
    for (const s of activeScenarios) if (inWorkshop && s.outcome === "breakdown" && s.failDay === d) s.failDay++;
    const breakdownToday = activeScenarios.find((s) => s.outcome === "breakdown" && s.failDay === d);
    const weekdayFactor = weekday(date) === 0 ? 0.55 : 1;
    const operating = !inWorkshop && (Boolean(breakdownToday) || rng.chance(v.app.operate_p * weekdayFactor));
    const driver = relief && rng.chance(0.15) ? relief : v.primaryDriver;
    const aggression = driver.profile.aggression;
    if (st.tyreLeakDays > 0) st.tyreLeakDays--;
    else if (rng.chance(0.003)) st.tyreLeakDays = rng.int(1, 2);

    const dayTrips = [];
    const dayEvents = [];
    let lastPingMs = dayMs + rng.uniform(0, 2) * HOUR_MS;
    const odoStartOfDay = st.odo;

    if (operating) {
      const nTrips = breakdownToday ? 1 : rng.int(v.app.trips[0], v.app.trips[1]);
      let clockMs = Math.max(dayMs + rng.uniform(5, 9.5) * HOUR_MS, st.busyUntilMs + rng.uniform(0.5, 1.5) * HOUR_MS);

      for (let t = 0; t < nTrips; t++) {
        if (clockMs > dayMs + 22 * HOUR_MS) break;
        const isLastTrip = t === nTrips - 1;
        let targetKm = rng.uniform(v.app.trip_km[0], v.app.trip_km[1]) * (derate ? 0.6 : 1);

        // Destination
        let dest;
        if (v.app.trip_km[1] <= 150) {
          if (isLastTrip && t > 0) dest = v.home;
          else {
            const regionCities = REGION_CITIES[v.region_id] ?? [v.homeCity];
            const towards = CITY_COORDS[rng.pick(regionCities.filter((c) => c !== v.homeCity)) ?? v.homeCity];
            const bearing = bearingDeg(v.home, towards) + rng.uniform(-35, 35);
            dest = clampToIndia(destinationPoint(v.home, bearing, (targetKm / ROAD_FACTOR) * rng.uniform(0.6, 1)));
          }
        } else {
          const fromHome = haversineKm(st.pos, v.home);
          const scored = Object.entries(CITY_COORDS)
            .map(([name, c]) => {
              const rd = roadKm(st.pos, c);
              const homeward = fromHome > 350 && haversineKm(c, v.home) > fromHome ? 0.8 : 0;
              return { name, c, rd, score: Math.abs(rd - targetKm) / targetKm + homeward + (rd < 25 ? 5 : 0) };
            })
            .sort((a, b) => a.score - b.score);
          const choice = scored[rng.int(0, 2)];
          dest =
            Math.abs(choice.rd - targetKm) / targetKm > 0.4
              ? clampToIndia(destinationPoint(st.pos, bearingDeg(st.pos, choice.c), targetKm / ROAD_FACTOR))
              : choice.c;
        }
        const startPos = st.pos;
        const distance = Math.max(3, roadKm(startPos, dest));

        // Trip dynamics
        const avgMoving = Math.min(v.app.avg_speed * rng.uniform(0.9, 1.1) * (derate ? 0.7 : 1), derate ? 55 : 70);
        const driveS = (distance / avgMoving) * 3600;
        const idleShare = v.app.idle_share;
        let idleS = ((driveS * idleShare) / (1 - idleShare)) * driver.profile.idle * rng.uniform(0.7, 1.3);
        if (rng.chance(0.08 * driver.profile.idle)) idleS += rng.uniform(1800, 4200); // long idle wait
        const ptoS = v.app.pto_share > 0 ? ((driveS * v.app.pto_share) / (1 - v.app.pto_share)) * rng.uniform(0.7, 1.3) : 0;
        const startMs = clockMs;
        const endMs = startMs + (driveS + idleS + ptoS) * 1000;
        const hourOfDay = ((startMs + endMs) / 2 - dayMs) / HOUR_MS;
        const ambient = dayAmbient + climSwing * Math.sin(((hourOfDay - 9) / 24) * 2 * Math.PI) + rng.normal(0, 0.8);

        const loaded = v.app.trip_km[1] <= 150 ? t % 2 === 0 : rng.chance(0.85);
        const payloadShare = loaded ? v.app.load * rng.uniform(0.85, 1.05) : rng.uniform(0, 0.1);
        const gcw = Math.round(v.spec.empty_kg + (v.spec.gcw_max_kg - v.spec.empty_kg) * clamp(payloadShare, 0, 1.08));
        const load = clamp((gcw - v.spec.empty_kg) / (v.spec.gcw_max_kg - v.spec.empty_kg), 0, 1.1);

        // BEV: opportunity charge before the trip if the battery would drop too low
        let fuelUsed = null;
        let idleFuel = null;
        let ptoFuel = null;
        let adblueUsed = null;
        let energy = null;
        let regen = null;
        if (bev) {
          const kwhPerKm = (v.spec.base_consumption / 100) * (0.75 + 0.5 * load) * (1 + 0.012 * Math.max(0, ambient - 25)) * (0.93 + 0.07 * aggression);
          const gross = distance * kwhPerKm + ((idleS + ptoS) / 3600) * 3;
          regen = gross * rng.uniform(0.1, 0.18) * (1.3 - 0.3 * aggression);
          energy = gross - regen;
          const socNeed = (energy / v.spec.battery_kwh) * 100;
          if (st.soc - socNeed < 12) {
            const chargeStart = clockMs;
            const target = rng.uniform(80, 92);
            const kwh = ((target - st.soc) / 100) * v.spec.battery_kwh;
            const power = rng.uniform(250, 350);
            const durMs = (kwh / power) * 1.15 * HOUR_MS;
            out.charging.push({
              session_id: nextId("CHG", 6),
              vehicle_id: v.vehicle_id,
              driver_id: driver.driver_id,
              date_id: dateIdIst(chargeStart),
              start_ts: isoIst(chargeStart),
              end_ts: isoIst(chargeStart + durMs),
              city: nearestCity(st.pos),
              lat: round(st.pos[0], 5),
              lon: round(st.pos[1], 5),
              charger_type: "PUBLIC_DC",
              energy_kwh: round(kwh / 0.93, 1),
              max_power_kw: round(power, 0),
              soc_start_pct: round(st.soc, 1),
              soc_end_pct: round(target, 1),
              cost_inr: round((kwh / 0.93) * 18, 0),
            });
            st.soc = target;
            clockMs += durMs + 10 * MINUTE_MS;
          }
        } else {
          const scaleDerate = derate ? 1.05 : 1;
          const perKm = (v.spec.base_consumption / 100) * (0.72 + 0.56 * load) * (0.9 + 0.1 * aggression) * scaleDerate * (v.app.severity > 1.3 ? 1.1 : 1);
          const movingFuel = distance * perKm;
          idleFuel = (idleS / 3600) * v.spec.idle_lph * (1 + 0.02 * Math.max(0, ambient - 30));
          ptoFuel = (ptoS / 3600) * 7;
          fuelUsed = movingFuel + idleFuel + ptoFuel;
          const defScenario = activeScenarios.find((s) => s.def.adblue_dosing_factor);
          const dosing = defScenario ? 1 + (defScenario.def.adblue_dosing_factor - 1) * stageOf(defScenario) : 1;
          adblueUsed = fuelUsed * 0.055 * dosing * rng.uniform(0.95, 1.05);
        }
        // shift trip if a charge happened
        const tripStartMs = clockMs;
        const tripEndMs = tripStartMs + (endMs - startMs);

        // Driving style
        const overspeedS = derate ? 0 : Math.round(driveS * driver.profile.over_speed * rng.uniform(0.5, 1.5));
        const maxSpeed = derate
          ? rng.uniform(52, 60)
          : overspeedS > 0
            ? rng.uniform(SPEED_GOVERNOR_KMH + 1, SPEED_GOVERNOR_KMH + 6 + 4 * aggression)
            : rng.uniform(Math.min(70, avgMoving + 15), SPEED_GOVERNOR_KMH);
        const cruisePct = clamp(v.app.cruise * 100 * (1.2 - 0.25 * aggression) * rng.uniform(0.8, 1.2) * (v.spec.top_gear >= 9 ? 1 : 0.6), 0, 70);
        const coastPct = clamp(rng.uniform(3, 9) * (1.4 - 0.4 * aggression), 0, 20);
        const greenBand = bev ? null : clamp(88 - 22 * (aggression - 0.6) + rng.normal(0, 4) - (v.app.severity - 1) * 10, 35, 97);
        const brakeApps = Math.round((distance / 100) * v.app.brakes_per_100km * Math.pow(aggression, 0.7) * rng.uniform(0.85, 1.15));
        const idlePct = (idleS / (driveS + idleS + ptoS)) * 100;

        // rFMS-style class histograms (seconds)
        const bands = [
          ["0-30", 15],
          ["30-50", 40],
          ["50-70", 60],
          ["70-80", 75],
        ];
        const weights = bands.map(([, c]) => Math.exp(-((c - avgMoving * 1.1) ** 2) / (2 * 15 ** 2)));
        const wSum = weights.reduce((a, b) => a + b, 0);
        const speedClass = Object.fromEntries(bands.map(([k], i) => [k, Math.round(((driveS - overspeedS) * weights[i]) / wSum)]));
        speedClass[">80"] = overspeedS;
        const rpmClass = bev
          ? null
          : {
              "<700": Math.round(idleS),
              "700-1100": Math.round(driveS * (1 - greenBand / 100) * 0.4),
              "1100-1500": Math.round((driveS * greenBand) / 100),
              "1500-1900": Math.round(driveS * (1 - greenBand / 100) * 0.45),
              ">1900": Math.round(driveS * (1 - greenBand / 100) * 0.15),
            };

        const tripId = nextId("TRP", 8);
        const tripStartOdo = st.odo;

        // Harsh / ADAS events along the route
        const events = [];
        for (const [type, cfg] of Object.entries(HARSH_EVENT_TYPES)) {
          if (cfg.adas && !v.spec.adas_equipped) continue;
          if (cfg.diesel_only && bev) continue;
          let n;
          if (type === "excessive_idle") n = idleS > 1800 && rng.chance(0.35) ? 1 : 0;
          else if (type === "overspeed") n = overspeedS > 0 ? rng.poisson(cfg.rate * (distance / 100) * aggression ** 1.6) : 0;
          else n = rng.poisson(cfg.rate * (distance / 100) * aggression ** 1.6 * v.app.severity);
          for (let k = 0; k < n; k++) {
            const f = rng.uniform(0.05, 0.95);
            const [lat, lon] = interpolate(startPos, dest, f);
            let before;
            let after;
            let g = null;
            let dur = rng.int(1, 4);
            switch (type) {
              case "harsh_brake":
                before = rng.uniform(35, 75);
                after = Math.max(0, before - rng.uniform(20, 40));
                g = rng.uniform(0.33, 0.45 + 0.1 * aggression);
                break;
              case "harsh_accel":
                before = rng.uniform(0, 30);
                after = before + rng.uniform(15, 25);
                g = rng.uniform(0.28, 0.35 + 0.08 * aggression);
                break;
              case "harsh_cornering":
                before = rng.uniform(25, 50);
                after = before - rng.uniform(0, 8);
                g = rng.uniform(0.3, 0.4 + 0.1 * aggression);
                break;
              case "overspeed":
                before = rng.uniform(81, maxSpeed + 2);
                after = before - rng.uniform(0, 4);
                dur = rng.int(20, 180);
                break;
              case "over_rev":
                before = rng.uniform(20, 60);
                after = before;
                dur = rng.int(3, 15);
                break;
              case "excessive_idle":
                before = 0;
                after = 0;
                dur = Math.round(Math.min(idleS, rng.uniform(1800, 4200)));
                break;
              case "aba_warning":
                before = rng.uniform(40, 80);
                after = before - rng.uniform(5, 25);
                g = rng.uniform(0.2, 0.4);
                break;
              case "aba_full_brake":
                before = rng.uniform(40, 80);
                after = rng.uniform(0, 20);
                g = rng.uniform(0.5, 0.8);
                break;
              case "lane_departure":
                before = rng.uniform(55, 80);
                after = before;
                break;
              case "close_following":
                before = rng.uniform(45, 80);
                after = before;
                dur = rng.int(3, 20);
                break;
            }
            const severity =
              g !== null ? (g > 0.5 ? "high" : g > 0.4 ? "medium" : "low") : rng.weighted([["low", 0.5], ["medium", 0.35], ["high", 0.15 * aggression]]);
            const ts = tripStartMs + f * (tripEndMs - tripStartMs);
            events.push({
              event_id: nextId("HEV", 8),
              vehicle_id: v.vehicle_id,
              driver_id: driver.driver_id,
              trip_id: tripId,
              ts: isoIst(ts),
              date_id: dateIdIst(ts),
              event_type: type,
              severity,
              lat: round(lat, 5),
              lon: round(lon, 5),
              speed_before_kmh: round(before, 1),
              speed_after_kmh: round(after, 1),
              peak_g: g === null ? null : round(g, 2),
              duration_s: dur,
              source: cfg.source,
              score_penalty: cfg.penalty,
              _ms: ts,
            });
          }
        }
        events.sort((a, b) => a._ms - b._ms);
        for (const e of events) delete e._ms;

        const ecoScore = bev
          ? clamp(100 - idlePct * 0.8 - (brakeApps / Math.max(1, distance)) * 100 * 0.05 - (overspeedS / driveS) * 200 + coastPct * 0.5, 0, 100)
          : clamp(100 - idlePct * 0.8 - (100 - greenBand) * 0.4 - (brakeApps / Math.max(1, distance)) * 100 * 0.05 - (overspeedS / driveS) * 200 + cruisePct * 0.1, 0, 100);

        // Advance state
        const prevFuelTotal = st.totalFuel;
        const prevEnergy = st.energyTotal;
        const prevRegen = st.regenTotal;
        const prevSoc = st.soc;
        const prevEngineHours = st.engineHours;
        if (!bev) {
          if (st.fuelLevel < 25) st.fuelLevel = rng.uniform(90, 98);
          if (st.adblueLevel < 20) st.adblueLevel = rng.uniform(90, 98);
        }
        const fuelLevelAtStart = st.fuelLevel;
        const adblueAtStart = st.adblueLevel;
        st.odo += distance;
        st.engineHours += (driveS + idleS + ptoS) / 3600;
        if (bev) {
          st.energyTotal += energy;
          st.regenTotal += regen;
          st.soc = clamp(st.soc - (energy / v.spec.battery_kwh) * 100, 3, 100);
        } else {
          st.totalFuel += fuelUsed;
          st.fuelLevel = clamp(st.fuelLevel - (fuelUsed / v.spec.fuel_tank_l) * 100, 2, 100);
          st.adblueLevel = clamp(st.adblueLevel - (adblueUsed / (v.spec.fuel_tank_l * 0.12)) * 100, 2, 100);
          const sootRate = v.app.severity > 1.3 ? 0.16 : v.app.trip_km[1] <= 150 ? 0.12 : 0.07;
          st.soot += distance * sootRate;
          const dpf = activeScenarios.find((s) => s.key === "dpf_clog");
          const regenOk = !dpf || rng.chance(1 - stageOf(dpf));
          if (st.soot > 75 && regenOk) st.soot = rng.uniform(5, 15);
        }
        st.pos = dest;

        const trip = {
          trip_id: tripId,
          vehicle_id: v.vehicle_id,
          driver_id: driver.driver_id,
          date_id: dateIdIst(tripStartMs),
          start_ts: isoIst(tripStartMs),
          end_ts: isoIst(tripEndMs),
          start_city: nearestCity(startPos),
          end_city: nearestCity(dest),
          start_lat: round(startPos[0], 5),
          start_lon: round(startPos[1], 5),
          end_lat: round(dest[0], 5),
          end_lon: round(dest[1], 5),
          start_odometer_km: round(tripStartOdo, 1),
          end_odometer_km: round(st.odo, 1),
          distance_km: round(distance, 1),
          drive_s: Math.round(driveS),
          idle_s: Math.round(idleS),
          pto_s: Math.round(ptoS),
          fuel_used_l: round(fuelUsed, 1),
          idle_fuel_l: round(idleFuel, 2),
          pto_fuel_l: round(ptoFuel, 2),
          adblue_used_l: round(adblueUsed, 2),
          energy_used_kwh: round(energy, 1),
          regen_kwh: round(regen, 1),
          avg_speed_kmh: round(distance / (driveS / 3600), 1),
          max_speed_kmh: round(maxSpeed, 1),
          overspeed_s: overspeedS,
          cruise_distance_pct: round(cruisePct, 1),
          coasting_distance_pct: round(coastPct, 1),
          rpm_green_band_pct: round(greenBand, 1),
          brake_applications: brakeApps,
          avg_gcw_kg: gcw,
          ambient_temp_c: round(ambient, 1),
          co2_kg: bev ? 0 : round(fuelUsed * DIESEL_CO2_KG_PER_L, 1),
          harsh_event_count: events.length,
          eco_score: round(ecoScore, 1),
          speed_class_s: speedClass,
          rpm_class_s: rpmClass,
        };
        out.trips.push(trip);
        out.harsh.push(...events);
        dayTrips.push({ trip, driveS, idleS, ptoS, load, ambient, fuelUsed, idleFuel, energy, adblueUsed, startMs: tripStartMs, endMs: tripEndMs });
        dayEvents.push(...events);
        lastPingMs = tripEndMs;

        // 5-min snapshots (recent window only)
        if (d >= days - snapshotDays) {
          const env = { ambient, load, scenarios: activeScenarios, stageOf };
          const slots = Math.max(2, Math.round((tripEndMs - tripStartMs) / SNAPSHOT_STEP_MS));
          const idleP = idleS / (driveS + idleS + ptoS);
          const ptoP = ptoS / (driveS + idleS + ptoS);
          const states = Array.from({ length: slots + 1 }, (_, i) => {
            if (i === 0 || i === slots) return "idle";
            const r = rng.next();
            return r < idleP ? "idle" : r < idleP + ptoP ? "pto" : "moving";
          });
          const movingTotal = Math.max(1, states.filter((s) => s === "moving").length);
          let movedSlots = 0;
          for (let i = 0; i <= slots; i++) {
            const f = i / slots;
            const state = states[i];
            if (state === "moving") movedSlots++;
            const along = movedSlots / movingTotal;
            const [lat, lon] = interpolate(startPos, dest, along);
            const speed = state === "moving" ? clamp(rng.normal(avgMoving * 1.08, 9), 8, maxSpeed) : 0;
            const gearDiv = v.spec.top_gear >= 12 ? 7 : v.spec.top_gear >= 9 ? 9.5 : v.spec.top_gear >= 6 ? 14 : 22;
            const ts = tripStartMs + f * (tripEndMs - tripStartMs);
            const cool = bev ? null : signalValue("COOLANT_TEMP", v, st, env, rng) - (i === 0 ? 25 : 0);
            out.status.push({
              vehicle_id: v.vehicle_id,
              driver_id: driver.driver_id,
              trip_id: tripId,
              ts: isoIst(ts),
              date_id: dateIdIst(ts),
              trigger_type: i === 0 ? "IGNITION_ON" : i === slots ? "IGNITION_OFF" : "TIMER",
              lat: round(lat + rng.normal(0, 0.002), 5),
              lon: round(lon + rng.normal(0, 0.002), 5),
              heading_deg: Math.round((bearingDeg(startPos, dest) + rng.normal(0, 12) + 360) % 360),
              gnss_speed_kmh: round(speed + (speed ? rng.normal(0, 1) : 0), 1),
              wheel_speed_kmh: round(speed, 1),
              tacho_speed_kmh: round(speed + (speed ? rng.normal(0, 0.4) : 0), 1),
              odometer_km: round(tripStartOdo + distance * along, 1),
              engine_hours: round(prevEngineHours + (f * (tripEndMs - tripStartMs)) / HOUR_MS, 1),
              engine_state: bev ? "ready" : state === "moving" ? "running" : state,
              engine_rpm: bev ? null : state === "moving" ? Math.round(900 + speed * 9 * (0.9 + 0.1 * aggression) + rng.normal(0, 60)) : state === "pto" ? Math.round(rng.uniform(1000, 1300)) : Math.round(rng.uniform(580, 660)),
              engine_load_pct: round(state === "moving" ? clamp(35 + 45 * load + rng.normal(0, 10), 5, 100) : state === "pto" ? rng.uniform(30, 55) : rng.uniform(5, 12), 1),
              accel_pedal_pct: round(state === "moving" ? clamp(rng.normal(35 + 10 * aggression, 12), 0, 100) : 0, 1),
              brake_pedal_active: state === "moving" ? rng.chance(0.06 * aggression) : false,
              cruise_active: state === "moving" && speed > 55 ? rng.chance(cruisePct / 100 * 1.4) : false,
              retarder_active: state === "moving" ? rng.chance(0.04) : false,
              current_gear: state === "moving" ? Math.min(v.spec.top_gear, 1 + Math.floor(speed / gearDiv)) : 0,
              fuel_level_pct: bev ? null : round(fuelLevelAtStart + (st.fuelLevel - fuelLevelAtStart) * f, 1),
              total_fuel_used_l: bev ? null : round(prevFuelTotal + fuelUsed * f, 1),
              fuel_rate_lph: bev ? null : round(state === "moving" ? (fuelUsed - idleFuel - ptoFuel) / (driveS / 3600) * rng.uniform(0.8, 1.2) : state === "pto" ? 7 : v.spec.idle_lph, 1),
              adblue_level_pct: bev ? null : round(adblueAtStart + (st.adblueLevel - adblueAtStart) * f, 1),
              coolant_temp_c: round(cool, 1),
              oil_pressure_kpa: bev ? null : round(state === "moving" ? signalValue("OIL_PRESSURE", v, st, env, rng) : rng.uniform(170, 210), 0),
              battery_voltage_v: round(signalValue("BATTERY_VOLTAGE", v, st, env, rng), 2),
              ambient_temp_c: round(ambient + rng.normal(0, 0.5), 1),
              gross_combination_weight_kg: gcw,
              driver_working_state: state === "moving" ? "DRIVE" : state === "pto" ? "WORK" : "DRIVER_AVAILABLE",
              soc_pct: bev ? round(prevSoc + (st.soc - prevSoc) * f, 1) : null,
              soh_pct: bev ? round(signalValue("HV_SOH", v, st, env, rng), 1) : null,
              hv_battery_temp_c: bev ? round(signalValue("HV_BATTERY_TEMP", v, st, env, rng), 1) : null,
              energy_used_kwh_total: bev ? round(prevEnergy + energy * f, 1) : null,
              regen_kwh_total: bev ? round(prevRegen + regen * f, 1) : null,
              charging_state: bev ? "not_charging" : null,
            });
          }
        }
        st.busyUntilMs = tripEndMs;
        clockMs = tripEndMs + rng.uniform(0.4, 1.5) * HOUR_MS;
      }

      // BEV overnight depot charge
      if (bev && st.soc < 70 && dayTrips.length) {
        const atDepot = haversineKm(st.pos, v.home) < 60;
        const start = lastPingMs + rng.uniform(0.3, 1.2) * HOUR_MS;
        const target = rng.uniform(92, 100);
        const kwh = ((target - st.soc) / 100) * v.spec.battery_kwh;
        const power = atDepot ? rng.uniform(100, 160) : rng.uniform(250, 350);
        st.busyUntilMs = start + (kwh / power) * 1.1 * HOUR_MS;
        out.charging.push({
          session_id: nextId("CHG", 6),
          vehicle_id: v.vehicle_id,
          driver_id: driver.driver_id,
          date_id: dateIdIst(start),
          start_ts: isoIst(start),
          end_ts: isoIst(start + (kwh / power) * 1.1 * HOUR_MS),
          city: nearestCity(st.pos),
          lat: round(st.pos[0], 5),
          lon: round(st.pos[1], 5),
          charger_type: atDepot ? "DEPOT_DC" : "PUBLIC_DC",
          energy_kwh: round(kwh / 0.93, 1),
          max_power_kw: round(power, 0),
          soc_start_pct: round(st.soc, 1),
          soc_end_pct: round(target, 1),
          cost_inr: round((kwh / 0.93) * (atDepot ? 9 : 18), 0),
        });
        st.soc = target;
      }
    }

    const firstTrip = dayTrips[0];
    const envDay = {
      ambient: firstTrip?.ambient ?? dayAmbient,
      load: firstTrip?.load ?? 0.5,
      scenarios: activeScenarios,
      stageOf,
    };
    const msDuringDay = () => {
      if (!dayTrips.length) return dayMs + rng.uniform(8, 11) * HOUR_MS;
      const t = rng.pick(dayTrips);
      return t.startMs + rng.uniform(0.1, 0.9) * (t.endMs - t.startMs);
    };
    const tripAt = (ms) => dayTrips.find((t) => ms >= t.startMs && ms <= t.endMs)?.trip ?? null;

    // 2. Scenario DTCs firing today
    for (const s of scenarios) {
      if (s.resolved) continue;
      for (const c of s.codes) {
        if (c.emitted || Math.floor(c.day) !== d || c.day > scenarioEndDay(s) + 0.99) continue;
        const ms = msDuringDay();
        const row = emitDtc({
          code: c.code,
          ms,
          trip: tripAt(ms),
          driverId: driver.driver_id,
          env: envDay,
          meta: { scenario: s, part_id: s.def.part_id, kind: "scenario", causedDerate: s.derateDay !== null && c.day >= s.derateDay },
        });
        s.events.push(row);
        c.emitted = true;
      }
    }

    // 3. Nuisance / intermittent codes
    if (operating && rng.chance(0.012)) {
      const pool = ctx.nuisanceCodes.filter((c) => c.powertrain === "all" || c.powertrain === v.spec.powertrain);
      const code = rng.weighted(pool.map((c) => [c, NUISANCE_WEIGHTS[c.dtc_id] ?? 1]));
      const ms = msDuringDay();
      const row = emitDtc({ code: code.dtc_id, ms, trip: tripAt(ms), driverId: driver.driver_id, env: envDay, meta: { nuisance: true } });
      row.last_seen_ts = isoIst(ms + rng.uniform(0.1, 60) * HOUR_MS);
      row.occurrence_count = rng.int(1, 6);
    }

    // 4. Breakdown at the end of the (only) trip
    if (breakdownToday && !breakdownToday.resolved) {
      for (const c of breakdownToday.codes) {
        if (c.emitted) continue;
        const ms = (firstTrip?.endMs ?? dayMs + 12 * HOUR_MS) - 10 * MINUTE_MS;
        breakdownToday.events.push(
          emitDtc({
            code: c.code,
            ms,
            trip: firstTrip?.trip,
            driverId: driver.driver_id,
            env: envDay,
            meta: { scenario: breakdownToday, part_id: breakdownToday.def.part_id, kind: "scenario", causedDerate: dtcsById.get(c.code).can_derate },
          })
        );
        c.emitted = true;
      }
      openRepair({ type: "scenario", scenario: breakdownToday }, (firstTrip?.endMs ?? dayMs + 12 * HOUR_MS) + rng.uniform(1, 3) * HOUR_MS, d + 1);
    }

    // 5. Wear / background failures / planned services (triggered by distance)
    updateBrake();
    if (brakeLife && !brake.pending && st.brakeRemaining < 20 && !brake.dtc) {
      const ms = msDuringDay();
      brake.dtc = emitDtc({ code: BRAKE_DTC, ms, trip: tripAt(ms), driverId: driver.driver_id, env: envDay, meta: { part_id: BRAKE_PART, kind: "brake" } });
      if (rng.chance(0.9)) {
        brake.pending = true;
        addJob(d + rng.int(3, 10), { type: "brake", visitType: "predicted" });
      }
    }
    if (brakeLife && !brake.pending && st.brakeRemaining <= 8) {
      brake.pending = true;
      addJob(d + 1, { type: "brake", visitType: "repair" });
    }

    for (const life of lifeList) {
      if (pendingParts.has(life.part.part_id) || st.odo < life.nextFailKm) continue;
      pendingParts.add(life.part.part_id);
      const codeInfo = partToCode.get(life.part.part_id);
      const ms = dayTrips.length ? dayTrips[dayTrips.length - 1].endMs - 20 * MINUTE_MS : dayMs + 10 * HOUR_MS;
      const dtc =
        codeInfo && rng.chance(codeInfo.likelihood)
          ? emitDtc({ code: codeInfo.code, ms, trip: tripAt(ms), driverId: driver.driver_id, env: envDay, meta: { part_id: life.part.part_id, kind: "background" } })
          : null;
      if (rng.chance(0.35) && dayTrips.length) {
        openRepair({ type: "background", life, dtc, visitType: "breakdown" }, ms + rng.uniform(1, 3) * HOUR_MS, d + 1);
      } else {
        addJob(d + rng.int(1, 3), { type: "background", life, dtc, visitType: "repair" });
      }
    }

    const interval = bev ? 80000 : 50000;
    if (st.odo >= v.nextServiceKm) {
      addJob(d + rng.int(1, 3), { type: "planned" });
      v.nextServiceKm += interval;
    }

    // 6. Update occurrence counters / last-seen for open codes
    if (operating && dayTrips.length) {
      for (const o of openDtcs) {
        if (Date.parse(o.row.first_seen_ts) > lastPingMs) continue;
        o.row.occurrence_count += rng.int(1, 4);
        o.row.last_seen_ts = isoIst(lastPingMs);
      }
    }

    // 7. Health-signal readings (fact_telemetry)
    if (dayTrips.length) {
      for (let r = 0; r < readingsPerDay; r++) {
        const ms = msDuringDay();
        const t = dayTrips.find((x) => ms >= x.startMs && ms <= x.endMs) ?? firstTrip;
        const env = { ambient: t.ambient, load: t.load, scenarios: activeScenarios, stageOf };
        const readings = healthSignals.map((code) => {
          const sig = signalsByCode.get(code);
          const value = signalValue(code, v, st, env, rng);
          const mean = (sig.normal_min + sig.normal_max) / 2;
          const sd = (sig.normal_max - sig.normal_min) / 4;
          return { code, value, z: (value - mean) / sd };
        });
        const maha = Math.sqrt(readings.reduce((s, x) => s + x.z * x.z, 0) / readings.length) * 1.1;
        for (const x of readings) {
          out.telemetry.push({
            vehicle_id: v.vehicle_id,
            ts: isoIst(ms),
            date_id: dateIdIst(ms),
            signal_code: x.code,
            value: round(x.value, 2),
            z_score: round(x.z, 2),
            mahalanobis_score: round(maha, 2),
            is_anomalous: Math.abs(x.z) > 3 || (maha > 3 && Math.abs(x.z) > 2),
          });
        }
      }
    }

    // 8. Predictive-model alerts (the day a scenario is detected) + weekly scoring
    for (const s of scenarios) {
      if (s.detectDay === d) healthRow({ part_id: s.def.part_id, ms: dayMs + rng.uniform(6, 8) * HOUR_MS, trigger: "alert", stageOf });
    }
    if (weekday(date) === 0 || d === days - 1) {
      const ms = dayMs + 23.5 * HOUR_MS;
      for (const partId of monitored) healthRow({ part_id: partId, ms, trigger: "weekly", stageOf });
    }

    // 9. Daily rollup
    const sum = (f) => dayTrips.reduce((s, t) => s + (f(t) ?? 0), 0);
    const distanceKm = st.odo - odoStartOfDay;
    const driveH = sum((t) => t.driveS) / 3600;
    const idleH = sum((t) => t.idleS) / 3600;
    const ptoH = sum((t) => t.ptoS) / 3600;
    const penalties = dayEvents.reduce((s, e) => s + e.score_penalty, 0);
    const engineMinutes = (driveH + idleH + ptoH) * 60;
    const expected = Math.ceil(engineMinutes / 5) + 24;
    const dark = rng.chance(0.004);
    const openRows = openDtcs.map((o) => o.row).filter((r) => Date.parse(r.first_seen_ts) <= dayMs + DAY_MS);
    out.daily.push({
      vehicle_id: v.vehicle_id,
      date_id: date,
      driver_id: dayTrips.length ? driver.driver_id : null,
      is_operating: dayTrips.length > 0,
      in_workshop: workshopDays.has(d),
      trips: dayTrips.length,
      distance_km: round(distanceKm, 1),
      engine_hours: round(driveH + idleH + ptoH, 2),
      drive_hours: round(driveH, 2),
      idle_hours: round(idleH, 2),
      pto_hours: round(ptoH, 2),
      fuel_l: bev ? null : round(sum((t) => t.fuelUsed), 1),
      idle_fuel_l: bev ? null : round(sum((t) => t.idleFuel), 2),
      adblue_l: bev ? null : round(sum((t) => t.adblueUsed), 2),
      energy_kwh: bev ? round(sum((t) => t.energy), 1) : null,
      co2_kg: bev ? 0 : round(sum((t) => t.fuelUsed) * DIESEL_CO2_KG_PER_L, 1),
      utilization_pct: round(((driveH + idleH + ptoH) / 24) * 100, 1),
      harsh_event_count: dayEvents.length,
      safety_score: dayTrips.length ? round(clamp(100 - ((penalties * 100) / Math.max(distanceKm, 100)) * SAFETY_SCALE, 0, 100), 1) : null,
      eco_score: dayTrips.length ? round(dayTrips.reduce((s, t) => s + t.trip.eco_score * t.trip.distance_km, 0) / Math.max(1, distanceKm), 1) : null,
      active_dtc_count: openRows.length,
      amber_lamp_flag: openRows.some((r) => r.lamp_status === "AWL" || r.lamp_status === "MIL"),
      red_lamp_flag: openRows.some((r) => r.lamp_status === "RSL" || r.lamp_status === "PL"),
      derate_active: derate && dayTrips.length > 0,
      odometer_km_end: round(st.odo, 1),
      packets_expected: expected,
      packets_received: dark ? 0 : Math.min(expected, Math.round(expected * clamp(v.completeness + rng.normal(0, 0.01), 0.5, 1))),
      last_ping_ts: isoIst(lastPingMs),
    });
  }

  v.finalOdometer = st.odo;
  v.lives = lives;
}
