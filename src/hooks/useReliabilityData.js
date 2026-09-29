import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useFilterStore } from "../store/useFilterStore";

const PAGE_SIZE = 1000;
const BIN_WIDTH = 10000;
const MAX_BINS = 60;
const MIN_SAMPLE = 5; // Kept only to filter noise out of the "Worst Variance" KPI card

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

function percentile(values, p) {
  const sorted = values
    .map(Number)
    .filter((v) => !Number.isNaN(v))
    .sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function formatBinLabel(miles) {
  return `${Math.round(miles / 1000)}k`;
}

function buildBinEdges(maxMileage) {
  const count = Math.min(MAX_BINS, Math.max(1, Math.ceil(maxMileage / BIN_WIDTH)));
  return Array.from({ length: count }, (_, i) => (i + 1) * BIN_WIDTH);
}

export function useReliabilityData() {
  const region = useFilterStore((s) => s.region);
  const vehicleModel = useFilterStore((s) => s.vehicleModel);

  const [claims, setClaims] = useState([]);
  const [healthRows, setHealthRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isMounted = true;

    const applyFilters = (query) => {
      let q = query;
      if (region && region !== "All Regions") {
        q = q.eq("dim_vehicle.dim_location.region_id", region);
      }
      if (vehicleModel && vehicleModel !== "All Models") {
        q = q.eq("dim_vehicle.model_id", vehicleModel);
      }
      return q;
    };

    async function fetchData() {
      setLoading(true);
      setError(null);

      try {
        const claimsPromise = fetchAllRows(() =>
          applyFilters(
            supabase.from("fact_warranty_claims").select(
              `mileage_at_failure, part_id, supplier_id,
               dim_part!inner ( part_name, b10_design_life_miles ),
               dim_supplier!inner ( supplier_name ),
               dim_vehicle!inner ( model_id, dim_location!inner ( region_id ) )`
            )
          )
        );

        const healthPromise = fetchAllRows(() =>
          applyFilters(
            supabase.from("fact_vehicle_health").select(
              `remaining_useful_life, part_id,
               dim_vehicle!inner ( model_id, dim_location!inner ( region_id ) )`
            )
          )
        );

        const [claimRows, healthData] = await Promise.all([claimsPromise, healthPromise]);

        if (isMounted) {
          setClaims(claimRows);
          setHealthRows(healthData);
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
  }, [region, vehicleModel]);

  const failures = useMemo(
    () =>
      claims
        .map((c) => ({
          mileage: Number(c.mileage_at_failure),
          partName: c.dim_part?.part_name ?? "Unknown part",
          designB10: Number(c.dim_part?.b10_design_life_miles),
          supplierName: c.dim_supplier?.supplier_name ?? "Unknown supplier",
        }))
        .filter((f) => !Number.isNaN(f.mileage)),
    [claims]
  );

  const componentTable = useMemo(() => {
    const groups = new Map();
    for (const f of failures) {
      const key = `${f.partName}||${f.supplierName}`;
      const g = groups.get(key) ?? {
        partName: f.partName,
        supplierName: f.supplierName,
        designB10: f.designB10,
        mileages: [],
      };
      g.mileages.push(f.mileage);
      groups.set(key, g);
    }

    return Array.from(groups.values())
      .map((g) => {
        const actualB10 = percentile(g.mileages, 0.1);
        const designB10 = Number.isNaN(g.designB10) ? null : g.designB10;
        const variance =
          actualB10 !== null && designB10 !== null ? actualB10 - designB10 : null;
        const claimCount = g.mileages.length;

        // FIXED LOGIC: Removed MIN_SAMPLE strict cutoff for hazardStatus
        let hazardStatus = "On Spec";
        if (variance === null) {
          hazardStatus = "Insufficient Data";
        } else if (variance < -0.2 * designB10) {
          hazardStatus = "Critical";
        } else if (variance < 0) {
          hazardStatus = "Watch";
        }

        return {
          partName: g.partName,
          supplierName: g.supplierName,
          designB10,
          actualB10,
          variance,
          claimCount,
          hazardStatus,
        };
      })
      .sort((a, b) => (a.variance ?? Infinity) - (b.variance ?? Infinity));
  }, [failures]);

  const kpis = useMemo(() => {
    const rul = healthRows
      .map((r) => Number(r.remaining_useful_life))
      .filter((v) => !Number.isNaN(v));
    const fleetAvgRul = rul.length > 0 ? rul.reduce((s, v) => s + v, 0) / rul.length : null;

    const actualB10 = percentile(failures.map((f) => f.mileage), 0.1);

    const countsByPart = new Map();
    for (const f of failures) {
      countsByPart.set(f.partName, (countsByPart.get(f.partName) ?? 0) + 1);
    }
    let topFailing = null;
    for (const [name, count] of countsByPart) {
      if (!topFailing || count > topFailing.count) topFailing = { name, count };
    }

    const eligible = componentTable.filter((r) => r.variance !== null);
    const trusted = eligible.filter((r) => r.claimCount >= MIN_SAMPLE);
    const pool = trusted.length > 0 ? trusted : eligible;
    const worstVariance = pool.length > 0 ? pool[0] : null; 

    return { fleetAvgRul, actualB10, topFailing, worstVariance };
  }, [healthRows, failures, componentTable]);

  const survivalCurve = useMemo(() => {
    if (failures.length === 0) return [];
    const mileages = failures.map((f) => f.mileage);
    const edges = buildBinEdges(Math.max(...mileages));
    const total = mileages.length;

    return [
      { mileage: 0, label: "0", survival: 100 },
      ...edges.map((edge) => {
        const failedByEdge = mileages.filter((m) => m <= edge).length;
        return {
          mileage: edge,
          label: formatBinLabel(edge),
          survival: (1 - failedByEdge / total) * 100,
        };
      }),
    ];
  }, [failures]);

  const weibull = useMemo(() => {
    if (failures.length === 0) return { rows: [], suppliers: [] };

    const bySupplier = new Map();
    for (const f of failures) {
      const list = bySupplier.get(f.supplierName) ?? [];
      list.push(f.mileage);
      bySupplier.set(f.supplierName, list);
    }

    const suppliers = Array.from(bySupplier.keys());
    const edges = buildBinEdges(Math.max(...failures.map((f) => f.mileage)));

    const rows = edges.map((edge) => {
      const row = { mileage: edge };
      for (const [supplier, mileages] of bySupplier) {
        const failedByEdge = mileages.filter((m) => m <= edge).length;
        row[supplier] = (failedByEdge / mileages.length) * 100;
      }
      return row;
    });

    return { rows, suppliers };
  }, [failures]);

  return {
    loading,
    error,
    kpis,
    survivalCurve,
    weibullRows: weibull.rows,
    weibullSuppliers: weibull.suppliers,
    componentTable,
  };
}