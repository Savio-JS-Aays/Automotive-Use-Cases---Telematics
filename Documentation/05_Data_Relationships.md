# 05 · Data Relationships

> How the tables connect: keys, the end-to-end lineage from a sensor reading to a warranty claim
> and a parts order, how filters resolve, join recipes, and the shared-database rules.
>
> Last updated: 2026-10-01

## Key map
| From | Column | To | Cardinality | Enforced |
|---|---|---|---|---|
| dim_vehicle | model_id | dim_v_model | N:1 | FK |
| dim_vehicle | location_id | dim_location → region_id → dim_region | N:1 | FK |
| dim_vehicle | customer_id / application_id | dim_customer / dim_application | N:1 | FK / — |
| dim_vehicle | primary_driver_id | dim_driver | N:1 | no FK (shared table left unconstrained) |
| dim_driver | customer_id, home_location_id | dim_customer, dim_location | N:1 | FK |
| fact_trip | vehicle_id, driver_id, date_id | dim_vehicle, dim_driver, dim_date | N:1 | FK |
| fact_vehicle_status | trip_id (+ vehicle, driver, date) | fact_trip | N:1 | FK |
| fact_harsh_events | trip_id (+ vehicle, driver, date) | fact_trip | N:1 | FK |
| fact_vehicle_daily | (vehicle_id, date_id) | dim_vehicle, dim_date | 1 per vehicle-day | PK + FK |
| fact_telemetry | signal_code | dim_signal | N:1 | FK |
| fact_dtc_event | dtc_id, trip_id | dim_dtc, fact_trip | N:1 | FK |
| bridge_dtc_part | dtc_id ↔ part_id | dim_dtc, dim_part | M:N | FK |
| fact_vehicle_health | vehicle_id, part_id | dim_vehicle, dim_part | N:1 | FK |
| fact_vehicle_health | driver_dtc_event_id | fact_dtc_event | N:1 | logical |
| fact_repair_orders | dtc_event_id | fact_dtc_event | N:1 (nullable) | logical |
| fact_dtc_event | resolved_by_ro_id | fact_repair_orders | N:1 | logical |
| fact_part_replacement | ro_id | fact_repair_orders | N:1 | logical (checked on seed) |
| fact_part_replacement | claim_id | fact_warranty_claims | 1:0..1 | logical (checked on seed) |
| fact_warranty_claims | ro_id, dtc_event_id | fact_repair_orders, fact_dtc_event | N:1 | logical |
| fact_part_replacement | part_id, supplier_id, dealer_id | dim_part, dim_supplier, dim_dealer | N:1 | FK |
| fact_part_demand_forecast | part_id, region_id | dim_part, dim_region | N:1 | FK |
| fact_part_inventory | part_id, location_id | dim_part, dim_location | N:1 | FK (shared) |
| mv_telemetry_daily | (vehicle_id, signal_code, date_id) | rollup of fact_telemetry | 1 per vehicle × signal × day | unique index |
| v_failure_precursor | replacement_id (+ vehicle_id, date window) | fact_part_replacement ⋈ mv_telemetry_daily | N per replacement | view |

**Why some links are "logical":** a real FK *from* a shared table would change that table's
constraints. A real FK *to* a shared fact would install triggers on it. Neither is allowed (see
the shared-database rules below). These links are verified by the seed's consistency checks
instead.

## Lineage: from a sensor to a parts order
One developing fault touches every module. Each step, with its table and module:

1. **Signal drifts:** e.g. SCR efficiency falls from 95 % towards 66 %.
   - Tables: `fact_telemetry` (z-score, Mahalanobis); fleet views read `mv_telemetry_daily`
   - Module: Vehicle Diagnostics · Signal Health tab and Asset View
