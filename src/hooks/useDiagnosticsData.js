import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useFilterStore } from "../store/useFilterStore";

const PAGE_SIZE = 1000; // PostgREST's default max rows per response
const PAGE_CONCURRENCY = 6;
const DAY_MS = 24 * 60 * 60 * 1000;
const DATA_SOURCE_TAG = "telematics_sim";
const ROLLING_LOOKBACK_DAYS = 6; // so the first 7-day rolling point of the period is complete
const LEAD_LOOKBACK_DAYS = 30; // anomaly → DTC lead time looks this far back

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

// Local calendar date (date_id is a local IST date); toISOString() would shift it by a day.
function toIsoDateString(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function parseDateId(dateId) {
  const [y, m, d] = dateId.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function shiftDateId(dateId, days) {
  return toIsoDateString(new Date(parseDateId(dateId).getTime() + days * DAY_MS));
}

const RANGE_DAYS = { "Last 7 Days": 7, "Last 30 Days": 30, "Last 90 Days": 90 };

/** The period ends on the latest day with data; prevStart opens an equal-length comparison period. */
function resolvePeriod(dateRange, endDateId) {
  const days = RANGE_DAYS[dateRange] ?? 30;
  const end = endDateId ? parseDateId(endDateId) : new Date();
  end.setHours(0, 0, 0, 0);
  const start = new Date(end.getTime() - (days - 1) * DAY_MS);
  const prevStart = new Date(start.getTime() - days * DAY_MS);
  return {
    days,
    endStr: toIsoDateString(end),
    startStr: toIsoDateString(start),
    prevStartStr: toIsoDateString(prevStart),
  };
}

const VEHICLE_COLUMNS = `vehicle_id, vin, model_id, model_label, region_id, region_name, powertrain,
  application_id, application_name, customer_type, location_id, location_name, telematics_source,
  in_service_date, warranty_end_date, warranty_km_limit, primary_driver_alias`;

const DTC_COLUMNS = `dtc_event_id, vehicle_id, dtc_id, date_id, first_seen_ts, last_seen_ts, cleared_ts,
  status, occurrence_count, lamp_status, odometer_km_at_first, caused_derate, freeze_frame, resolved_by_ro_id,
  dim_dtc ( spn, fmi, spn_description, fmi_description, system, ecu_name, default_lamp, severity_class,
            can_derate, recommended_action )`;

const SIGNAL_COLUMNS = `signal_code, signal_name, unit, category, powertrain, normal_min, normal_max,
  warn_threshold, crit_threshold, direction`;

const MV_COLUMNS = "vehicle_id, date_id, signal_code, avg_value, max_abs_z, mean_abs_z, anomalous_readings, readings";

function scopeQuery(q, filters) {
  let r = q.eq("is_connected", true).order("vehicle_id");
  if (filters.region !== "All Regions") r = r.eq("region_id", filters.region);
  if (filters.vehicleModel !== "All Models") r = r.eq("model_id", filters.vehicleModel);
  if (filters.powertrain !== "All Powertrains") r = r.eq("powertrain", filters.powertrain);
  if (filters.application !== "All Applications") r = r.eq("application_id", filters.application);
  if (filters.customerType !== "All Customer Types") r = r.eq("customer_type", filters.customerType);
  return r;
}

/** Reference data shared by fleet and asset views: fault → part links and parts stock. */
async function fetchPartsReference() {
  const [bridge, inventory] = await Promise.all([
    fetchAllRows("bridge_dtc_part", "dtc_id, part_id, likelihood, dim_part ( part_name )", (q) =>
      q.order("dtc_id").order("part_id")
    ),
    fetchAllRows("fact_part_inventory", "part_inventory_id, part_id, location_id, quantity, inventory_status, dim_location ( region_id )", (q) =>
      q.order("part_inventory_id")
    ),
  ]);
  return { bridge, inventory };
}

const EMPTY_FLEET = { vehicles: [], dtcEvents: [], daily: [], dtcRepairOrders: [], bridge: [], inventory: [], period: null };

/**
 * useDiagnosticsFleetData
 * -----------------------
 * Fleet View of Vehicle Diagnostics (Fault Codes tab + the scope for Signal Health). Scope =
 * connected trucks matching every global filter. DTC events are small (hundreds), so all of the
 * scope's events are loaded and split into NOW / PERIOD by the metric functions in
 * `modules/diagnostics/diagnosticsMetrics.js`. Formulas: Documentation/metrics/diagnostics.md.
 */
export function useDiagnosticsFleetData() {
  const region = useFilterStore((s) => s.region);
  const vehicleModel = useFilterStore((s) => s.vehicleModel);
  const powertrain = useFilterStore((s) => s.powertrain);
  const application = useFilterStore((s) => s.application);
  const customerType = useFilterStore((s) => s.customerType);
  const dateRange = useFilterStore((s) => s.dateRange);

  const [raw, setRaw] = useState(EMPTY_FLEET);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isMounted = true;

    async function fetchData() {
      setLoading(true);
      setError(null);
      try {
        const filters = { region, vehicleModel, powertrain, application, customerType };
        const vehicles = await fetchAllRows("v_vehicle_context", VEHICLE_COLUMNS, (q) => scopeQuery(q, filters));
        const ids = vehicles.map((v) => v.vehicle_id);
        if (ids.length === 0) {
          if (isMounted) setRaw({ ...EMPTY_FLEET, period: resolvePeriod(dateRange, null) });
          return;
        }

        const { data: latest, error: latestErr } = await supabase
          .from("fact_vehicle_daily")
          .select("date_id")
          .in("vehicle_id", ids)
          .order("date_id", { ascending: false })
          .limit(1);
        if (latestErr) throw latestErr;
        const period = resolvePeriod(dateRange, latest?.[0]?.date_id ?? null);

        const [dtcEvents, daily, dtcRepairOrders, reference] = await Promise.all([
          fetchAllRows("fact_dtc_event", DTC_COLUMNS, (q) => q.in("vehicle_id", ids).order("dtc_event_id")),
          fetchAllRows("fact_vehicle_daily", "vehicle_id, date_id, distance_km, odometer_km_end, is_operating, last_ping_ts", (q) =>
            q
              .in("vehicle_id", ids)
              .gte("date_id", shiftDateId(period.prevStartStr, -ROLLING_LOOKBACK_DAYS))
              .lte("date_id", period.endStr)
              .order("vehicle_id")
              .order("date_id")
          ),
          fetchAllRows("fact_repair_orders", "ro_id, vehicle_id, dtc_event_id, visit_type, open_ts", (q) =>
            q.eq("data_source", DATA_SOURCE_TAG).in("vehicle_id", ids).not("dtc_event_id", "is", null).order("ro_id")
          ),
          fetchPartsReference(),
        ]);

        if (isMounted) setRaw({ vehicles, dtcEvents, daily, dtcRepairOrders, ...reference, period });
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
  }, [region, vehicleModel, powertrain, application, customerType, dateRange]);

  return { loading, error, raw };
}

const EMPTY_SIGNALS = { signals: [], rows: [], leadRows: [], key: null };

/**
 * useSignalHealthData
 * -------------------
 * Signal Health tab. Loaded only when the tab is open. Reads the `mv_telemetry_daily`
 * rollup (vehicle × signal × day) for the scope, from 6 days before the period start so the
 * 7-day rolling trend is complete. A second, small query fetches only anomalous days in the
 * 30 days before each DTC of the period (anomaly → DTC lead time).
 */
export function useSignalHealthData(fleetRaw, enabled) {
  const [data, setData] = useState(EMPTY_SIGNALS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const loadedKey = useRef(null);

  const { period, vehicles } = fleetRaw;
  const key = period ? `${period.startStr}|${period.endStr}|${vehicles.map((v) => v.vehicle_id).join(",")}` : null;

  useEffect(() => {
    let isMounted = true;
    if (!enabled || !key || loadedKey.current === key) return undefined;

    async function fetchData() {
      setLoading(true);
      setError(null);
      try {
        const { period: p } = fleetRaw;
        const ids = fleetRaw.vehicles.map((v) => v.vehicle_id);
        if (ids.length === 0) {
          if (isMounted) {
            loadedKey.current = key;
            setData({ ...EMPTY_SIGNALS, key });
          }
          return;
        }
        const dtcTrucks = [
          ...new Set(
            fleetRaw.dtcEvents
              .filter((e) => e.date_id >= p.startStr && e.date_id <= p.endStr && e.status !== "previously_active")
              .map((e) => e.vehicle_id)
          ),
        ];
        const [signals, rows, leadRows] = await Promise.all([
          fetchAllRows("dim_signal", SIGNAL_COLUMNS, (q) => q.order("signal_code")),
          fetchAllRows("mv_telemetry_daily", MV_COLUMNS, (q) =>
            q
              .in("vehicle_id", ids)
              .gte("date_id", shiftDateId(p.startStr, -ROLLING_LOOKBACK_DAYS))
              .lte("date_id", p.endStr)
              .order("vehicle_id")
              .order("signal_code")
              .order("date_id")
          ),
          dtcTrucks.length
            ? fetchAllRows("mv_telemetry_daily", "vehicle_id, date_id, signal_code, anomalous_readings", (q) =>
                q
                  .in("vehicle_id", dtcTrucks)
                  .gt("anomalous_readings", 0)
                  .gte("date_id", shiftDateId(p.startStr, -LEAD_LOOKBACK_DAYS))
                  .lte("date_id", p.endStr)
                  .order("vehicle_id")
                  .order("signal_code")
                  .order("date_id")
              )
            : Promise.resolve([]),
        ]);
        if (isMounted) {
          loadedKey.current = key;
          setData({ signals, rows, leadRows, key });
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
  }, [enabled, key, fleetRaw]);

  const pending = enabled && key !== null && data.key !== key && !error;
  return { loading: loading || pending, error, data };
}

const EMPTY_ASSET = {
  vehicle: null,
  signals: [],
  telemetry: [],
  dtcEvents: [],
  health: [],
  repairOrders: [],
  replacements: [],
  latestDaily: null,
  bridge: [],
  inventory: [],
  period: null,
};

/**
 * useDiagnosticsAssetData
 * -----------------------
 * Asset View for one truck (`selectedVin` holds a vehicle_id). Raw health-signal readings,
 * predictions and the period follow the date range; DTC events and the service history cover
 * the truck's whole life.
 */
export function useDiagnosticsAssetData(vehicleId) {
  const dateRange = useFilterStore((s) => s.dateRange);
  const [raw, setRaw] = useState(EMPTY_ASSET);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isMounted = true;
    if (!vehicleId) return undefined;

    async function fetchData() {
      setLoading(true);
      setError(null);
      try {
        const { data: ctx, error: ctxErr } = await supabase
          .from("v_vehicle_context")
          .select(VEHICLE_COLUMNS)
          .eq("vehicle_id", vehicleId)
          .limit(1);
        if (ctxErr) throw ctxErr;
        const vehicle = ctx?.[0] ?? null;
        if (!vehicle) throw new Error(`Vehicle ${vehicleId} was not found.`);

        const { data: latest, error: latestErr } = await supabase
          .from("fact_vehicle_daily")
          .select("vehicle_id, date_id, odometer_km_end, last_ping_ts, distance_km")
          .eq("vehicle_id", vehicleId)
          .order("date_id", { ascending: false })
          .limit(1);
        if (latestErr) throw latestErr;
        const latestDaily = latest?.[0] ?? null;
        const period = resolvePeriod(dateRange, latestDaily?.date_id ?? null);
        const one = (q) => q.eq("vehicle_id", vehicleId);

        const [signals, telemetry, dtcEvents, health, repairOrders, replacements, daily, reference] = await Promise.all([
          fetchAllRows("dim_signal", SIGNAL_COLUMNS, (q) => q.order("signal_code")),
          fetchAllRows("fact_telemetry", "telemetry_id, ts, date_id, signal_code, value, z_score, is_anomalous", (q) =>
            one(q).gte("date_id", period.startStr).lte("date_id", period.endStr).order("telemetry_id")
          ),
          fetchAllRows("fact_dtc_event", DTC_COLUMNS, (q) => one(q).order("dtc_event_id")),
          fetchAllRows(
            "fact_vehicle_health",
            `health_id, part_id, ts, date_id, failure_probability, rul_km, rul_days, risk_band, trigger,
             ai_prescriptive_action, top_signal_code, dim_part ( part_name )`,
            // one extra week so the first weekly prediction before the period is shown
            (q) => one(q).gte("date_id", shiftDateId(period.startStr, -7)).lte("date_id", period.endStr).order("health_id")
          ),
          fetchAllRows("fact_repair_orders", "ro_id, date_id, visit_type, open_ts, close_ts, downtime_hours, odometer_km, parts_cost, labor_cost, dtc_event_id, nlp_3c_text", (q) =>
            one(q).eq("data_source", DATA_SOURCE_TAG).order("ro_id")
          ),
          fetchAllRows(
            "fact_part_replacement",
            "replacement_id, ro_id, part_id, supplier_id, date_id, odometer_km_at_failure, failure_mode, visit_type, was_predicted, in_warranty, dim_part ( part_name )",
            (q) => one(q).order("replacement_id")
          ),
          fetchAllRows("fact_vehicle_daily", "date_id, distance_km", (q) =>
            one(q).gte("date_id", period.startStr).lte("date_id", period.endStr).order("date_id")
          ),
          fetchPartsReference(),
        ]);

        if (isMounted) {
          setRaw({
            vehicle,
            signals,
            telemetry,
            dtcEvents,
            health,
            repairOrders,
            replacements,
            daily,
            latestDaily,
            ...reference,
            period,
          });
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
  }, [vehicleId, dateRange]);

  return { loading, error, raw };
}
