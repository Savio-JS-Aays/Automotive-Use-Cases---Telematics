// Workshop side of the ecosystem: repair orders (shared fact_repair_orders, tagged rows),
// part replacements, warranty claims (shared fact_warranty_claims, tagged rows), part
// lifetimes (Weibull renewal process) and the pre-window service history.

import {
  DATA_SOURCE_TAG,
  DEFAULT_LABOR_RATE_INR,
  FAILURE_MODES,
  LABOR_RATE_INR_BY_TIER,
  MILES_TO_KM,
  SUPPLIER_LIFE_FACTOR,
  WEIBULL_BETA,
  partApplies,
} from "../reference/catalog.mjs";
import { clamp, round } from "../lib/rng.mjs";
import { DAY_MS, HOUR_MS, addDays, dateIdIst, isoIst, istMidnightMs } from "../lib/time.mjs";

const SERVICE_INTERVAL_KM = { diesel: 50000, bev: 80000 };
const PLANNED_SERVICE_PARTS_INR = { diesel: 18000, bev: 9000 };
const HV_BATTERY_WARRANTY = { years: 8, km: 800000 };

const SUBSYSTEM_CLUSTER = { Powertrain: "CLS-PWT", Chassis: "CLS-CHS", Electrical: "CLS-ELEC", Body: "CLS-BODY" };

const COMPLAINTS = {
  Powertrain: ["Customer reports loss of power under load", "Driver reports abnormal noise from driveline", "Oil leak observed under engine/gearbox", "Vibration at highway speed"],
  Chassis: ["Driver reports pulling to one side while braking", "Knocking noise from suspension on rough roads", "Uneven tyre wear and steering play", "Brake judder at low speed"],
  Electrical: ["Intermittent warning lamps on cluster", "Vehicle slow to crank in the morning", "Electrical component inoperative", "Camera/radar system unavailable message"],
  Body: ["Cabin rattles on rough roads", "Cabin tilt system not operating", "Leak observed from tank area"],
};

export function createIdGenerator() {
  const counters = {};
  return (prefix, width = 7) => {
    counters[prefix] = (counters[prefix] ?? 0) + 1;
    return `${prefix}${String(counters[prefix]).padStart(width, "0")}`;
  };
}

// ---------------------------------------------------------------------------
// Part lifetimes
// ---------------------------------------------------------------------------
function partLifeParams(part, supplier, vehicle) {
  const beta = WEIBULL_BETA[part.part_type] ?? 2;
  const b10Km = Number(part.b10_design_life_miles) * MILES_TO_KM;
  // B10 = eta · (−ln 0.9)^(1/β)
  let eta = b10Km / Math.pow(-Math.log(0.9), 1 / beta);
  eta *= SUPPLIER_LIFE_FACTOR[supplier?.risk_tier] ?? 1;
  eta /= vehicle.app.severity;
  if (part.part_id === "PART030" || part.part_id === "PART012") eta /= vehicle.primaryDriver.profile.aggression ** 0.5;
  return { beta, eta, b10Km };
}

// Each part is sourced from its catalogue supplier (dim_part.supplier_id) most of the time,
// with two deterministic alternates so supplier variance is visible in Reliability.
function pickSupplier(rng, part, suppliers) {
  const ids = suppliers.map((s) => s.supplier_id).sort();
  const n = Number(part.part_id.replace("PART", ""));
  const alt1 = ids[n % ids.length];
  const alt2 = ids[(n * 7 + 3) % ids.length];
  return rng.weighted([
    [part.supplier_id, 0.55],
    [alt1, 0.3],
    [alt2, 0.15],
  ]);
}

export function initPartLives({ vehicle, parts, suppliersById, suppliers }) {
  const rng = vehicle.rng.fork("parts");
  const lives = new Map();
  for (const part of parts) {
    if (!partApplies(part, vehicle.spec, vehicle.application_id)) continue;
    const supplierId = pickSupplier(rng, part, suppliers);
    const params = partLifeParams(part, suppliersById.get(supplierId), vehicle);
    lives.set(part.part_id, {
      part,
      supplierId,
      ...params,
      rng: rng.fork(part.part_id),
      lastReplaceKm: 0,
      nextFailKm: 0,
    });
  }
  for (const life of lives.values()) life.nextFailKm = life.rng.weibull(life.eta, life.beta);
  return lives;
}

