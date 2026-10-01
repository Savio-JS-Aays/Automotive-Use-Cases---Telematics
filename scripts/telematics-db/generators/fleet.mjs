import { createHash } from "node:crypto";
import { APPLICATION_PROFILES, DRIVER_PROFILES, MODEL_SPECS, WARRANTY_KM, WARRANTY_MONTHS } from "../reference/catalog.mjs";
import { CITY_COORDS, cityFromLocationName, destinationPoint } from "../lib/geo.mjs";
import { addDays, daysBetween } from "../lib/time.mjs";

function addMonths(dateStr, months) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + months, d)).toISOString().slice(0, 10);
}

// Pick the connected-vehicle sample: stratified by model, only customer-delivered trucks
// that entered service before the simulation window.
export function selectFleet({ rng, vehicles, models, count, windowStart }) {
  const eligible = vehicles
    .filter((v) => v.current_status === "Delivered" && v.in_service_date && v.in_service_date < windowStart)
    .sort((a, b) => a.vehicle_id.localeCompare(b.vehicle_id));
  const byModel = new Map();
  for (const v of eligible) {
    if (!byModel.has(v.model_id)) byModel.set(v.model_id, []);
    byModel.get(v.model_id).push(v);
  }
  const modelIds = models.map((m) => m.model_id).filter((id) => byModel.has(id)).sort();
  const perModel = Math.ceil(count / modelIds.length);
  const picked = [];
  for (const id of modelIds) picked.push(...rng.fork(`fleet:${id}`).shuffle(byModel.get(id)).slice(0, perModel));
  return picked.slice(0, count).sort((a, b) => a.vehicle_id.localeCompare(b.vehicle_id));
}

export function buildVehicleProfiles({ rng, sample, models, windowStart }) {
  const modelById = new Map(models.map((m) => [m.model_id, m]));
  return sample.map((v) => {
    const vr = rng.fork(`vehicle:${v.vehicle_id}`);
    const model = modelById.get(v.model_id);
    const spec = MODEL_SPECS[model.variant];
    if (!spec) throw new Error(`No MODEL_SPECS entry for variant "${model.variant}" (${model.model_id})`);
    const app = APPLICATION_PROFILES[v.application_id] ?? APPLICATION_PROFILES.APP008;
    const homeCity = cityFromLocationName(v.location_name, v.region_id);
    const home = destinationPoint(CITY_COORDS[homeCity], vr.uniform(0, 360), vr.uniform(2, 9));
    const annualKm = app.annual_km * vr.uniform(0.8, 1.2) * (spec.powertrain === "bev" ? 0.85 : 1);
    const ageDaysAtStart = daysBetween(v.in_service_date, windowStart);
    const odometerStart = (ageDaysAtStart / 365) * annualKm * vr.uniform(0.9, 1.1);
    const hoursPerKm = 1 / (app.avg_speed * (1 - app.idle_share - app.pto_share));
    const regionalCoverage = v.region_id === "REG003" || v.application_id === "APP004" ? 0.92 : 0.985;

    return {
      ...v,
      rng: vr,
      model,
      spec,
      app,
      homeCity,
      home,
      annualKm,
      avgDailyKm: annualKm / 330,
      ageDaysAtStart,
      odometerStart,
      hoursPerKm,
      completeness: Math.min(0.999, regionalCoverage + vr.normal(0, 0.012)),
      telematicsUnitId: `TCU-${createHash("sha1").update(v.vehicle_id).digest("hex").slice(0, 10).toUpperCase()}`,
      connectedSince: addDays(v.in_service_date, vr.int(0, 21)),
      warrantyEnd: addMonths(v.in_service_date, WARRANTY_MONTHS),
      warrantyKm: WARRANTY_KM,
    };
  });
}

// ~1 primary driver per truck plus a pool of relief drivers (≈20 %) shared within a region.
export function buildDrivers({ rng, fleet, windowEnd }) {
  const dr = rng.fork("drivers");
  const drivers = [];
  const profileEntries = Object.entries(DRIVER_PROFILES).map(([k, p]) => [k, p.weight]);
  let n = 0;

  const makeDriver = (vehicle) => {
    n++;
    const driverId = `DRV${String(n).padStart(5, "0")}`;
    const profileKey = dr.weighted(profileEntries);
    const hireYearsAgo = dr.uniform(0.5, 14);
    const driver = {
      driver_id: driverId,
      driver_alias: `Driver ${String(n).padStart(4, "0")} · ${vehicle.homeCity}`,
      driver_card_hash: createHash("sha256").update(`card:${driverId}`).digest("hex").slice(0, 16),
      license_class: dr.chance(0.7) ? "HGMV" : "HTV",
      customer_id: vehicle.customer_id,
      home_location_id: vehicle.location_id,
      hire_date: addDays(windowEnd, -Math.round(hireYearsAgo * 365)),
      experience_years: Math.round(hireYearsAgo + dr.uniform(0, 8)),
      // latent (not written to the DB) — drives behaviour in the simulation
      profile: DRIVER_PROFILES[profileKey],
      profileKey,
    };
    drivers.push(driver);
    return driver;
  };

  for (const v of fleet) v.primaryDriver = makeDriver(v);

  const byRegion = new Map();
  for (const v of fleet) {
    if (!byRegion.has(v.region_id)) byRegion.set(v.region_id, []);
    byRegion.get(v.region_id).push(v);
  }
  for (const vehicles of byRegion.values()) {
    const reliefCount = Math.max(1, Math.round(vehicles.length * 0.2));
    const relief = Array.from({ length: reliefCount }, (_, i) => makeDriver(vehicles[i % vehicles.length]));
    vehicles.forEach((v, i) => (v.reliefDriver = relief[i % relief.length]));
  }
  return drivers;
}

export function toDriverRow(d) {
  const { profile: _profile, profileKey: _profileKey, ...row } = d;
  return row;
}
