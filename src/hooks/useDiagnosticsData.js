import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

// Fleet-wide anomaly threshold plotted as the reference line on the
// Mahalanobis distance scatter chart (Fleet Mode, Chart 1). Adjust to
// whatever chi-square cutoff your model actually uses.
export const FLEET_MAHALANOBIS_THRESHOLD = 3;

// Z-score threshold used for "critical anomaly" counts across both modes.
export const CRITICAL_Z_SCORE_THRESHOLD = 3;

// Hardcoded fleet baseline averages for the Asset Mode deviation chart
// (Chart 4). Swap for a real `fleet_baseline` table/view when one exists.
const FLEET_BASELINE = {
  "Coolant Temp": 195, // °F
  RPM: 2200,
  "Oil Pressure": 40, // psi
  "Battery Voltage": 12.6, // V
};

function formatRelativeTime(timestamp) {
  if (!timestamp) return "—";
  const then = new Date(timestamp).getTime();
  if (Number.isNaN(then)) return "—";

  const diffMs = Date.now() - then;
  const diffMin = Math.round(diffMs / 60000);

  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin} min${diffMin === 1 ? "" : "s"} ago`;

  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hr${diffHr === 1 ? "" : "s"} ago`;

  const diffDay = Math.round(diffHr / 24);
  return `${diffDay} day${diffDay === 1 ? "" : "s"} ago`;
}

function toIsoDateString(date) {
  return date.toISOString().slice(0, 10);
}

// CRITICAL BUG FIX: `fact_telemetry.time_id` is an integer (an intraday
// sequence/offset, not a date) and must never be used in a date
// comparison — `.gte('time_id', '2026-09-18...')` against an integer
// column silently misbehaves. All time-series filtering here uses
// `date_id`, which is the actual date-typed/ISO-text column.
function resolveStartDate(dateRange) {
  const now = new Date();
  const start = new Date(now);
  switch (dateRange) {
    case "Today":
      start.setHours(0, 0, 0, 0);
      return start;
    case "Last 7 Days":
      start.setDate(now.getDate() - 7);
      return start;
    case "Last 30 Days":
      start.setDate(now.getDate() - 30);
      return start;
    case "Last 90 Days":
      start.setDate(now.getDate() - 90);
      return start;
    case "Year to Date":
      start.setMonth(0, 1);
      start.setHours(0, 0, 0, 0);
      return start;
    default:
      return null;
  }
}

function sevenDaysAgoIsoDate() {
  return toIsoDateString(new Date(Date.now() - SEVEN_DAYS_MS));
}

/**
 * useDiagnosticsData
 * -------------------
 * Dual-mode data hook for Module 2.
 *
 *  - Fleet Mode (`selectedVin` is null): fleet-wide telemetry + health,
 *    scoped by `region` and `dateRange`.
 *  - Asset Mode (`selectedVin` is set): single-vehicle telemetry (last 7
 *    days, via `date_id`) + latest health record, scoped by `vehicle_id`.
 *
 * Pass the current Zustand filter values in directly rather than reading
 * the store inside the hook, so it stays easy to test and reuse.
 */