export function renewPart(life, atKm, supplierId) {
  life.lastReplaceKm = atKm;
  if (supplierId) life.supplierId = supplierId;
  life.nextFailKm = atKm + life.rng.weibull(life.eta, life.beta);
}

// Conditional probability of failing within the next `horizonKm`, given survival to kmSince.
export function conditionalFailureProbability(life, kmSince, horizonKm) {
  const S = (x) => Math.exp(-Math.pow(Math.max(0, x) / life.eta, life.beta));
  const s0 = S(kmSince);
  if (s0 <= 1e-9) return 0.95;
  return clamp(1 - S(kmSince + horizonKm) / s0, 0, 0.99);
}

export function medianResidualKm(life, kmSince) {
  const x = life.eta * Math.pow(Math.pow(kmSince / life.eta, life.beta) + Math.LN2, 1 / life.beta);
  return Math.max(0, x - kmSince);
}

// ---------------------------------------------------------------------------
// Repair orders + replacements + claims
// ---------------------------------------------------------------------------
export function createServiceContext({ dealers, suppliersById, partsById, windowEnd, nextId }) {
  const dealersByRegion = new Map();
  for (const d of dealers) {
    if (d.status && d.status !== "Active") continue;
    if (!dealersByRegion.has(d.region_id)) dealersByRegion.set(d.region_id, []);
    dealersByRegion.get(d.region_id).push(d);
  }
  const allDealers = dealers.filter((d) => !d.status || d.status === "Active");
  return {
    dealersByRegion,
    allDealers,
    suppliersById,
    partsById,
    windowEndMs: istMidnightMs(windowEnd) + DAY_MS - 1,
    windowEnd,
    nextId,
    repairOrders: [],
    replacements: [],
    claims: [],
  };
}

function dealerFor(ctx, vehicle, rng) {
  if (!vehicle.preferredDealer) {
    const pool = ctx.dealersByRegion.get(vehicle.region_id) ?? ctx.allDealers;
    vehicle.preferredDealer = pool[Math.floor(vehicle.rng.fork("dealer").next() * pool.length)];
    vehicle.dealerPool = pool;
  }
  return rng.chance(0.8) ? vehicle.preferredDealer : rng.pick(vehicle.dealerPool);
}

function inWarranty(vehicle, part, dateStr, odometerKm) {
  if (part.part_id === "PART044") {
    const end = addDays(vehicle.in_service_date, Math.round(HV_BATTERY_WARRANTY.years * 365.25));
    return dateStr <= end && odometerKm <= HV_BATTERY_WARRANTY.km;
  }
  return dateStr <= vehicle.warrantyEnd && odometerKm <= vehicle.warrantyKm;
}

function claimStatus(rng, ageDays, nff) {
  if (ageDays < 10) return "Submitted";
  if (ageDays < 30) return rng.chance(0.7) ? "In Review" : "Paid";
  if (nff && rng.chance(0.6)) return "Rejected";
  return rng.weighted([
    ["Paid", 0.82],
    ["Rejected", 0.1],
    ["In Review", 0.08],
  ]);
}

/**
 * Creates one repair order (plus replacement and warranty-claim rows).
 * items: [{ part_id, failure_mode, supplier_id, kmSinceReplace, costFactor?, laborHours? }]
 * Returns { ro_id, closeMs, downtimeHours }.
 */
