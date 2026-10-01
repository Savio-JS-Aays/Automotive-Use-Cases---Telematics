# 09 · Changelog

> Dated record of feature, data-model and documentation changes. Add an entry for every
> change, newest first.
>
> Last updated: 2026-10-01

## 2026-10-01 — Charts hidden from the dashboard (on request)
- Each chart is hidden behind a `SHOW` flag at the top of its tab file. Code, formulas and docs are
  kept; set the flag to `true` to restore it.

| File | Hidden |
|---|---|
| `modules/telematics/FuelEnergyTab.jsx` | Energy Use vs Ambient Temperature (EV section now 2 columns) |
| `modules/telematics/DriverSafetyTab.jsx` | Coaching Quadrant: Eco vs Safety (Time in Speed Bands now full width) |
| `modules/diagnostics/FaultCodesTab.jsx` | DTC Rate Trend by Lamp, Fault Lifecycle, Operating Conditions at Fault |
| `modules/reliability/FieldLifeTab.jsx` | Failure-Pattern Map (β × η), Survival Curve (Kaplan–Meier). The part selector moved to the Hazard Rate chart |
| `modules/reliability/PartView.jsx` | Weibull Probability Plot (Survival by Group now full width) |
| `modules/diagnostics/SignalHealthTab.jsx` | Signals vs Normal Band, Anomaly Trend, Anomaly → DTC Lead Time chart, DPF Soot Load vs Differential Pressure, SCR NOx Conversion Efficiency by Model |

- KPI cards are unchanged, including "DTC Rate per 10k km" and "Anomaly → DTC Lead Time".

## 2026-10-01 — Vehicle Diagnostics and Component Reliability rebuilt on the new data model
- **Why:** both modules still read legacy columns (`signal_type`, `remaining_useful_life`,
  `timestamp`), so they could not load. The Overview → Asset View drill-down was broken too.
- **Split by persona:**
  - **Vehicle Diagnostics** is for the service engineer, over a 90-day operational window.
  - **Component Reliability** is for the quality engineer, over lifetime data.
  - The planned standalone DTC Analysis module became the Diagnostics **Fault Codes** tab.
- **Database** (telematics-owned objects only; no shared table touched):
  - new materialized view `mv_telemetry_daily` (vehicle × signal × day, 145,156 rows);
  - new views `v_failure_precursor` and `v_failure_precursor_summary`;
  - `setup-telematics-db.mjs` refreshes the rollup after `migrate` and `seed`, and `reset` drops
    the views first;
  - `db:migrate` was run on Supabase.
- **Vehicle Diagnostics** (`?tab=faults|signals`):
  - **Fault Codes tab:**
    - KPIs: trucks with a warning lamp (red / amber), active codes by severity, DTC rate per
      10k km, derate events and conversion, mean time to clear;
    - charts: Pareto with cumulative %, System × Model heatmap per 100 trucks, lamp-stacked rate
      trend, fault lifecycle funnel, freeze-frame operating conditions;
    - table: Active Fault Codes with action pills;
    - DTC code drawer: likely parts, stock, freeze-frame means, affected trucks.
  - **Signal Health tab:**
    - KPIs: critical trucks, signals out of band, trucks with anomalies, anomalous reading rate,
      anomaly → DTC lead time;
    - charts: truck × signal health map, signals vs normal band (box strips), anomaly trend, DPF
      soot vs ΔP scatter, SCR efficiency by model, wear forecast (brake lining / HV SoH), lead-time
      histogram.
  - **Asset View:**
    - KPIs: worst-part risk, min RUL, active faults, signals out of band, odometer, last ping;
    - warranty badge;
    - health-signal small multiples with bands, anomalies and DTC markers (`?signal=` focus);
    - DTC Gantt with freeze frame;
    - part risk trend;
    - workshop prep, with parts to stage and stock, and "Copy work-order summary" replacing the
      dead "Generate Repair Order" button;
    - service history.
- **Component Reliability** (`?tab=life|quality|cause`, `?part=`):
  - The failure source is now `fact_part_replacement` in km, using a **renewal part life** and
    **censored** running parts.
  - Weighted Kaplan–Meier with a Greenwood band, and a Weibull fit on KM plotting positions,
    replace the uncensored "survival" and the linear-axis "Weibull".
  - **Field Life tab:**
    - KPIs: parts below design B10, worst supplier variance, fleet MTBF, predicted %, downtime per
      failure, repeat repairs;
    - charts: β × η failure-pattern map, survival by group, hazard by km;
    - table: Component Variance Master.
  - **Supplier & Build Quality tab:** supplier scorecard (B10 % of design), risk tier check, build
    cohort × age heatmap, where parts fail (application / region / model).
  - **Root Cause tab:** failure-mode mix, precursor ramp matrix (part × signal), DTC → part
    confirmation.
  - **Part View:** KPIs, Weibull probability plot per supplier, survival by group, failure modes,
    hazard, precursor signature, replacements table (rows open Diagnostics Asset View).
