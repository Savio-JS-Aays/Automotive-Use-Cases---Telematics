import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient'; // Ensure this path matches your setup
import { useFilterStore } from '../store/useFilterStore'; // FIXED: Named import

const PAGE_SIZE = 1000;

// Supabase returns to-one embeds as an object, but can return an array
// depending on relationship inference; normalise both.
const one = (v) => (Array.isArray(v) ? v[0] : v) ?? null;

// FIXED: Exact match for the dropdown value
const isAllRegions = (region) => !region || region === 'All Regions';

export function useSupplyChainData() {
  const region = useFilterStore((s) => s.region);

  const [rawData, setRawData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchInventory() {
      setLoading(true);
      setError(null);

      try {
        const rows = [];
        let from = 0;

        // Page through results so large inventories aren't silently truncated
        while (true) {
          let query = supabase
            .from('fact_part_inventory')
            .select(
              `
              quantity,
              forecasted_90d_demand,
              reorder_recommended,
              dim_part!inner ( part_name ),
              dim_location!inner ( location_name, region_id )
            `
            )
            .range(from, from + PAGE_SIZE - 1);

          if (!isAllRegions(region)) {
            query = query.eq('dim_location.region_id', region);
          }

          const { data, error: qError } = await query;
          if (qError) throw qError;

          rows.push(...(data ?? []));
          if (!data || data.length < PAGE_SIZE) break;
          from += PAGE_SIZE;
        }

        if (!cancelled) setRawData(rows);
      } catch (err) {
        if (!cancelled) {
          console.error('useSupplyChainData:', err);
          setError(err);
          setRawData([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchInventory();
    return () => {
      cancelled = true;
    };
  }, [region]);

  const metrics = useMemo(() => {
    const rows = (rawData ?? []).map((r, i) => {
      const part = one(r.dim_part);
      const loc = one(r.dim_location);
      const quantity = Number(r.quantity) || 0;
      const demand = Number(r.forecasted_90d_demand) || 0;

      let urgency = 'Healthy';
      if (quantity === 0 && demand > 0) urgency = 'Critical';
      else if (demand > quantity) urgency = 'Reorder';

      return {
        id: `${part?.part_name ?? 'part'}-${loc?.location_name ?? 'loc'}-${i}`,
        partName: part?.part_name ?? 'Unknown part',
        locationName: loc?.location_name ?? 'Unknown depot',
        quantity,
        demand,
        reorderRecommended: Boolean(r.reorder_recommended),
        reorderQty: Math.max(demand - quantity, 0),
        urgency,
      };
    });

    const totalDemand = rows.reduce((s, r) => s + r.demand, 0);
    const totalOnHand = rows.reduce((s, r) => s + r.quantity, 0);

    const availabilityScore =
      totalDemand > 0 ? Math.min((totalOnHand / totalDemand) * 100, 100) : 100;

    const byLocation = new Map();
    for (const r of rows) {
      const cur = byLocation.get(r.locationName) ?? {
        location_name: r.locationName,
        totalStock: 0,
        totalDemand: 0,
      };
      cur.totalStock += r.quantity;
      cur.totalDemand += r.demand;
      byLocation.set(r.locationName, cur);
    }
    const regionalChartData = Array.from(byLocation.values());

    const depotsInDeficit = regionalChartData.filter(
      (d) => d.totalDemand > d.totalStock
    ).length;

    const stockoutDemand = rows
      .filter((r) => r.quantity === 0)
      .reduce((s, r) => s + r.demand, 0);
    const criticalStockoutRisk =
      totalDemand > 0 ? (stockoutDemand / totalDemand) * 100 : 0;

    const urgencyCounts = { Healthy: 0, Reorder: 0, Critical: 0 };
    rows.forEach((r) => {
      urgencyCounts[r.urgency] += 1;
    });
    
    const urgencyChartData = [
      { name: 'Healthy', value: urgencyCounts.Healthy, color: '#22c55e' },
      { name: 'Reorder Recommended', value: urgencyCounts.Reorder, color: '#eab308' },
      { name: 'Critical Stockout', value: urgencyCounts.Critical, color: '#e11d48' },
    ];

    return {
      totalDemand,
      totalOnHand,
      availabilityScore,
      depotsInDeficit,
      criticalStockoutRisk,
      regionalChartData,
      urgencyChartData,
      tableData: rows,
    };
  }, [rawData]);

  return { ...metrics, loading, error };
}