export function createRepair(ctx, {
  vehicle,
  rng,
  openMs,
  visitType, // planned | predicted | repair | breakdown
  items = [],
  odometerKm,
  engineHours,
  dtcEventId = null,
  dtcCodes = [],
  wasPredicted = false,
  complaint,
  cluster,
}) {
  const roId = ctx.nextId("TRO", 6);
  const dealer = dealerFor(ctx, vehicle, rng);
  const rate = LABOR_RATE_INR_BY_TIER[dealer.dealer_tier] ?? DEFAULT_LABOR_RATE_INR;
  const powertrain = vehicle.spec.powertrain;

  let laborHours = 0;
  let partsCost = 0;
  const lines = items.map((item) => {
    const part = ctx.partsById.get(item.part_id);
    const hours = (item.laborHours ?? Number(part.standard_labor_hours)) * rng.uniform(0.9, 1.25);
    const cost = Number(part.unit_cost) * (item.costFactor ?? 1);
    laborHours += hours;
    partsCost += cost;
    return { item, part, hours, cost };
  });

  const diagHours = { planned: 0, predicted: 0.5, repair: 1, breakdown: 1.5 }[visitType];
  if (visitType === "planned") {
    laborHours += rng.uniform(2, 3.5);
    partsCost += PLANNED_SERVICE_PARTS_INR[powertrain] * rng.uniform(0.9, 1.15);
  }
  const billedHours = laborHours + diagHours;
  const waitHours = {
    planned: rng.uniform(1, 4),
    predicted: rng.uniform(2, 8),
    repair: rng.uniform(6, 36),
    breakdown: rng.uniform(10, 30) + rng.uniform(0, 60),
  }[visitType];
  const downtimeHours = billedHours + waitHours;
  const closeMs = openMs + downtimeHours * HOUR_MS;
  const stillOpen = closeMs > ctx.windowEndMs;
  const openDate = dateIdIst(openMs);

  const partNames = lines.map((l) => l.part.part_name).join(", ");
  const codeText = dtcCodes.length ? `${dtcCodes.join(", ")} logged by ${vehicle.spec.telematics_source}` : "no active fault codes";
  let text;
  if (visitType === "planned") {
    text =
      powertrain === "bev"
        ? `Scheduled service at ${Math.round(odometerKm).toLocaleString("en-IN")} km: HV isolation test, coolant check, brake inspection, software update.`
        : `Scheduled service at ${Math.round(odometerKm).toLocaleString("en-IN")} km: engine oil and filters, greasing, brake adjustment. No defects found.`;
  } else {
    const subsystem = lines[0]?.part.vehicle_subsystem ?? "Powertrain";
    const c = complaint ?? rng.pick(COMPLAINTS[subsystem] ?? COMPLAINTS.Powertrain);
    const prefix = visitType === "predicted" ? `Proactive visit – ${vehicle.spec.telematics_source} predictive alert. ` : "";
    const modes = lines.map((l) => l.item.failure_mode).join("; ");
    text = `${prefix}Complaint: ${c}. Cause: ${modes}; ${codeText}. Correction: Replaced ${partNames}, cleared codes, road test OK.`;
  }

  ctx.repairOrders.push({
    ro_id: roId,
    vehicle_id: vehicle.vehicle_id,
    dealer_id: dealer.dealer_id,
    date_id: openDate,
    billed_hours: round(billedHours, 1),
    labor_cost: round(billedHours * rate, 2),
    nlp_3c_text: text,
    visit_type: visitType,
    dtc_event_id: dtcEventId,
    open_ts: isoIst(openMs),
    close_ts: stillOpen ? null : isoIst(closeMs),
    downtime_hours: stillOpen ? null : round(downtimeHours, 1),
    odometer_km: round(odometerKm, 1),
    parts_cost: round(partsCost, 2),
    data_source: DATA_SOURCE_TAG,
  });

  const ageDaysVehicle = Math.round((openMs - istMidnightMs(vehicle.in_service_date)) / DAY_MS);
  for (const { item, part, hours, cost } of lines) {
    const replacementId = ctx.nextId("RPL", 7);
    const warranted = inWarranty(vehicle, part, openDate, odometerKm);
    const b10Km = Number(part.b10_design_life_miles) * MILES_TO_KM;
    const warrantable = part.part_type !== "Consumable" || (item.kmSinceReplace ?? Infinity) < 0.3 * b10Km;
    let claimId = null;

    if (warranted && warrantable && !stillOpen) {
      const submitMs = closeMs + rng.int(0, 5) * DAY_MS;
      const submitDate = dateIdIst(submitMs);
      if (submitMs <= ctx.windowEndMs) {
        claimId = ctx.nextId("TCLM", 6);
        const supplier = ctx.suppliersById.get(item.supplier_id);
        const hasDtc = Boolean(dtcEventId);
        const nff = rng.chance(hasDtc ? 0.02 : part.part_type === "Electrical" ? 0.15 : 0.05);
        const ageDays = Math.round((ctx.windowEndMs - submitMs) / DAY_MS);
        const status = claimStatus(rng, ageDays, nff);
        const supplierShare = { High: 0.65, Medium: 0.45, Low: 0.3 }[supplier?.risk_tier] ?? 0.4;
        const liability = rng.chance(supplierShare) ? "Supplier" : "OEM";
        const amount = cost + hours * rate;
        const decided = status === "Paid" || status === "Rejected";
        ctx.claims.push({
          claim_id: claimId,
          vehicle_id: vehicle.vehicle_id,
          part_id: part.part_id,
          dealer_id: dealer.dealer_id,
          date_id: submitDate,
          claim_amount: round(amount, 2),
          nff_flag: nff ? 1 : 0,
          ai_risk_score: nff ? rng.int(65, 92) : hasDtc ? rng.int(8, 35) : rng.int(30, 60),
          status,
          submission_date: submitDate,
          adjudication_date: decided ? addDays(submitDate, rng.int(7, Math.max(8, Math.min(40, ageDays)))) : null,
          supplier_id: item.supplier_id,
          liability_type: liability,
          recovered_amount: liability === "Supplier" && status === "Paid" ? round(amount * rng.uniform(0.5, 0.9), 2) : 0,
          mileage_at_failure: Math.round(odometerKm / MILES_TO_KM),
          cluster_id: cluster ?? SUBSYSTEM_CLUSTER[part.vehicle_subsystem] ?? "None",
          dtc_event_id: dtcEventId,
          ro_id: roId,
          was_predicted: wasPredicted,
          data_source: DATA_SOURCE_TAG,
        });
      }
    }

    ctx.replacements.push({
      replacement_id: replacementId,
      ro_id: roId,
      vehicle_id: vehicle.vehicle_id,
      part_id: part.part_id,
      supplier_id: item.supplier_id,
      dealer_id: dealer.dealer_id,
      date_id: openDate,
      quantity: 1,
      odometer_km_at_failure: round(odometerKm, 1),
      engine_hours_at_failure: round(engineHours, 1),
      vehicle_age_days: ageDaysVehicle,
      failure_mode: item.failure_mode,
      visit_type: visitType,
      was_predicted: wasPredicted,
      dtc_event_id: dtcEventId,
      in_warranty: warranted,
      claim_id: claimId,
      part_cost_inr: round(cost, 2),
      labor_hours: round(hours, 1),
    });
  }

  return { ro_id: roId, closeMs, downtimeHours, stillOpen };
}

