import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useFilterStore } from "../store/useFilterStore";

const PAGE_SIZE = 1000; // PostgREST's default max rows per response
const PAGE_CONCURRENCY = 6;
const DATA_SOURCE_TAG = "telematics_sim";

/**
 * Fetches every row of a filtered query. Counts first, then pulls the pages in parallel
 * (6 at a time). `apply` must add an ORDER BY on a unique key so pages don't overlap.
 */
async function fetchAllRows(table, columns, apply) {
  const head = await apply(supabase.from(table).select(columns, { count: "exact", head: true }));
  if (head.error) throw head.error;
  const pages = Math.ceil((head.count ?? 0) / PAGE_SIZE);
  const results = new Array(pages);
  let next = 0;
  async function worker() {
    while (next < pages) {
      const page = next++;
      const { data, error } = await apply(supabase.from(table).select(columns)).range(
        page * PAGE_SIZE,
        page * PAGE_SIZE + PAGE_SIZE - 1
      );
      if (error) throw error;
      results[page] = data ?? [];
    }
  }
  await Promise.all(Array.from({ length: Math.min(PAGE_CONCURRENCY, pages) }, worker));
  return results.flat();
}

const VEHICLE_COLUMNS = `vehicle_id, vin, model_id, model_label, region_id, region_name, powertrain,
  application_id, application_name, customer_type, production_date, in_service_date`;

const REPLACEMENT_COLUMNS = `replacement_id, ro_id, vehicle_id, part_id, supplier_id, date_id,
  odometer_km_at_failure, vehicle_age_days, failure_mode, visit_type, was_predicted, dtc_event_id,
  in_warranty, part_cost_inr`;

const EMPTY = {
  vehicles: [],
  replacements: [],
  parts: [],
  suppliers: [],
  odometer: [],
  repairOrders: [],
  dtcEvents: [],
  bridge: [],
  precursor: [],
  latestDate: null,
  windowStart: null,
};

/**
 * useReliabilityData
 * ------------------
 * Component Reliability (quality-engineer view). Lifetime data: every part replacement of the
 * connected trucks in scope since they entered service, plus each truck's current odometer
 * (censoring). The global date range does not apply. Formulas live in
 * `modules/reliability/reliabilityMetrics.js`; see Documentation/metrics/reliability.md.
 */
export function useReliabilityData() {
  const region = useFilterStore((s) => s.region);
  const vehicleModel = useFilterStore((s) => s.vehicleModel);
  const powertrain = useFilterStore((s) => s.powertrain);
  const application = useFilterStore((s) => s.application);
  const customerType = useFilterStore((s) => s.customerType);

  const [raw, setRaw] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isMounted = true;

    async function fetchData() {
      setLoading(true);
      setError(null);
      try {
        const vehicles = await fetchAllRows("v_vehicle_context", VEHICLE_COLUMNS, (q) => {
          let r = q.eq("is_connected", true).order("vehicle_id");
          if (region !== "All Regions") r = r.eq("region_id", region);
          if (vehicleModel !== "All Models") r = r.eq("model_id", vehicleModel);
          if (powertrain !== "All Powertrains") r = r.eq("powertrain", powertrain);
          if (application !== "All Applications") r = r.eq("application_id", application);
          if (customerType !== "All Customer Types") r = r.eq("customer_type", customerType);
          return r;
        });
        const ids = vehicles.map((v) => v.vehicle_id);
        if (ids.length === 0) {
          if (isMounted) setRaw({ ...EMPTY, vehicles });
          return;
        }

        const [latestRes, firstRes] = await Promise.all([
          supabase.from("fact_vehicle_daily").select("date_id").in("vehicle_id", ids).order("date_id", { ascending: false }).limit(1),
          supabase.from("fact_vehicle_daily").select("date_id").in("vehicle_id", ids).order("date_id", { ascending: true }).limit(1),
        ]);
        if (latestRes.error) throw latestRes.error;
        if (firstRes.error) throw firstRes.error;
        const latestDate = latestRes.data?.[0]?.date_id ?? null;
        const windowStart = firstRes.data?.[0]?.date_id ?? null;

        const [replacements, parts, suppliers, odometer, repairOrders, dtcEvents, bridge, precursor] = await Promise.all([
          fetchAllRows("fact_part_replacement", REPLACEMENT_COLUMNS, (q) => q.in("vehicle_id", ids).order("replacement_id")),
          fetchAllRows("dim_part", "part_id, part_name, part_type, vehicle_subsystem, b10_design_life_miles, unit_cost", (q) => q.order("part_id")),
          fetchAllRows("dim_supplier", "supplier_id, supplier_name, risk_tier", (q) => q.order("supplier_id")),
          latestDate
            ? fetchAllRows("fact_vehicle_daily", "vehicle_id, date_id, odometer_km_end", (q) => q.in("vehicle_id", ids).eq("date_id", latestDate).order("vehicle_id"))
            : Promise.resolve([]),
          fetchAllRows("fact_repair_orders", "ro_id, vehicle_id, visit_type, downtime_hours", (q) =>
            q.eq("data_source", DATA_SOURCE_TAG).in("vehicle_id", ids).neq("visit_type", "planned").order("ro_id")
          ),
          fetchAllRows("fact_dtc_event", "dtc_event_id, vehicle_id, dtc_id, status, resolved_by_ro_id, dim_dtc ( spn_description, fmi )", (q) =>
            q.in("vehicle_id", ids).order("dtc_event_id")
          ),
          fetchAllRows("bridge_dtc_part", "dtc_id, part_id, likelihood", (q) => q.order("dtc_id").order("part_id")),
          fetchAllRows("v_failure_precursor_summary", "replacement_id, vehicle_id, part_id, signal_code, early_mean_abs_z, late_mean_abs_z, max_abs_z, anomalous_days", (q) =>
            q.in("vehicle_id", ids).order("replacement_id").order("signal_code")
          ),
        ]);

        if (isMounted) {
          setRaw({ vehicles, replacements, parts, suppliers, odometer, repairOrders, dtcEvents, bridge, precursor, latestDate, windowStart });
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
  }, [region, vehicleModel, powertrain, application, customerType]);

  return { loading, error, raw };
}

/**
 * usePartPrecursor
 * ----------------
 * Daily signal deviation in the 30 days before each failure of one part (Part View precursor
 * signature). Only replacements inside the telemetry window have rows.
 */
export function usePartPrecursor(partId, vehicleIds) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const idsKey = vehicleIds.join(",");

  useEffect(() => {
    let isMounted = true;
    if (!partId || !idsKey) return undefined;

    async function fetchData() {
      setLoading(true);
      setError(null);
      try {
        const ids = idsKey.split(",");
        const data = await fetchAllRows(
          "v_failure_precursor",
          "replacement_id, vehicle_id, signal_code, days_before, mean_abs_z, anomalous_readings",
          (q) => q.eq("part_id", partId).in("vehicle_id", ids).order("replacement_id").order("signal_code").order("days_before")
        );
        if (isMounted) setRows(data);
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
  }, [partId, idsKey]);

  return { loading, error, rows };
}
