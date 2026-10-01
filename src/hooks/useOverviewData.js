import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useFilterStore } from "../store/useFilterStore";

const PAGE_SIZE = 1000; // PostgREST's default max rows per response
const DAY_MS = 24 * 60 * 60 * 1000;

/** Pages through a full result set so KPIs/aggregates aren't silently truncated. */
async function fetchAllRows(buildQuery) {
  const rows = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await buildQuery().range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return rows;
}

// Local calendar date (date_id is a local IST date); toISOString() would shift it by a day.
function toIsoDateString(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

const RANGE_DAYS = { "Last 7 Days": 7, "Last 30 Days": 30, "Last 90 Days": 90 };

function resolvePeriod(dateRange) {
  const days = RANGE_DAYS[dateRange] ?? 30;
  const end = new Date();
  end.setHours(0, 0, 0, 0);
  const start = new Date(end.getTime() - (days - 1) * DAY_MS);
  const prevStart = new Date(start.getTime() - days * DAY_MS);
  return { days, start, prevStart };
}

// Risk bands from Documentation/02_Domain_Theory.md §3 (thresholds in bandFor).
export const RISK_BANDS = [
  { name: "Critical", color: "#e11d48" },
  { name: "High", color: "#f59e0b" },
  { name: "Medium", color: "#38bdf8" },
  { name: "Low", color: "#10b981" },
];
const AT_RISK_BANDS = new Set(["Critical", "High"]);
const DUE_SOON_DAYS = 14;
const MATRIX_MIN_TRUCKS = 5;
const HEALTH_LOOKBACK_DAYS = 14; // weekly predictions: two cycles guarantees one per truck × part
const TREND_WINDOW_DAYS = 7;
const MIN_PREV_COVERAGE = 0.8; // share of expected vehicle-days needed to show a delta
const SERIOUS_DTC_SEVERITIES = new Set(["critical", "major"]);
const SEVERITY_RANK = { critical: 0, major: 1, minor: 2 };

export const ACTION_STATUSES = ["Immediate Service", "Plan Workshop", "Monitor"];

function bandFor(p) {
  if (p > 0.7) return "Critical";
  if (p >= 0.4) return "High";
  if (p >= 0.2) return "Medium";
  return "Low";
}

function isRedOrDerate(event) {
  return event.lamp_status === "RSL" || event.caused_derate === true;
}

/**
 * useOverviewData
 * ---------------
 * Service-engineer landing page (Fleet View only). Every metric is either:
 *  - NOW: latest prediction / DTC state, independent of the date range;
 *  - PERIOD: follows the date range (uptime, data completeness, early-warning trend).
 *
 * Scope = connected trucks (`v_vehicle_context.is_connected`) matching the region, model,
 * powertrain, application and customer-type filters. All percentages use that scope as the denominator.
 * Formulas: Documentation/metrics/overview.md.
 */
export function useOverviewData() {
  const region = useFilterStore((s) => s.region);
  const vehicleModel = useFilterStore((s) => s.vehicleModel);
  const powertrain = useFilterStore((s) => s.powertrain);
  const application = useFilterStore((s) => s.application);
  const customerType = useFilterStore((s) => s.customerType);
  const dateRange = useFilterStore((s) => s.dateRange);

  const [raw, setRaw] = useState({ vehicles: [], health: [], alerts: [], dtcEvents: [], daily: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const period = useMemo(() => resolvePeriod(dateRange), [dateRange]);

  useEffect(() => {
    let isMounted = true;

    async function fetchData() {
      setLoading(true);
      setError(null);

      try {
        const vehicles = await fetchAllRows(() => {
          let q = supabase
            .from("v_vehicle_context")
            .select("vehicle_id, vin, model_id, model_label, region_id, region_name, powertrain")
            .eq("is_connected", true)
            .order("vehicle_id");
          if (region !== "All Regions") q = q.eq("region_id", region);
          if (vehicleModel !== "All Models") q = q.eq("model_id", vehicleModel);
          if (powertrain !== "All Powertrains") q = q.eq("powertrain", powertrain);
          if (application !== "All Applications") q = q.eq("application_id", application);
          if (customerType !== "All Customer Types") q = q.eq("customer_type", customerType);
          return q;
        });
        const ids = vehicles.map((v) => v.vehicle_id);

        if (ids.length === 0) {
          if (isMounted) setRaw({ vehicles, health: [], alerts: [], dtcEvents: [], daily: [] });
          return;
        }

        // Anchor "now" on the latest prediction run so the page still works if the data isn't live.
        const { data: latestRun, error: latestErr } = await supabase
          .from("fact_vehicle_health")
          .select("ts")
          .order("ts", { ascending: false })
          .limit(1);
        if (latestErr) throw latestErr;
        const anchor = latestRun?.[0]?.ts ? new Date(latestRun[0].ts) : new Date();
        const healthFrom = new Date(anchor.getTime() - HEALTH_LOOKBACK_DAYS * DAY_MS).toISOString();

        const trendFrom = toIsoDateString(
          new Date(period.start.getTime() - (TREND_WINDOW_DAYS - 1) * DAY_MS)
        );

        const [health, alerts, dtcEvents, daily] = await Promise.all([
          fetchAllRows(() =>
            supabase
              .from("fact_vehicle_health")
              .select(
                `health_id, vehicle_id, part_id, ts, failure_probability, rul_km, rul_days,
                 ai_prescriptive_action, driver_dtc_event_id, dim_part ( part_name )`
              )
              .in("vehicle_id", ids)
              .gte("ts", healthFrom)
              .order("health_id")
          ),
          fetchAllRows(() =>
            supabase
              .from("fact_vehicle_health")
              .select("health_id, vehicle_id, date_id")
              .in("vehicle_id", ids)
              .eq("trigger", "alert")
              .gte("date_id", trendFrom)
              .order("health_id")
          ),
          // DTC events are small (hundreds per 200 trucks): fetch them all for the scope.
          fetchAllRows(() =>
            supabase
              .from("fact_dtc_event")
              .select(
                `dtc_event_id, vehicle_id, dtc_id, date_id, status, lamp_status, caused_derate,
                 dim_dtc ( spn_description, fmi_description, system, severity_class, recommended_action )`
              )
              .in("vehicle_id", ids)
              .order("dtc_event_id")
          ),
          fetchAllRows(() =>
            supabase
              .from("fact_vehicle_daily")
              .select(
                "vehicle_id, date_id, in_workshop, packets_expected, packets_received, last_ping_ts"
              )
              .in("vehicle_id", ids)
              .gte("date_id", toIsoDateString(period.prevStart))
              .order("vehicle_id")
              .order("date_id")
          ),
        ]);

        if (isMounted) setRaw({ vehicles, health, alerts, dtcEvents, daily });
      } catch (err) {
        if (isMounted) setError(err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    fetchData();
    return () => {
      isMounted = false;
    };
  }, [region, vehicleModel, powertrain, application, customerType, period]);

  // ---- One row per truck: worst part (highest 30-day failure probability) ----
  const trucks = useMemo(() => {
    const latestByVehiclePart = new Map();
    for (const row of raw.health) {
      const key = `${row.vehicle_id}|${row.part_id}`;
      const existing = latestByVehiclePart.get(key);
      if (!existing || new Date(row.ts) > new Date(existing.ts)) latestByVehiclePart.set(key, row);
    }
    const worstByVehicle = new Map();
    for (const row of latestByVehiclePart.values()) {
      const p = Number(row.failure_probability);
      const existing = worstByVehicle.get(row.vehicle_id);
      if (!existing || p > Number(existing.failure_probability)) worstByVehicle.set(row.vehicle_id, row);
    }

    const eventsById = new Map(raw.dtcEvents.map((e) => [e.dtc_event_id, e]));
    const activeByVehicle = new Map();
    for (const e of raw.dtcEvents) {
      if (e.status !== "active") continue;
      if (!activeByVehicle.has(e.vehicle_id)) activeByVehicle.set(e.vehicle_id, []);
      activeByVehicle.get(e.vehicle_id).push(e);
    }
    for (const list of activeByVehicle.values()) {
      list.sort(
        (a, b) =>
          Number(isRedOrDerate(b)) - Number(isRedOrDerate(a)) ||
          (SEVERITY_RANK[a.dim_dtc?.severity_class] ?? 9) - (SEVERITY_RANK[b.dim_dtc?.severity_class] ?? 9)
      );
    }

    const lastPingByVehicle = new Map();
    for (const d of raw.daily) {
      if (!d.last_ping_ts) continue;
      const existing = lastPingByVehicle.get(d.vehicle_id);
      if (!existing || d.last_ping_ts > existing) lastPingByVehicle.set(d.vehicle_id, d.last_ping_ts);
    }

    return raw.vehicles.map((v) => {
      const worst = worstByVehicle.get(v.vehicle_id);
      const p = worst ? Number(worst.failure_probability) : null;
      const band = p === null ? null : bandFor(p);
      const activeDtcs = activeByVehicle.get(v.vehicle_id) ?? [];
      const redOrDerate = activeDtcs.some(isRedOrDerate);
      const seriousDtc = activeDtcs.some((e) => SERIOUS_DTC_SEVERITIES.has(e.dim_dtc?.severity_class));
      const rulDays = worst?.rul_days ?? null;
      const dueSoon = rulDays !== null && rulDays <= DUE_SOON_DAYS;
      const relatedDtc =
        (worst?.driver_dtc_event_id && eventsById.get(worst.driver_dtc_event_id)) || activeDtcs[0] || null;

      let status = null;
      if (band === "Critical" || redOrDerate) status = "Immediate Service";
      else if (band === "High" || dueSoon) status = "Plan Workshop";
      else if (seriousDtc) status = "Monitor";

      const action =
        (AT_RISK_BANDS.has(band) || dueSoon ? worst?.ai_prescriptive_action : null) ??
        relatedDtc?.dim_dtc?.recommended_action ??
        worst?.ai_prescriptive_action ??
        null;

      return {
        vehicleId: v.vehicle_id,
        vin: v.vin,
        modelId: v.model_id,
        modelLabel: v.model_label,
        regionId: v.region_id,
        regionName: v.region_name,
        band,
        failureProbability: p,
        partName: worst?.dim_part?.part_name ?? null,
        rulDays,
        rulKm: worst?.rul_km ?? null,
        activeDtcCount: activeDtcs.length,
        redOrDerate,
        relatedDtc: relatedDtc
          ? {
              dtcId: relatedDtc.dtc_id,
              lamp: relatedDtc.lamp_status,
              status: relatedDtc.status,
              description: relatedDtc.dim_dtc?.spn_description ?? null,
            }
          : null,
        action,
        status,
        lastPing: lastPingByVehicle.get(v.vehicle_id) ?? null,
      };
    });
  }, [raw]);

  const fleetSize = raw.vehicles.length;

  // ---- PERIOD rollups from fact_vehicle_daily ----
  const periodStats = useMemo(() => {
    const startStr = toIsoDateString(period.start);
    const prevStartStr = toIsoDateString(period.prevStart);
    const regionOf = new Map(raw.vehicles.map((v) => [v.vehicle_id, v.region_name]));

    const acc = () => ({ days: 0, workshop: 0, expected: 0, received: 0 });
    const cur = acc();
    const prev = acc();
    const byDate = new Map();
    const byRegion = new Map();

    for (const d of raw.daily) {
      const inCurrent = d.date_id >= startStr;
      const bucket = inCurrent ? cur : d.date_id >= prevStartStr ? prev : null;
      if (!bucket) continue;
      bucket.days += 1;
      bucket.workshop += d.in_workshop ? 1 : 0;
      bucket.expected += d.packets_expected ?? 0;
      bucket.received += d.packets_received ?? 0;
      if (!inCurrent) continue;

      const day = byDate.get(d.date_id) ?? { days: 0, workshop: 0 };
      day.days += 1;
      day.workshop += d.in_workshop ? 1 : 0;
      byDate.set(d.date_id, day);

      const regionName = regionOf.get(d.vehicle_id) ?? "Unknown";
      const reg = byRegion.get(regionName) ?? { expected: 0, received: 0 };
      reg.expected += d.packets_expected ?? 0;
      reg.received += d.packets_received ?? 0;
      byRegion.set(regionName, reg);
    }

    const uptime = (b) => (b.days > 0 ? (1 - b.workshop / b.days) * 100 : null);
    const completeness = (b) => (b.expected > 0 ? (b.received / b.expected) * 100 : null);
    const prevCoverage = fleetSize > 0 ? prev.days / (fleetSize * period.days) : 0;
    const hasPrev = prevCoverage >= MIN_PREV_COVERAGE;

    const dailyUptime = [...byDate.entries()]
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([date, b]) => ({ date, value: uptime(b) }));
    const uptimeSparkline = dailyUptime.map((point, i) => {
      const window = dailyUptime.slice(Math.max(0, i - TREND_WINDOW_DAYS + 1), i + 1);
      return { date: point.date, value: window.reduce((s, w) => s + w.value, 0) / window.length };
    });

    let worstRegion = null;
    for (const [name, b] of byRegion) {
      const pct = completeness(b);
      if (pct !== null && (!worstRegion || pct < worstRegion.pct)) worstRegion = { name, pct };
    }

    return {
      uptime: uptime(cur),
      uptimeDelta: hasPrev && uptime(cur) !== null ? uptime(cur) - uptime(prev) : null,
      completeness: completeness(cur),
      completenessDelta:
        hasPrev && completeness(cur) !== null ? completeness(cur) - completeness(prev) : null,
      uptimeSparkline,
      worstRegion,
    };
  }, [raw, period, fleetSize]);

  // ---- KPIs ----
  const kpis = useMemo(() => {
    const atRisk = trucks.filter((t) => AT_RISK_BANDS.has(t.band));
    const withActiveFaults = trucks.filter((t) => t.activeDtcCount > 0);
    return {
      fleetSize,
      atRiskCount: atRisk.length,
      criticalCount: atRisk.filter((t) => t.band === "Critical").length,
      activeFaultTrucks: withActiveFaults.length,
      redOrDerateTrucks: withActiveFaults.filter((t) => t.redOrDerate).length,
      dueSoonCount: trucks.filter((t) => t.rulDays !== null && t.rulDays <= DUE_SOON_DAYS).length,
      uptime: periodStats.uptime,
      uptimeDelta: periodStats.uptimeDelta,
      uptimeSparkline: periodStats.uptimeSparkline,
      completeness: periodStats.completeness,
      completenessDelta: periodStats.completenessDelta,
      worstCompletenessRegion: periodStats.worstRegion,
    };
  }, [trucks, fleetSize, periodStats]);

  // ---- C1: Fleet risk posture (worst part per truck) ----
  const riskPosture = useMemo(
    () =>
      RISK_BANDS.map((b) => ({
        name: b.name,
        color: b.color,
        value: trucks.filter((t) => t.band === b.name).length,
      })),
    [trucks]
  );

  // ---- C2: Early-warning trend, 7-day rolling count per 100 trucks ----
  const earlyWarningTrend = useMemo(() => {
    const alertsByDate = new Map();
    for (const a of raw.alerts) alertsByDate.set(a.date_id, (alertsByDate.get(a.date_id) ?? 0) + 1);
    const dtcsByDate = new Map();
    for (const e of raw.dtcEvents) {
      if (!SERIOUS_DTC_SEVERITIES.has(e.dim_dtc?.severity_class)) continue;
      dtcsByDate.set(e.date_id, (dtcsByDate.get(e.date_id) ?? 0) + 1);
    }

    const points = [];
    for (let i = 0; i < period.days; i += 1) {
      const day = new Date(period.start.getTime() + i * DAY_MS);
      let alerts = 0;
      let dtcs = 0;
      for (let w = 0; w < TREND_WINDOW_DAYS; w += 1) {
        const key = toIsoDateString(new Date(day.getTime() - w * DAY_MS));
        alerts += alertsByDate.get(key) ?? 0;
        dtcs += dtcsByDate.get(key) ?? 0;
      }
      const per100 = (n) => (fleetSize > 0 ? (n / fleetSize) * 100 : 0);
      points.push({
        date: toIsoDateString(day),
        alertsPer100: Number(per100(alerts).toFixed(2)),
        dtcsPer100: Number(per100(dtcs).toFixed(2)),
        alerts,
        dtcs,
      });
    }
    return points;
  }, [raw.alerts, raw.dtcEvents, period, fleetSize]);

  // ---- C3: Region × Model risk matrix ----
  const riskMatrix = useMemo(() => {
    const regions = new Map();
    const models = new Map();
    const cells = new Map();
    for (const t of trucks) {
      regions.set(t.regionId, t.regionName);
      models.set(t.modelId, t.modelLabel);
      const key = `${t.regionId}|${t.modelId}`;
      const cell = cells.get(key) ?? { total: 0, atRisk: 0 };
      cell.total += 1;
      if (AT_RISK_BANDS.has(t.band)) cell.atRisk += 1;
      cells.set(key, cell);
    }
    const sortedEntries = (m) =>
      [...m.entries()].sort(([a], [b]) => String(a).localeCompare(String(b))).map(([id, label]) => ({ id, label }));
    const rows = sortedEntries(regions);
    const cols = sortedEntries(models);
    return {
      rows,
      cols,
      minTrucks: MATRIX_MIN_TRUCKS,
      cells: rows.map((r) =>
        cols.map((c) => {
          const cell = cells.get(`${r.id}|${c.id}`) ?? { total: 0, atRisk: 0 };
          return {
            regionId: r.id,
            modelId: c.id,
            total: cell.total,
            atRisk: cell.atRisk,
            pct: cell.total > 0 ? (cell.atRisk / cell.total) * 100 : null,
            lowSample: cell.total < MATRIX_MIN_TRUCKS,
          };
        })
      ),
    };
  }, [trucks]);

  // ---- C4: Top predicted failures by part (at-risk trucks, worst part) ----
  const topFailingParts = useMemo(() => {
    const byPart = new Map();
    for (const t of trucks) {
      if (!AT_RISK_BANDS.has(t.band) || !t.partName) continue;
      const entry = byPart.get(t.partName) ?? { partName: t.partName, Critical: 0, High: 0 };
      entry[t.band] += 1;
      byPart.set(t.partName, entry);
    }
    return [...byPart.values()]
      .sort((a, b) => b.Critical + b.High - (a.Critical + a.High) || b.Critical - a.Critical)
      .slice(0, 8);
  }, [trucks]);

  // ---- Table: Workshop Action List ----
  const actionRows = useMemo(() => {
    const statusRank = Object.fromEntries(ACTION_STATUSES.map((s, i) => [s, i]));
    return trucks
      .filter((t) => t.status !== null)
      .sort(
        (a, b) =>
          statusRank[a.status] - statusRank[b.status] ||
          (b.failureProbability ?? 0) - (a.failureProbability ?? 0)
      );
  }, [trucks]);

  return {
    loading,
    error,
    kpis,
    riskPosture,
    earlyWarningTrend,
    riskMatrix,
    topFailingParts,
    actionRows,
  };
}