2. **J1939 DTCs escalate:** SPN3361-FMI7 (AWL) → SPN4364-FMI18 (AWL) → SPN5246-FMI15 (PL,
   derate).
   - Table: `fact_dtc_event` (+ `dim_dtc`)
   - Module: Vehicle Diagnostics · Fault Codes tab (the anomaly → DTC lead time links steps 1 and
     2 through the DTC's freeze-frame signal)
3. **Truck behaviour changes:** derate means lower speed and fewer km; the AdBlue:diesel ratio
   drops.
   - Tables: `fact_trip`, `fact_vehicle_daily.derate_active`
   - Module: Telematics
4. **The model scores the risk:** the part's 30-day failure probability climbs, and an `alert`
   row is written on the detection day.
   - Table: `fact_vehicle_health` (`driver_dtc_event_id`, `active_dtcs`)
   - Module: Overview
5. **Workshop visit:** predicted (caught early) or breakdown (missed).
   - Table: `fact_repair_orders` (`visit_type`, `downtime_hours`, `dtc_event_id`)
   - Module: Uptime · Financial
6. **Part replaced:** at the odometer reading at failure.
   - Table: `fact_part_replacement` (`was_predicted`, `supplier_id`); precursor rows via
     `v_failure_precursor`
   - Module: Component Reliability (life table, Weibull, precursor ramp)
7. **Warranty claim:** only if in warranty.
   - Table: `fact_warranty_claims` (`ro_id`, `dtc_event_id`, `was_predicted`)
   - Module: Financial & Warranty
8. **Parts demand:** future failures are aggregated.
   - Tables: `fact_part_demand_forecast` vs `fact_part_inventory`
   - Module: Supply Chain

Two links close the loop:
- **DTC → part:** `bridge_dtc_part`, e.g. SPN3361-FMI7 → PART009 DEF injector (0.85).
  Reliability's Fault Code → Part Confirmation compares this likelihood with the share of
  resolved events whose repair order replaced the part.
- **DTC → repair:** `fact_dtc_event.resolved_by_ro_id`, with the event's `status` set to
  `cleared`.

Intermittent codes (`status = previously_active`) never lead to a repair.

## Filter mapping
Every hook should resolve the global filters through **`v_vehicle_context`**:

| Filter (UI) | Column in `v_vehicle_context` | Notes |
|---|---|---|
| Region | `region_name` (North / South / East / West / Central) or `region_id` | load options with `select distinct region_name` |
| Vehicle model | `model_label` ("BharatBenz 1617R", "Mercedes-Benz eActros 600") or `model_id` | powertrain filter via `powertrain` |
| Powertrain | `powertrain` (`diesel` / `bev`) | global filter added 2026-09-30 |
| Application (duty cycle) | `application_id` (label `application_name`) | global filter added 2026-10-01; 8 values |
| Customer type | `customer_type` | global filter added 2026-10-01; 7 values. Not per customer: 189 customers for 200 trucks |
| Asset View (`selectedVin`) | `vehicle_id` (**use `vehicle_id` consistently**, and display `vin`) | the Overview passes `vehicle_id` since 2026-09-30 |
| Connected trucks only | `is_connected = true` | telematics facts only exist for the 200 connected trucks |
| Date range | `date_id` on facts (IST date) | `fact_part_replacement` history predates `dim_date`. Reliability ignores the date range (lifetime data) |

The hard-coded options in `DashboardLayout.jsx` ("North America", "EV SUV", …) match nothing in
the database. Replace them during the port.

## Join recipes (supabase-js / PostgREST)
```js
// Fleet KPIs for a region over a date range: aggregate table + vehicle context
supabase.from("fact_vehicle_daily")
  .select("date_id, distance_km, idle_hours, safety_score, v_vehicle_context!inner(region_name, model_label)")
  .gte("date_id", start)
  .eq("v_vehicle_context.region_name", "South");
```

**Views and embedding:** PostgREST embeds views only when it can infer the relationship from the
underlying FKs. If an embed fails, filter in two steps:
1. `select vehicle_id from v_vehicle_context where …`;
2. `.in("vehicle_id", ids)` on the fact.

```js
// Asset View: 24 h speed trace
supabase.from("fact_vehicle_status")
  .select("ts, wheel_speed_kmh, engine_state, lat, lon")
  .eq("vehicle_id", vehicleId).gte("ts", since).order("ts");

// DTC Pareto with catalog
supabase.from("fact_dtc_event").select("dtc_id, status, dim_dtc!inner(spn, fmi, system, default_lamp)");

// Replacement with its claim and the fault that triggered it
supabase.from("fact_part_replacement")
  .select("*, dim_part!inner(part_name, b10_design_life_miles), dim_supplier!inner(supplier_name, risk_tier)");
```

The `logical` links (ro_id, claim_id, dtc_event_id) have no FK, so PostgREST cannot embed them.
Fetch both sides and join in the hook, or add a Postgres view for the combination you need.

## Shared-database rules
The Supabase database is shared with other applications (sales, logistics, service, DevOps).

**Telematics-owned** (free to create, alter, truncate, drop):
- dimensions: `dim_signal`, `dim_dtc`, `bridge_dtc_part`, `dim_driver`;
- telematics facts: `fact_trip`, `fact_vehicle_status`, `fact_harsh_events`, `fact_dtc_event`,
  `fact_charging_session`, `fact_vehicle_daily`;
- redesigned facts: `fact_telemetry`, `fact_vehicle_health`;
- ecosystem facts: `fact_part_replacement`, `fact_part_demand_forecast`;
- the view `v_vehicle_context`;
- the rollups `mv_telemetry_daily` (materialized), `v_failure_precursor` and
  `v_failure_precursor_summary` (added 2026-10-01).

**Shared** (the rules for these tables):
1. **Only add nullable columns.** Never alter or drop existing columns.
2. **Never update or delete existing rows.** Only the values in *our* added columns may be
   written.
3. **Tag inserted rows** in shared facts with `data_source = 'telematics_sim'`. Only tagged rows
   may be deleted.
4. **Prove it:** every seed compares an md5 fingerprint of each shared table's original columns
   and untagged rows, before and after. Any difference rolls the whole seed back.

**Legacy:** `fact_telemetry_legacy` and `fact_vehicle_health_legacy` keep the pre-redesign data.
They are read-only, and can be restored with `db:reset -- --confirm --restore-legacy`.
