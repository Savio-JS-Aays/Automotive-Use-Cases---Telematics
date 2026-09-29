import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";

export const FLEET_MAHALANOBIS_THRESHOLD = 3;
export const CRITICAL_Z_SCORE_THRESHOLD = 3;

const FLEET_BASELINE = {
  "Coolant Temp": 195, 
  RPM: 2200,
  "Oil Pressure": 40, 
  "Battery Voltage": 12.6, 
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

export function useDiagnosticsData({ selectedVin, region, dateRange }) {
  const mode = selectedVin ? "asset" : "fleet";

  const [telemetry, setTelemetry] = useState([]);
  const [healthRows, setHealthRows] = useState([]); 
  const [healthRecord, setHealthRecord] = useState(null); 
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isMounted = true;

    async function fetchFleetData() {
      const startDate = resolveStartDate(dateRange);
      const startDateStr = startDate ? toIsoDateString(startDate) : null;

      let telemetryQuery = supabase
        .from("fact_telemetry")
        .select("vehicle_id, z_score, mahalanobis_score, signal_type, signal_value, date_id");

      if (startDateStr) {
        telemetryQuery = telemetryQuery.gte("date_id", startDateStr);
      }

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
      // FIX: Fetch latest 200 records regardless of date to ensure charts are never empty
      let telemetryQuery = supabase
        .from("fact_telemetry")
        .select("signal_type, signal_value, z_score, date_id")
        .eq("vehicle_id", selectedVin)
        .order("date_id", { ascending: false })
        .limit(200);

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
        // Reverse so time flows left-to-right in charts
        setTelemetry((telemetryRes.data ?? []).reverse());
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
    const validSignals = telemetry.filter((t) => t.z_score !== null && t.z_score !== undefined).length;
    const telematicsHealthPct = telemetry.length > 0 ? (validSignals / telemetry.length) * 100 : 0;

    const rulValues = healthRows.map((r) => Number(r.remaining_useful_life)).filter((v) => !Number.isNaN(v));
    const avgFleetRul = rulValues.length > 0 ? rulValues.reduce((sum, v) => sum + v, 0) / rulValues.length : 0;

    const activeCriticalAnomalies = telemetry.filter((t) => Number(t.z_score) > CRITICAL_Z_SCORE_THRESHOLD).length;

    const totalFleetDtcs = healthRows.reduce((sum, r) => {
      const dtcs = Array.isArray(r.active_dtcs) ? r.active_dtcs : [];
      return sum + dtcs.length;
    }, 0);

    return { telematicsHealthPct, avgFleetRul, activeCriticalAnomalies, totalFleetDtcs };
  }, [telemetry, healthRows]);

  const anomalyScatter = useMemo(() =>
      telemetry
        .filter((t) => t.mahalanobis_score !== null && t.mahalanobis_score !== undefined)
        .map((t) => ({ date: t.date_id, mahalanobisScore: Number(t.mahalanobis_score) })),
    [telemetry]
  );

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

  const fleetSignalAverages = useMemo(() => {
    const bySignal = new Map();
    for (const t of telemetry) {
      const val = Number(t.signal_value);
      if (Number.isNaN(val) || !t.signal_type) continue;
      const entry = bySignal.get(t.signal_type) ?? { sum: 0, count: 0 };
      entry.sum += val;
      entry.count += 1;
      bySignal.set(t.signal_type, entry);
    }
    return Array.from(bySignal.entries()).map(([signal, { sum, count }]) => ({
      signal,
      avgValue: count > 0 ? sum / count : 0,
    })).sort((a, b) => b.avgValue - a.avgValue);
  }, [telemetry]);

  const vehicleTableData = useMemo(() => {
    const byVehicle = new Map();
    for (const t of telemetry) {
      if (!t.vehicle_id) continue;
      const entry = byVehicle.get(t.vehicle_id) ?? { vehicleId: t.vehicle_id, totalSignals: 0, anomalies: 0, zSum: 0, zCount: 0 };
      entry.totalSignals += 1;
      const z = Number(t.z_score);
      if (!Number.isNaN(z)) {
        if (z > CRITICAL_Z_SCORE_THRESHOLD) entry.anomalies += 1;
        entry.zSum += Math.abs(z);
        entry.zCount += 1;
      }
      byVehicle.set(t.vehicle_id, entry);
    }
    return Array.from(byVehicle.values()).map(v => ({
      vin: v.vehicleId,
      totalSignals: v.totalSignals,
      deviations: v.anomalies,
      avgZScore: v.zCount > 0 ? (v.zSum / v.zCount).toFixed(2) : "0.00"
    })).sort((a, b) => b.deviations - a.deviations);
  }, [telemetry]);


  // ==================== Asset Mode derived data ====================

  const assetKpis = useMemo(() => {
    if (!healthRecord) {
      return { riskScorePct: null, remainingUsefulLife: null, activeCriticalDtcCount: 0, lastSyncLabel: "—" };
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

  const telemetryPlayback = useMemo(() => {
    const byDate = new Map();
    for (const row of telemetry) {
      const key = row.date_id;
      if (!key) continue;
      const entry = byDate.get(key) ?? { date: key, valueSum: 0, valueCount: 0, zSum: 0, zCount: 0 };

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
      .map((e) => ({
        date: e.date,
        signalValue: e.valueCount > 0 ? e.valueSum / e.valueCount : null,
        zScore: e.zCount > 0 ? e.zSum / e.zCount : null,
      }));
  }, [telemetry]);

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

  const signalDistribution = useMemo(() => {
    const bySignal = new Map();
    for (const row of telemetry) {
      if (!row.signal_type) continue;
      bySignal.set(row.signal_type, (bySignal.get(row.signal_type) || 0) + 1);
    }
    return Array.from(bySignal.entries()).map(([name, value]) => ({ name, value }));
  }, [telemetry]);

  return {
    mode, loading, error,
    fleetKpis, anomalyScatter, signalDeviation, fleetSignalAverages, vehicleTableData,
    healthRecord, assetKpis, assetStatus, telemetryPlayback, subsystemDeviation, signalDistribution
  };
}