import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useFilterStore } from "../store/useFilterStore";

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

function toIsoDateString(date) {
  return date.toISOString().slice(0, 10);
}

export function useOverviewData() {
  const dateRange = useFilterStore((s) => s.dateRange);
  const region = useFilterStore((s) => s.region);

  const [telemetry, setTelemetry] = useState([]);
  const [claims, setClaims] = useState([]);
  const [dataQuality, setDataQuality] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isMounted = true;

    async function fetchData() {
      setLoading(true);
      setError(null);

      const startDate = resolveStartDate(dateRange);
      const startDateStr = startDate ? toIsoDateString(startDate) : null;

      try {
        // ---- Query 1: fact_telemetry ----
        let telemetryQuery = supabase
          .from("fact_telemetry")
          .select("telemetry_id, z_score, signal_type, date_id");

        if (startDateStr) {
          telemetryQuery = telemetryQuery.gte("date_id", startDateStr);
        }

        // ---- Query 2: fact_warranty_claims (Nested inner join for region) ----
        let claimsQuery = supabase
          .from("fact_warranty_claims")
          .select(
            `ai_risk_score, mileage_at_failure, submission_date, status, part_id,
             dim_vehicle!inner ( 
               vin, 
               dim_location!inner ( region_id ) 
             )`
          );

        if (startDateStr) {
          claimsQuery = claimsQuery.gte("submission_date", startDateStr);
        }

        if (region && region !== "All Regions") {
          claimsQuery = claimsQuery.eq("dim_vehicle.dim_location.region_id", region);
        }

        // ---- Query 3: fact_data_quality ----
        let dqQuery = supabase
          .from("fact_data_quality")
          .select("total_expected_packets, valid_packets_received, date_id");
          
        if (startDateStr) {
          dqQuery = dqQuery.gte("date_id", startDateStr);
        }

        const [telemetryRes, claimsRes, dqRes] = await Promise.all([
          telemetryQuery,
          claimsQuery,
          dqQuery
        ]);

        if (telemetryRes.error) throw telemetryRes.error;
        if (claimsRes.error) throw claimsRes.error;
        if (dqRes.error) throw dqRes.error;

        if (isMounted) {
          setTelemetry(telemetryRes.data ?? []);
          setClaims(claimsRes.data ?? []);
          setDataQuality(dqRes.data ?? []);
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
  }, [dateRange, region]);

  // ---- KPI aggregation (Section A) ----
  const kpis = useMemo(() => {
    // 1. Data Quality Trust Score — (Valid / Expected) * 100
    let totalExpected = 0;
    let totalValid = 0;
    for (const dq of dataQuality) {
      totalExpected += Number(dq.total_expected_packets) || 0;
      totalValid += Number(dq.valid_packets_received) || 0;
    }
    const trustScore = totalExpected > 0 ? (totalValid / totalExpected) * 100 : 0;

    // 2. Active High-Risk Vehicles — distinct VINs with ai_risk_score > 80
    const highRiskVins = new Set(
      claims
        .filter((c) => Number(c.ai_risk_score) > 80)
        .map((c) => c.dim_vehicle?.vin)
        .filter(Boolean)
    );

    // 3. Avg Fleet Daily Utilization
    const mileageValues = claims
      .map((c) => Number(c.mileage_at_failure))
      .filter((v) => !Number.isNaN(v));
    const avgUtilization =
      mileageValues.length > 0
        ? mileageValues.reduce((sum, v) => sum + v, 0) / mileageValues.length
        : 0;

    // 4. Top Anomalous Signal
    let topSignal = null;
    let topAbsZ = -Infinity;
    for (const t of telemetry) {
      const z = Number(t.z_score);
      if (!Number.isNaN(z) && Math.abs(z) > topAbsZ) {
        topAbsZ = Math.abs(z);
        topSignal = t.signal_type;
      }
    }

    // 5. Total Telemetry Events
    const totalEvents = telemetry.length;

    return {
      trustScore,
      highRiskVehicleCount: highRiskVins.size,
      avgUtilization,
      topSignal,
      totalEvents,
    };
  }, [telemetry, claims, dataQuality]);

  // ---- Chart data (Section B) ----
  const healthDistribution = useMemo(() => {
    let critical = 0;
    let warning = 0;
    let healthy = 0;

    for (const c of claims) {
      const score = Number(c.ai_risk_score);
      if (Number.isNaN(score)) continue;
      if (score > 80) critical += 1;
      else if (score >= 50) warning += 1;
      else healthy += 1;
    }

    return [
      { name: "Critical", value: critical, color: "#e11d48" },
      { name: "Warning", value: warning, color: "#eab308" },
      { name: "Healthy", value: healthy, color: "#22c55e" },
    ];
  }, [claims]);

  const alertVolumeTrend = useMemo(() => {
    const byDate = new Map();

    for (const c of claims) {
      const score = Number(c.ai_risk_score);
      if (Number.isNaN(score) || score <= 80) continue;

      const raw = c.submission_date;
      if (!raw) continue;

      const parsed = new Date(raw);
      const key = Number.isNaN(parsed.getTime())
        ? String(raw).slice(0, 10)
        : toIsoDateString(parsed);

      byDate.set(key, (byDate.get(key) ?? 0) + 1);
    }

    return Array.from(byDate.entries())
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([date, count]) => ({ date, count }));
  }, [claims]);

  // ---- Table rows (Section C) ----
  const highRiskVehicles = useMemo(
    () =>
      claims
        .filter((c) => Number(c.ai_risk_score) > 80)
        .map((c) => ({
          vin: c.dim_vehicle?.vin ?? "—",
          region: c.dim_vehicle?.dim_location?.region_id ?? "—",
          partId: c.part_id,
          aiRiskScore: c.ai_risk_score,
          status: c.status,
        })),
    [claims]
  );

  return {
    loading,
    error,
    kpis,
    healthDistribution,
    alertVolumeTrend,
    highRiskVehicles,
  };
}