export function useDiagnosticsData({ selectedVin, region, dateRange }) {
  const mode = selectedVin ? "asset" : "fleet";

  const [telemetry, setTelemetry] = useState([]);
  const [healthRows, setHealthRows] = useState([]); // fleet mode: many rows
  const [healthRecord, setHealthRecord] = useState(null); // asset mode: latest row
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isMounted = true;

    async function fetchFleetData() {
      const startDate = resolveStartDate(dateRange);
      const startDateStr = startDate ? toIsoDateString(startDate) : null;

      // ---- fact_telemetry: fleet-wide, scoped by dateRange ----
      let telemetryQuery = supabase
        .from("fact_telemetry")
        .select("z_score, mahalanobis_score, signal_type, date_id");

      if (startDateStr) {
        telemetryQuery = telemetryQuery.gte("date_id", startDateStr);
      }

      // ---- fact_vehicle_health: fleet-wide, scoped by region via
      // dim_vehicle -> dim_location. Assumes dim_vehicle has a FK into
      // dim_location and dim_location carries region_id — adjust the
      // embedded path if your schema names these differently. ----
      let healthQuery = supabase
        .from("fact_vehicle_health")
        .select(
          `remaining_useful_life, active_dtcs,
           dim_vehicle!inner ( vin, dim_location!inner ( region_id ) )`
        );

      if (region && region !== "All Regions") {
        healthQuery = healthQuery.eq("dim_vehicle.dim_location.region_id", region);
      }

      const [telemetryRes, healthRes] = await Promise.all([
        telemetryQuery,
        healthQuery,
      ]);

      if (telemetryRes.error) throw telemetryRes.error;
      if (healthRes.error) throw healthRes.error;

      if (isMounted) {
        setTelemetry(telemetryRes.data ?? []);
        setHealthRows(healthRes.data ?? []);
        setHealthRecord(null);
      }
    }

    async function fetchAssetData() {
      // Chart 3 is described as a 7-day playback, so telemetry is scoped
      // to the last 7 days via `date_id` regardless of the global
      // dateRange filter (Asset Mode is meant to show recent behavior
      // for the specific truck being inspected).
      const cutoff = sevenDaysAgoIsoDate();

      let telemetryQuery = supabase
        .from("fact_telemetry")
        .select("signal_type, signal_value, z_score, date_id")
        .eq("vehicle_id", selectedVin)
        .gte("date_id", cutoff)
        .order("date_id", { ascending: true });

      let healthQuery = supabase
        .from("fact_vehicle_health")
        .select(
          "failure_probability, remaining_useful_life, active_dtcs, ai_prescriptive_action, timestamp"
        )
        .eq("vehicle_id", selectedVin)
        .order("timestamp", { ascending: false })
        .limit(1);

      const [telemetryRes, healthRes] = await Promise.all([
        telemetryQuery,
        healthQuery,
      ]);

      if (telemetryRes.error) throw telemetryRes.error;
      if (healthRes.error) throw healthRes.error;

      if (isMounted) {
        setTelemetry(telemetryRes.data ?? []);
        setHealthRows([]);
        setHealthRecord(healthRes.data?.[0] ?? null);
      }
    }

    async function fetchData() {
      setLoading(true);
      setError(null);
      try {
        if (mode === "fleet") {
          await fetchFleetData();
        } else {
          await fetchAssetData();
        }
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
  }, [mode, selectedVin, region, dateRange]);

  // ==================== Fleet Mode derived data ====================

  const fleetKpis = useMemo(() => {
    const validSignals = telemetry.filter(
      (t) => t.z_score !== null && t.z_score !== undefined
    ).length;
    const telematicsHealthPct =
      telemetry.length > 0 ? (validSignals / telemetry.length) * 100 : 0;

    const rulValues = healthRows
      .map((r) => Number(r.remaining_useful_life))
      .filter((v) => !Number.isNaN(v));
    const avgFleetRul =
      rulValues.length > 0
        ? rulValues.reduce((sum, v) => sum + v, 0) / rulValues.length
        : 0;

    const activeCriticalAnomalies = telemetry.filter(
      (t) => Number(t.z_score) > CRITICAL_Z_SCORE_THRESHOLD
    ).length;

    const totalFleetDtcs = healthRows.reduce((sum, r) => {
      const dtcs = Array.isArray(r.active_dtcs) ? r.active_dtcs : [];
      return sum + dtcs.length;
    }, 0);

    return { telematicsHealthPct, avgFleetRul, activeCriticalAnomalies, totalFleetDtcs };
  }, [telemetry, healthRows]);

  // Chart 1: Fleet Multivariate Anomaly Scatter
  const anomalyScatter = useMemo(
    () =>
      telemetry
        .filter(
          (t) => t.mahalanobis_score !== null && t.mahalanobis_score !== undefined
        )
        .map((t) => ({
          date: t.date_id,
          mahalanobisScore: Number(t.mahalanobis_score),
        })),
    [telemetry]
  );

  // Chart 2: Signal Deviation by signal_type
  const signalDeviation = useMemo(() => {
    const bySignal = new Map();
    for (const t of telemetry) {
      const z = Number(t.z_score);
      if (Number.isNaN(z) || !t.signal_type) continue;
      const entry = bySignal.get(t.signal_type) ?? { sum: 0, count: 0 };
      entry.sum += z;
      entry.count += 1;
      bySignal.set(t.signal_type, entry);
    }
    return Array.from(bySignal.entries()).map(([signal, { sum, count }]) => ({
      signal,
      avgZScore: count > 0 ? sum / count : 0,
    }));
  }, [telemetry]);

  // ==================== Asset Mode derived data ====================

  const assetKpis = useMemo(() => {
    if (!healthRecord) {
      return {
        riskScorePct: null,
        remainingUsefulLife: null,
        activeCriticalDtcCount: 0,
        lastSyncLabel: "—",
      };
    }

    const raw = Number(healthRecord.failure_probability);
    const riskScorePct = Number.isNaN(raw) ? null : raw <= 1 ? raw * 100 : raw;

    const dtcs = Array.isArray(healthRecord.active_dtcs) ? healthRecord.active_dtcs : [];
    const activeCriticalDtcCount = dtcs.filter((d) => d?.severity === "Critical").length;

    return {
      riskScorePct,
      remainingUsefulLife: healthRecord.remaining_useful_life,
      activeCriticalDtcCount,
      lastSyncLabel: formatRelativeTime(healthRecord.timestamp),
    };
  }, [healthRecord]);

  const assetStatus = useMemo(() => {
    if (assetKpis.riskScorePct === null) return "Unknown";
    if (assetKpis.riskScorePct > 80) return "Critical";
    if (assetKpis.riskScorePct >= 50) return "Warning";
    return "Healthy";
  }, [assetKpis.riskScorePct]);

  // Chart 3: Historical Telemetry Playback — one point per date_id,
  // averaging across whatever signal types were recorded that day.
  const telemetryPlayback = useMemo(() => {
    const byDate = new Map();

    for (const row of telemetry) {
      const key = row.date_id;
      if (!key) continue;
      const entry =
        byDate.get(key) ?? { date: key, valueSum: 0, valueCount: 0, zSum: 0, zCount: 0 };

      const val = Number(row.signal_value);
      if (!Number.isNaN(val)) {
        entry.valueSum += val;
        entry.valueCount += 1;
      }

      const z = Number(row.z_score);
      if (!Number.isNaN(z)) {
        entry.zSum += z;
        entry.zCount += 1;
      }

      byDate.set(key, entry);
    }

    return Array.from(byDate.values())
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
      .map((e) => ({
        date: e.date,
        signalValue: e.valueCount > 0 ? e.valueSum / e.valueCount : null,
        zScore: e.zCount > 0 ? e.zSum / e.zCount : null,
      }));
  }, [telemetry]);

  // Chart 4: Subsystem Baseline Deviation — latest reading per known
  // signal type vs. the hardcoded fleet baseline.
  const subsystemDeviation = useMemo(() => {
    const latestBySignal = new Map();
    for (const row of telemetry) {
      latestBySignal.set(row.signal_type, Number(row.signal_value));
    }

    return Object.entries(FLEET_BASELINE).map(([signal, baseline]) => ({
      signal,
      vehicle: latestBySignal.has(signal) ? latestBySignal.get(signal) : null,
      baseline,
    }));
  }, [telemetry]);

  return {
    mode,
    loading,
    error,
    // Fleet Mode
    fleetKpis,
    anomalyScatter,
    signalDeviation,
    // Asset Mode
    healthRecord,
    assetKpis,
    assetStatus,
    telemetryPlayback,
    subsystemDeviation,
  };
}