- **Validation** against the simulator's ground truth:
  - fitted β: Mechanical 2.1 (true 2.4), Consumable 1.84 (1.8), Electrical 1.27 (1.2);
  - High-tier supplier B10 is 0.74 × design (true 0.72);
  - the precursor ramp finds air pressure → air compressor (6.4×), 24 V battery → alternator
    (5.9×) and DPF ΔP → DPF (3.4×).
- **Removed:**
  - the hard-coded `FLEET_BASELINE`;
  - mixed-unit charts ("Fleet-Wide Signal Averages" and the mixed-signal playback);
  - the fleet average RUL on Reliability;
  - the miles-based warranty-claim B10.
- **Rejected:** a failures-per-km rate by supplier risk tier. It came out ≈ 1.0 for every tier
  because of part-mix confounding and factory-part attribution, so it was replaced by the median
  B10 % of design per tier.
- **Deferred:**
  - the Diagnostics Predictive Risk tab;
  - the Reliability Prediction Performance tab;
  - Asset View peer percentile;
  - the DTC co-occurrence matrix.
- **Docs:**
  - `metrics/diagnostics.md` and `metrics/reliability.md` rewritten;
  - `metrics/dtc-analysis.md` marked as merged;
  - updated: 01, 02 (reliability theory: renewal life, censoring, KM, precursor ramp; band state,
    lead time), 03, 04, 05, 06, 08 and README;
  - `docs/CLAUDE.md` updated.

## 2026-10-01 — Telematics module rebuilt on the new data model
- **Telematics (`/telematics-data`) ported and its nav link restored.**
  - The legacy version read `fact_telemetry.speed_mph / engine_state / fuel_consumed_gal /
    ping_success` and `dim_vehicle.model`, none of which exist, so it could not load.
  - It now reads `v_vehicle_context`, `fact_vehicle_daily`, `fact_trip`, `fact_harsh_events`,
    `fact_charging_session`, `fact_vehicle_status` and `fact_dtc_event`.
  - Speed-delta "harsh events", USD constants, `lat/lon = 0` and the `100 − 5n` safety score are
    all gone.
- **Fleet View: 4 tabs** (kept in `?tab=`).
  - **Utilization & Uptime:**
    - KPIs: utilization, active trucks, uptime, km per operating day;
    - charts: drive / idle / PTO hours, hour × weekday heatmap, Region × Model utilization,
      utilization distribution, utilization by application;
    - table: Fleet Roster with status pills, search, sort and CSV.
  - **Fuel, Energy & CO₂:**
    - KPIs: L/100 km (kWh for BEV), idle waste ₹, idle %, CO₂, AdBlue ratio;
    - charts: consumption trend vs rated per model, worst 10 idle trucks, consumption vs load
      scatter with fitted lines, diesel split by application, EV section (charging mix,
      kWh vs temperature);
    - table: Model Efficiency Benchmark.
  - **Driver Safety:**
    - local event-family, severity and km-threshold filters;
    - KPIs: safety, events / 1,000 km, high-severity events, eco, ADAS activations;
    - charts: event rate by family, worst 10 drivers, type × severity matrix, score
      distribution, coaching quadrant, speed-band profile;
    - table: Driver Scorecard;
    - driver panel with weekly trend, event mix, trucks and coaching focus.
  - **Data Health:**
    - KPIs: connected trucks, completeness, trucks < 90 %, silent trucks;
    - charts: completeness trend, completeness by region / unit source / model;
    - table: Connectivity Watchlist.
- **Asset View** (single truck):
  - 6 KPIs, including consumption vs rated and active DTCs;
  - a day trace from 5-minute rFMS snapshots (speed with events, engine-state and tachograph
    strips, day chips);
  - fuel level / SoC, daily km and engine hours;
  - Trip Log (click to zoom the trace) and Harsh & ADAS Event Log (with OSM links).
- **Drill-downs:**
  - every ranking, scatter, roster and watchlist row opens the Asset View;
  - matrix, distribution and application bars cross-filter the tables;
  - driver bars and bubbles open the driver panel.
