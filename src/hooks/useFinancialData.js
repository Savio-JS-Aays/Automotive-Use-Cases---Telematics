import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useFilterStore } from '../store/useFilterStore';

const PAGE_SIZE = 1000;
const SAVINGS_RATE = 0.6; 
const HORIZON_DAYS = 90;
const INR_TO_USD = 0.012; // Force conversion from raw INR to USD

const SIGNAL_MAPPING = {
  'Powertrain': 'RPM & Engine Load',
  'Electrical': 'Battery Voltage',
  'Chassis': 'Vibration & Alignment',
  'Cooling': 'Coolant Temperature',
  'Brakes': 'Brake Pressure',
};

const one = (v) => (Array.isArray(v) ? v[0] : v) ?? null;
const hasRegion = (region) => Boolean(region) && region !== 'All Regions';
const hasModel = (model) => Boolean(model) && model !== 'All Models';

async function fetchAll(buildQuery) {
  const rows = [];
  let from = 0;
  while (true) {
    const { data, error } = await buildQuery().range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return rows;
}

function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildCumulativeCurve(total) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  const rand = seededRandom(Math.round(total) || 1);
  const weights = Array.from({ length: HORIZON_DAYS }, (_, i) => {
    const jitter = 0.7 + rand() * 0.6;
    const ramp = 1 + (i / HORIZON_DAYS) * 0.5;
    return jitter * ramp;
  });
  const weightSum = weights.reduce((s, w) => s + w, 0) || 1;

  let running = 0;
  return weights.map((w, i) => {
    running += (total * w) / weightSum;
    const d = new Date(start);
    d.setDate(start.getDate() + i + 1);
    return {
      date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      cumulative: Math.round(running),
    };
  });
}

export function useFinancialData() {
  const region = useFilterStore((s) => s.region);
  const vehicleModel = useFilterStore((s) => s.vehicleModel);

  const [claims, setClaims] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const claimsPromise = fetchAll(() => {
          let q = supabase.from('fact_warranty_claims').select(
            `
              claim_amount,
              dim_part!inner ( vehicle_subsystem ),
              dim_supplier!inner ( supplier_name ),
              dim_vehicle!inner ( model_id, dim_location!inner ( region_id ) )
            `
          );
          if (hasRegion(region)) {
            q = q.eq('dim_vehicle.dim_location.region_id', region);
          }
          if (hasModel(vehicleModel)) {
            q = q.eq('dim_vehicle.model_id', vehicleModel);
          }
          return q;
        });

        const inventoryPromise = fetchAll(() => {
          let q = supabase.from('fact_part_inventory').select(
            `
              forecasted_90d_demand,
              dim_part!inner ( part_name, unit_cost, vehicle_subsystem ),
              dim_location!inner ( region_id )
            `
          );
          if (hasRegion(region)) {
            q = q.eq('dim_location.region_id', region);
          }
          return q;
        });

        const [claimRows, inventoryRows] = await Promise.all([
          claimsPromise,
          inventoryPromise,
        ]);

        if (!cancelled) {
          setClaims(claimRows);
          setInventory(inventoryRows);
        }
      } catch (err) {
        if (!cancelled) {
          console.error('useFinancialData:', err);
          setError(err);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [region, vehicleModel]);

  const metrics = useMemo(() => {
    const byPart = new Map();
    const bySignal = new Map();
    let totalProjectedExposure = 0;

    for (const r of inventory) {
      const part = one(r.dim_part);
      const name = part?.part_name ?? 'Unknown component';
      const subsystem = part?.vehicle_subsystem ?? 'Powertrain';
      const signal = SIGNAL_MAPPING[subsystem] || 'Vibration & Load';
      
      const unitCost = (Number(part?.unit_cost) || 0) * INR_TO_USD;
      const demand = Number(r.forecasted_90d_demand) || 0;
      const exposure = demand * unitCost;

      totalProjectedExposure += exposure;

      const cur = byPart.get(name) ?? {
        id: name,
        component: name,
        demand: 0,
        unitCost,
        totalExposure: 0,
      };
      cur.demand += demand;
      cur.totalExposure += exposure;
      byPart.set(name, cur);

      bySignal.set(signal, (bySignal.get(signal) || 0) + exposure);
    }

    const tableData = Array.from(byPart.values()).sort((a, b) => b.totalExposure - a.totalExposure);

    const topCostComponents = tableData.slice(0, 5).map((p) => ({
      name: p.component, 
      exposure: Math.round(p.totalExposure),
    }));

    const telematicsCostRisk = Array.from(bySignal.entries())
      .map(([signal, cost]) => ({ signal, cost: Math.round(cost) }))
      .sort((a, b) => b.cost - a.cost)
      .slice(0, 5);

    const preventableSavings = totalProjectedExposure * SAVINGS_RATE;

    let claimTotal = 0;
    const bySupplier = new Map();
    const bySubsystem = new Map();

    for (const c of claims) {
      const amount = (Number(c.claim_amount) || 0) * INR_TO_USD;
      const supplier = one(c.dim_supplier)?.supplier_name ?? 'Unknown supplier';
      const subsystem = one(c.dim_part)?.vehicle_subsystem ?? 'Unknown';

      claimTotal += amount;
      bySupplier.set(supplier, (bySupplier.get(supplier) ?? 0) + amount);
      bySubsystem.set(subsystem, (bySubsystem.get(subsystem) ?? 0) + amount);
    }

    const avgCostPerBreakdown = claims.length ? claimTotal / claims.length : 0;

    let highestCostSupplier = null;
    for (const [name, total] of bySupplier) {
      if (!highestCostSupplier || total > highestCostSupplier.total) {
        highestCostSupplier = { name, total };
      }
    }

    const subsystemData = Array.from(bySubsystem, ([name, value]) => ({
      name,
      value: Math.round(value),
    })).sort((a, b) => b.value - a.value);

    const cumulativeData = totalProjectedExposure > 0 ? buildCumulativeCurve(totalProjectedExposure) : [];

    return {
      totalProjectedExposure,
      preventableSavings,
      avgCostPerBreakdown,
      highestCostSupplier,
      subsystemData,
      cumulativeData,
      tableData,
      topCostComponents,
      telematicsCostRisk,
    };
  }, [claims, inventory]);

  return { ...metrics, loading, error };
}