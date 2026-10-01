import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useFilterStore } from "../store/useFilterStore";

const PAGE_SIZE = 1000; // PostgREST's default max rows per response
const PAGE_CONCURRENCY = 6;
const DAY_MS = 24 * 60 * 60 * 1000;

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
export function toIsoDateString(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function parseDateId(dateId) {
  const [y, m, d] = dateId.split("-").map(Number);
  return new Date(y, m - 1, d);
}

const RANGE_DAYS = { "Last 7 Days": 7, "Last 30 Days": 30, "Last 90 Days": 90 };

/**
 * The period ends on the latest day that has data (not the wall clock), so the module still
 * works when the seeded data isn't live. prevStart opens an equal-length comparison period.
 */
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
  application_id, application_name, customer_type, adas_equipped, telematics_source,
  primary_driver_id, primary_driver_alias`;

const DAILY_COLUMNS = `vehicle_id, date_id, driver_id, is_operating, in_workshop, distance_km,
  engine_hours, drive_hours, idle_hours, pto_hours, fuel_l, idle_fuel_l, adblue_l, energy_kwh,
  co2_kg, utilization_pct, harsh_event_count, safety_score, eco_score, active_dtc_count,
  red_lamp_flag, derate_active, packets_expected, packets_received, last_ping_ts`;

const TRIP_COLUMNS = `trip_id, vehicle_id, driver_id, date_id, start_ts, end_ts, start_city, end_city,
  distance_km, drive_s, idle_s, pto_s, fuel_used_l, idle_fuel_l, pto_fuel_l, energy_used_kwh,
  regen_kwh, avg_speed_kmh, max_speed_kmh, overspeed_s, cruise_distance_pct, coasting_distance_pct,
  rpm_green_band_pct, brake_applications, avg_gcw_kg, ambient_temp_c, harsh_event_count,
  eco_score, speed_class_s`;

const EVENT_COLUMNS = `event_id, vehicle_id, driver_id, trip_id, ts, date_id, event_type, severity,
  source, score_penalty`;

const ASSET_EVENT_COLUMNS = `${EVENT_COLUMNS}, lat, lon, speed_before_kmh, speed_after_kmh, peak_g, duration_s`;

const CHARGING_COLUMNS =`session_id, vehicle_id, date_id, charger_type, energy_kwh, cost_inr,
  soc_start_pct, soc_end_pct`;

const EMPTY_FLEET = {
  vehicles: [],
  models: [],
  drivers: [],
  daily: [],
  trips: [],
  events: [],
  charging: [],
  period: null,
};

/**
 * useTelematicsFleetData
 * ----------------------
 * Loads the Fleet View data for the Telematics module. Scope = connected trucks
 * (`v_vehicle_context.is_connected`) matching every global filter. Returns normalised rows;
 * the tab components derive KPIs and charts with the pure functions in
 * `modules/telematics/telematicsMetrics.js` so local filters don't trigger refetches.
 *
 * - daily, events: previous period + current period (for deltas and 7-day rolling windows);
 * - trips, charging: current period only.
 * Formulas: Documentation/metrics/telematics.md.
 */
export function useTelematicsFleetData() {
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
        const hasBev = vehicles.some((v) => v.powertrain === "bev");
        const modelIds = [...new Set(vehicles.map((v) => v.model_id))];

        const [models, drivers, daily, trips, events, charging] = await Promise.all([
          fetchAllRows("dim_v_model", "model_id, powertrain, base_consumption, consumption_unit", (q) =>
            q.in("model_id", modelIds).order("model_id")
          ),
          fetchAllRows("dim_driver", "driver_id, driver_alias, experience_years", (q) => q.order("driver_id")),
          fetchAllRows("fact_vehicle_daily", DAILY_COLUMNS, (q) =>
            q
              .in("vehicle_id", ids)
              .gte("date_id", period.prevStartStr)
              .lte("date_id", period.endStr)
              .order("vehicle_id")
              .order("date_id")
          ),
          fetchAllRows("fact_trip", TRIP_COLUMNS, (q) =>
            q
              .in("vehicle_id", ids)
              .gte("date_id", period.startStr)
              .lte("date_id", period.endStr)
              .order("trip_id")
          ),
          fetchAllRows("fact_harsh_events", EVENT_COLUMNS, (q) =>
            q
              .in("vehicle_id", ids)
              .gte("date_id", period.prevStartStr)
              .lte("date_id", period.endStr)
              .order("event_id")
          ),
          hasBev
            ? fetchAllRows("fact_charging_session", CHARGING_COLUMNS, (q) =>
                q
                  .in("vehicle_id", ids)
                  .gte("date_id", period.startStr)
                  .lte("date_id", period.endStr)
                  .order("session_id")
              )
            : Promise.resolve([]),
        ]);

        if (isMounted) setRaw({ vehicles, models, drivers, daily, trips, events, charging, period });
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

const EMPTY_ASSET = {
  vehicle: null,
  model: null,
  daily: [],
  trips: [],
  events: [],
  activeDtcs: [],
  traceDays: [],
  period: null,
};

/**
 * useTelematicsAssetData
 * ----------------------
 * Asset View for one truck (`selectedVin` holds a vehicle_id). Period rows (daily, trips,
 * events) follow the date range; active DTCs are "now". `traceDays` lists the dates that
 * `fact_vehicle_status` holds for this truck (the last 7 days of the window).
 */
export function useTelematicsAssetData(vehicleId) {
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
          .select("date_id")
          .eq("vehicle_id", vehicleId)
          .order("date_id", { ascending: false })
          .limit(1);
        if (latestErr) throw latestErr;
        const period = resolvePeriod(dateRange, latest?.[0]?.date_id ?? null);
        const inPeriod = (q) => q.eq("vehicle_id", vehicleId).gte("date_id", period.startStr).lte("date_id", period.endStr);

        const [modelRes, daily, trips, events, dtcs, statusDays] = await Promise.all([
          supabase
            .from("dim_v_model")
            .select("model_id, powertrain, base_consumption, consumption_unit")
            .eq("model_id", vehicle.model_id)
            .limit(1),
          fetchAllRows("fact_vehicle_daily", DAILY_COLUMNS, (q) => inPeriod(q).order("date_id")),
          fetchAllRows("fact_trip", TRIP_COLUMNS, (q) => inPeriod(q).order("trip_id")),
          fetchAllRows("fact_harsh_events", ASSET_EVENT_COLUMNS, (q) => inPeriod(q).order("event_id")),
          fetchAllRows(
            "fact_dtc_event",
            "dtc_event_id, dtc_id, status, lamp_status, caused_derate, first_seen_ts, dim_dtc ( spn_description, severity_class )",
            (q) => q.eq("vehicle_id", vehicleId).eq("status", "active").order("dtc_event_id")
          ),
          fetchAllRows("fact_vehicle_status", "status_id, date_id", (q) =>
            q.eq("vehicle_id", vehicleId).order("status_id")
          ),
        ]);
        if (modelRes.error) throw modelRes.error;

        const traceDays = [...new Set(statusDays.map((s) => s.date_id))].sort();
        if (isMounted) {
          setRaw({
            vehicle,
            model: modelRes.data?.[0] ?? null,
            daily,
            trips,
            events,
            activeDtcs: dtcs,
            traceDays,
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

/**
 * useVehicleDayTrace
 * ------------------
 * rFMS status snapshots (5-min reports) and harsh events for one truck on one day. Loaded
 * separately so switching the day doesn't refetch the whole Asset View.
 */
export function useVehicleDayTrace(vehicleId, dateId) {
  const [trace, setTrace] = useState({ status: [], events: [], dateId: null });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isMounted = true;
    if (!vehicleId || !dateId) return undefined;

    async function fetchTrace() {
      setLoading(true);
      setError(null);
      try {
        const [status, events] = await Promise.all([
          fetchAllRows(
            "fact_vehicle_status",
            `status_id, ts, trip_id, engine_state, wheel_speed_kmh, engine_rpm, fuel_level_pct, soc_pct,
             driver_working_state, lat, lon`,
            (q) => q.eq("vehicle_id", vehicleId).eq("date_id", dateId).order("status_id")
          ),
          fetchAllRows(
            "fact_harsh_events",
            "event_id, trip_id, ts, event_type, severity, speed_before_kmh, speed_after_kmh",
            (q) => q.eq("vehicle_id", vehicleId).eq("date_id", dateId).order("event_id")
          ),
        ]);
        if (isMounted) setTrace({ status, events, dateId });
      } catch (err) {
        if (isMounted) setError(err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    fetchTrace();
    return () => {
      isMounted = false;
    };
  }, [vehicleId, dateId]);

  return useMemo(() => ({ loading, error, trace }), [loading, error, trace]);
}