- **Global filters:** new **Application** (duty cycle) and **Customer Type**. The Overview applies
  them too.
- **Decisions:**
  - idle waste cost = measured `idle_fuel_l × ₹90` (closes the open decision in 02 §6);
  - the period ends on the latest data day;
  - "silent" = no packets on the latest day or no report for 48 h. `last_ping_ts` stays at the
    last report while a parked truck heartbeats, so the 24 h rule was replaced.
- **Code:**
  - `useTelematicsData.js` now only fetches (parallel paging);
  - formulas live in `modules/telematics/telematicsMetrics.js`;
  - shared UI is in `TelematicsUi.jsx`.
- **Verified:**
  - metrics were run on live data; utilization matches an independent sum (32.84 %);
  - headless Chromium on all tabs, the driver panel, the Asset View and the BEV-only filter
    showed no console errors.
- **Docs:**
  - `metrics/telematics.md` rewritten;
  - `01`, `02` (§6, §8), `03`, `05` (filter mapping), `08`, `metrics/overview.md` and
    `docs/CLAUDE.md` updated.

## 2026-09-30 — Overview redesigned on the new data model
- **Overview (`/`) ported** to `v_vehicle_context`, `fact_vehicle_health` (worst part per truck),
  `fact_dtc_event` and `fact_vehicle_daily`. Aimed at the service engineer, with uptime included.
  - KPIs: Trucks at Risk, Trucks with Active Faults, Due for Workshop ≤ 14 days, Fleet Uptime,
    Data Completeness, each tagged NOW or PERIOD.
  - Charts: Fleet Risk Posture (4 bands), Early-Warning Trend (per 100 trucks, 7-day rolling),
    Region × Model Risk Matrix, Top Predicted Failures by Part (stacked).
  - Table: Workshop Action List with status pills, related DTC, recommended action, last ping,
    and cross-filters from every chart.
  - Removed: Trust Score (z-score), Avg RUL, Total Telemetry Events, raw z > 3 trend, absolute
    risk-by-region bar.
  - Fixed: the arbitrary-part risk bug, the VIN-vs-`vehicle_id` drill-down bug, and connected-only
    denominators.
- **Global filters:** options are now loaded from `v_vehicle_context` and store region/model
  codes. There's a new **Powertrain** filter; Today and YTD were removed.
- **KpiCard:** optional `badge`, `subtitle`, `delta`, `sparkline` and `onClick` props.
- Docs: `metrics/overview.md` rewritten; `03_Technical_Architecture.md`, `05_Data_Relationships.md`
  and `08_Glossary.md` updated.

## 2026-09-30 — Documentation knowledge base
- Created `Documentation/`:
  - overview, domain theory, architecture, data model, relationships, data generation;
  - per-module metric formula references (legacy and planned);
  - glossary, changelog.
- Added the maintenance rule to the workspace `CLAUDE.md`: docs are updated with every feature.

## 2026-09-30 — Telematics data model redesign and simulated dataset
- **Redesigned tables:**
  - `fact_telemetry` is now long health-signal readings, keyed by `signal_code`;
  - `fact_vehicle_health` is now weekly vehicle × part predictions with risk bands and J1939 DTC
    detail;
  - the old tables were kept as `fact_telemetry_legacy` / `fact_vehicle_health_legacy`.
- **New tables:**
  - dimensions: `dim_signal`, `dim_dtc`, `bridge_dtc_part`, `dim_driver`;
  - telematics facts: `fact_trip`, `fact_vehicle_status`, `fact_harsh_events`,
    `fact_dtc_event`, `fact_charging_session`, `fact_vehicle_daily`;
  - ecosystem facts: `fact_part_replacement`, `fact_part_demand_forecast`;
  - view: `v_vehicle_context`.
- **Shared tables (nullable columns only):**
  - new columns on `dim_v_model`, `dim_vehicle`, `fact_repair_orders` and
    `fact_warranty_claims`;
  - simulated rows are tagged `data_source = 'telematics_sim'`.
- **Scripts:**
  - added `scripts/telematics-db` and the npm scripts `db:migrate`, `db:seed`, `db:setup`,
    `db:reset`.
  - Seeded 200 trucks for 2026-07-03 → 2026-09-30 (~535k rows). All consistency checks passed;
    the shared-data fingerprint is unchanged.
- **Impact:** the current React hooks still query the legacy column names, so Overview,
  Diagnostics, Reliability and Telematics are broken until they are ported. See
  [01](01_Project_Overview.md#modules-and-status).
