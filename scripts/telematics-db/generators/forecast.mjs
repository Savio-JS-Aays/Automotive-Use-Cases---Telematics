// Part demand forecast (part × region × week) for the Supply Chain module.
// Demand = historical replacement rate of the connected fleet + risk mass from the latest
// component-health predictions, scaled from the connected sample to the whole regional fleet.
// Past weeks carry actual replacements so forecast-vs-actual can be charted.

import { partApplies } from "../reference/catalog.mjs";
import { round } from "../lib/rng.mjs";
import { DAY_MS, addDays, istMidnightMs, weekStart } from "../lib/time.mjs";

const FUTURE_WEEKS = 12;
const RISK_WEEKS = 4; // 30-day failure probability is spread over the next ~4 weeks

export function buildDemandForecast({ fleet, parts, replacements, health, vehicles, windowStart, windowEnd, nextId, rng }) {
  const fr = rng.fork("forecast");
  const fleetByRegion = new Map();
  for (const v of vehicles) fleetByRegion.set(v.region_id, (fleetByRegion.get(v.region_id) ?? 0) + 1);
  const vehicleRegion = new Map(fleet.map((v) => [v.vehicle_id, v.region_id]));

  // Historical rate per part per connected vehicle-week (whole service life of the sample)
  const totalVehicleWeeks = fleet.reduce((s, v) => s + (istMidnightMs(windowEnd) - istMidnightMs(v.in_service_date)) / DAY_MS / 7, 0);
  const histCount = new Map();
  for (const r of replacements) if (r.visit_type !== "planned") histCount.set(r.part_id, (histCount.get(r.part_id) ?? 0) + 1);

  // Actual replacements per part/region/week
  const actual = new Map();
  for (const r of replacements) {
    const region = vehicleRegion.get(r.vehicle_id);
    const key = `${r.part_id}|${region}|${weekStart(r.date_id)}`;
    actual.set(key, (actual.get(key) ?? 0) + 1);
  }

  // Health snapshots grouped by part/region/week (weekly scoring only)
  const riskByWeek = new Map();
  for (const h of health) {
    if (h.trigger !== "weekly") continue;
    const key = `${h.part_id}|${vehicleRegion.get(h.vehicle_id)}|${weekStart(h.date_id)}`;
    const e = riskByWeek.get(key) ?? { sum: 0, n: 0 };
    e.sum += h.failure_probability;
    e.n++;
    riskByWeek.set(key, e);
  }

  const firstWeek = weekStart(windowStart);
  const lastPastWeek = weekStart(windowEnd);
  const weeks = [];
  for (let w = firstWeek; w <= addDays(lastPastWeek, FUTURE_WEEKS * 7); w = addDays(w, 7)) weeks.push(w);

  const rows = [];
  for (const part of parts) {
    const rate = (histCount.get(part.part_id) ?? 0) / Math.max(1, totalVehicleWeeks);
    for (const [region, fleetTotal] of fleetByRegion) {
      const connected = fleet.filter((v) => v.region_id === region);
      const applicable = connected.filter((v) => partApplies(part, v.spec, v.application_id));
      if (!applicable.length) continue;
      const fleetVehicles = Math.round(fleetTotal * (applicable.length / connected.length));
      const scale = fleetVehicles / applicable.length;
      const latestRisk = riskByWeek.get(`${part.part_id}|${region}|${lastPastWeek}`);

      for (const w of weeks) {
        const isFuture = w > lastPastWeek;
        const baseline = rate * applicable.length;
        let riskMass = 0;
        let avgP = null;
        if (isFuture) {
          const ahead = Math.round((istMidnightMs(w) - istMidnightMs(lastPastWeek)) / DAY_MS / 7);
          if (latestRisk && ahead <= RISK_WEEKS) riskMass = latestRisk.sum / RISK_WEEKS;
          if (latestRisk) avgP = latestRisk.sum / latestRisk.n;
        } else {
          const risk = riskByWeek.get(`${part.part_id}|${region}|${w}`);
          if (risk) {
            riskMass = risk.sum / RISK_WEEKS;
            avgP = risk.sum / risk.n;
          }
        }
        const predicted = (baseline + riskMass) * (isFuture ? 1 : fr.uniform(0.9, 1.1));
        rows.push({
          forecast_id: nextId("PDF", 7),
          part_id: part.part_id,
          region_id: region,
          week_start: w,
          is_future: isFuture,
          connected_vehicles: applicable.length,
          fleet_vehicles: fleetVehicles,
          connected_predicted_failures: round(predicted, 3),
          connected_actual_replacements: isFuture ? null : actual.get(`${part.part_id}|${region}|${w}`) ?? 0,
          fleet_expected_demand: Math.ceil(predicted * scale * 1.1),
          avg_failure_probability: avgP === null ? null : round(avgP, 3),
          generated_at: windowEnd,
        });
      }
    }
  }
  return rows;
}