export function randomFailureMode(rng, part) {
  return rng.pick(FAILURE_MODES[part.part_type] ?? FAILURE_MODES.Mechanical);
}

// ---------------------------------------------------------------------------
// Pre-window history: renewal-process failures + scheduled services from
// in_service_date up to the window start (no telemetry, workshop records only).
// ---------------------------------------------------------------------------
export function simulateHistory(ctx, { vehicle, lives, windowStartMs, skipParts = new Set() }) {
  const rng = vehicle.rng.fork("history");
  const startMs = istMidnightMs(vehicle.in_service_date);
  const spanMs = windowStartMs - startMs;
  const odoEnd = vehicle.odometerStart;
  const msAtKm = (km) => startMs + (km / odoEnd) * spanMs + rng.uniform(9, 16) * HOUR_MS;
  const events = [];

  for (const life of lives.values()) {
    let guard = 0;
    while (life.nextFailKm < odoEnd && guard++ < 50) {
      events.push({ km: life.nextFailKm, life });
      renewPart(life, life.nextFailKm);
    }
    if (skipParts.has(life.part.part_id)) life.nextFailKm = Infinity;
  }

  const interval = SERVICE_INTERVAL_KM[vehicle.spec.powertrain];
  for (let km = interval; km < odoEnd; km += interval) events.push({ km, planned: true });
  vehicle.nextServiceKm = (Math.floor(odoEnd / interval) + 1) * interval;

  events.sort((a, b) => a.km - b.km);
  for (const e of events) {
    const openMs = Math.min(msAtKm(e.km), windowStartMs - HOUR_MS);
    if (e.planned) {
      createRepair(ctx, { vehicle, rng, openMs, visitType: "planned", odometerKm: e.km, engineHours: e.km * vehicle.hoursPerKm });
      continue;
    }
    const { life } = e;
    createRepair(ctx, {
      vehicle,
      rng,
      openMs,
      visitType: rng.chance(0.35) ? "breakdown" : "repair",
      odometerKm: e.km,
      engineHours: e.km * vehicle.hoursPerKm,
      items: [
        {
          part_id: life.part.part_id,
          supplier_id: life.supplierId,
          failure_mode: randomFailureMode(rng, life.part),
          kmSinceReplace: e.km - (life.prevKm ?? 0),
        },
      ],
    });
    life.prevKm = e.km;
  }
}
