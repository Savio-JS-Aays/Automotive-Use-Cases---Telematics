# Fleet Pulse — Telematics & Predictive Maintenance Dashboard

Demo React SPA (automotive use case) that visualizes fleet telematics, predictive-maintenance,
reliability, and warranty/financial KPIs from a Supabase (Postgres) star schema.

## Stack
- React 19 + Vite 8 (JS/JSX, no TypeScript), react-router-dom 7
- Tailwind CSS 4 (via `@tailwindcss/postcss`), lucide-react icons, clsx / tailwind-merge
- Recharts 3 for all charts; date-fns
- Zustand 5 for global filter state
- `@supabase/supabase-js` 2 for data (client-side queries, no backend)
- Lint: oxlint (`.oxlintrc.json`: react rules-of-hooks, only-export-components)

## Commands
- `npm run dev` — Vite dev server
- `npm run build` / `npm run preview`
- `npm run lint` — oxlint
- `npm run db:migrate` / `db:seed` / `db:setup` / `db:reset -- --confirm` — telematics schema +
  simulated data (`scripts/telematics-db/`, needs `DATABASE_URI` in `.env`; see its README)
- No test suite exists.

## Environment
`.env` (do not commit / do not print values):
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `DATABASE_URI` — direct Postgres URI, used only by `scripts/telematics-db` (never by the browser)

Consumed in `src/lib/supabaseClient.js`.

## Architecture
```
src/
  main.jsx, App.jsx                     — router; all routes nested under DashboardLayout
  components/layout/DashboardLayout.jsx — dark top nav + white filter sidebar + <Outlet/>
  components/layout/TruckSwitcher.jsx   — searchable truck picker (sidebar Active Vehicle card, Asset View)
  components/kpi/KpiCard.jsx            — shared KPI tile
  components/ui/ChartHeader.jsx, InfoTooltip.jsx — shared chart UI
  store/useFilterStore.js               — global filters (Zustand)
  lib/supabaseClient.js                 — Supabase client
  hooks/use*Data.js                     — one data hook per module: fetch + aggregate (useMemo)
  modules/<name>/<Name>Module.jsx       — one page per module; presentational + Recharts
```

Pattern: each module = `modules/X/XModule.jsx` + `hooks/useXData.js`. Hooks read filters from
`useFilterStore`, fetch from Supabase (paging with `.range()` in 1000-row pages via a local
`fetchAllRows` / `fetchAll` helper), and derive KPI/chart data client-side in `useMemo`.
Helpers like `resolveStartDate`, `toIsoDateString`, `fetchAllRows` are duplicated per hook
(no shared utils file).

## Global filters (`useFilterStore`)
- `dateRange`: Last 7 Days | Last 30 Days (default) | Last 90 Days
- `region`: "All Regions" or a `region_id` (REG001 North … REG005 Central)
- `vehicleModel`: "All Models" or a `model_id` (MOD001–MOD005)
- `powertrain`: "All Powertrains" | `diesel` | `bev`
- `application`: "All Applications" or an `application_id` (duty cycle)
- `customerType`: "All Customer Types" or a `customer_type` (not per customer: 189 customers / 200 trucks)
- Options are loaded from `v_vehicle_context` (connected trucks) in `DashboardLayout.jsx`
  (`useFilterOptions`); the store holds codes, the sidebar shows labels.
- `selectedVin`: `null` = Fleet View; non-null = **Asset View** (single-vehicle drill-down), holding
  a `vehicle_id`. Asset View overrides region/model; dateRange still applies. Sidebar shows
  "Clear Asset View". Set from: Overview action list (also navigates to `/vehicle-diagnostics`),
  Diagnostics (active DTC table, DTC drawer, Signal Health heatmap / scatter / wear bars; these
  also set `?signal=`), Reliability (Part View replacements, which navigates to
  `/vehicle-diagnostics`), and Telematics (roster, idle ranking, scatters, watchlist, driver
  panel). The Overview itself stays fleet-only.

## Routes / modules
| Route | Module | Hook | Focus |
|---|---|---|---|
| `/` | OverviewModule | useOverviewData | **New data model.** Service-engineer landing page: Trucks at Risk, Active Faults, Due ≤ 14 days, Fleet Uptime, Data Completeness; risk posture donut, early-warning trend, Region × Model risk matrix, top failing parts; Workshop Action List (cross-filtered). Formulas: `Documentation/metrics/overview.md` |
| `/vehicle-diagnostics` | DiagnosticsModule (tabs in `?tab=faults` / `signals`) | useDiagnosticsData (`useDiagnosticsFleetData`, `useSignalHealthData` (lazy, reads `mv_telemetry_daily`), `useDiagnosticsAssetData`; fetch only) + `modules/diagnostics/diagnosticsMetrics.js` (all formulas) | **New data model.** Fault Codes tab (the former DTC Analysis plan): lamp / severity KPIs, DTC rate per 10k km, Most Common Faults (distinct trucks, plain names), System × Model heatmap, lifecycle, freeze-frame scatter, active DTC table, code drawer. Signal Health tab: truck × signal map (all trucks; sort by risk / VIN / model / any signal), band strips, anomaly trend, DPF / SCR, wear forecast, anomaly → DTC lead time. Asset View (`?signal=` focus): signal small multiples, DTC Gantt (click a bar for the freeze-frame popup), part risk trend, workshop prep, service history. Formulas: `Documentation/metrics/diagnostics.md` |
| `/component-reliability` | ReliabilityModule (tabs in `?tab=life` / `quality` / `cause`, `?part=` → PartView) | useReliabilityData (`useReliabilityData`, `usePartPrecursor`; fetch only) + `modules/reliability/reliabilityMetrics.js` | **New data model**, lifetime data (date range ignored). Renewal part life + censoring → weighted Kaplan–Meier, Weibull (β, η, B10), β × η map, hazard, variance master; supplier scorecard, tier check, build cohort, where parts fail; failure modes, precursor ramp, DTC → part confirmation; Part View. Formulas: `Documentation/metrics/reliability.md` |
| `/financial-warranty` | FinancialWarrantyModule | useFinancialData | Projected exposure, preventable savings (60%), cost per breakdown, highest-cost supplier, 90-day cumulative risk curve, exposure by subsystem, cost by telematics anomaly |
| `/telematics-data` | TelematicsModule (tabs in `?tab=`) | useTelematicsData (`useTelematicsFleetData`, `useTelematicsAssetData`, `useVehicleDayTrace`; fetch only) + `modules/telematics/telematicsMetrics.js` (all formulas) | **New data model.** Tabs: Utilization & Uptime, Fuel/Energy/CO₂ (incl. EV section, model benchmark), Driver Safety (local event filters, group by model / application / region; no per-driver views), Data Health. Asset: day trace from `fact_vehicle_status`, trip log, event log. Formulas: `Documentation/metrics/telematics.md` |
| (none) | SupplyChainModule | useSupplyChainData | Inventory / stockout / depot deficit. **Import, route and nav all commented out.** |

## Key constants / business rules
- **Overview:** risk bands on each truck's worst part: Critical p > 0.7, High ≥ 0.4, Medium ≥ 0.2;
  due soon = `rul_days` ≤ 14; matrix cells need ≥ 5 trucks; trend = 7-day rolling per 100 trucks
- **Telematics:** idle cost = `idle_fuel_l × ₹90`; period ends on the latest data day; deltas need
  ≥ 80 % previous-period coverage; Region × Model cells need ≥ 5 trucks; silent = no packets on
  the latest day or no report for 48 h; rankings use a local km threshold (default 500)
- **Diagnostics:** band state from `dim_signal` (direction-aware warn / crit thresholds, normal
  band); anomaly = `fact_telemetry.is_anomalous`; RSL / PL → "Immediate Service", AWL / MIL → "Plan
  Workshop"; most common faults top 10; signal map lists all trucks; wear slope needs ≥ 5 days; lead-time look-back
  30 days; risk bands as in the Overview
- **Reliability:** km (design B10 miles × 1.609344); ≥ 5 failures to rate a group, ≥ 10 for a
  Weibull fit, ≥ 3 per precursor cell; hazard Critical < −20 % / Watch < 0; repeat = 10,000 km or
  30 days; hazard bands of 50,000 km
- **Financial:** `SAVINGS_RATE = 0.6`, 90-day horizon, `INR_TO_USD = 0.012` (raw claim amounts
  are INR); the 90-day cumulative curve is synthetic (seeded random ramp, deterministic per total);
  `SIGNAL_MAPPING` maps subsystem → signal (Powertrain → RPM & Engine Load,
  Electrical → Battery Voltage, Chassis → Vibration & Alignment, Cooling → Coolant Temperature,
  Brakes → Brake Pressure)

## Supabase schema (source of truth: `schema.sql`)
`schema.sql` is a pg_dump of a shared DB (it also contains sales, logistics, service-case and
DevOps tables not used here). Tables relevant to this app:

**Telematics data model was redesigned (2026-09-30)**. The full spec is in
`docs/project_context.md` §4, and the DDL in `scripts/telematics-db/sql/schema.sql` (not in
`schema.sql`).
- `fact_telemetry` (redesigned) is now long health-signal readings: ts, signal_code →
  `dim_signal`, value, z_score, mahalanobis_score. Old rows are in `fact_telemetry_legacy`.
- `fact_vehicle_health` (redesigned) is now a weekly vehicle × part prediction: ts,
  failure_probability, rul_km, rul_days, risk_band, active_dtcs `[{dtc_id, spn, fmi, lamp,
  severity}]`. Old rows are in `fact_vehicle_health_legacy`.
- New tables:
  - dimensions: `dim_signal`, `dim_dtc`, `bridge_dtc_part`, `dim_driver`;
  - telematics facts: `fact_trip`, `fact_vehicle_status`, `fact_harsh_events`,
    `fact_dtc_event`, `fact_charging_session`, `fact_vehicle_daily`;
  - ecosystem facts: `fact_part_replacement`, `fact_part_demand_forecast`;
  - view: `v_vehicle_context`.
- Shared tables only gained nullable columns: `dim_v_model`, `dim_vehicle`,
  `fact_repair_orders`, `fact_warranty_claims`. Simulated rows in the shared facts carry
  `data_source = 'telematics_sim'`.

Other facts:
- `fact_warranty_claims`: claim_id (PK), vehicle_id, part_id, dealer_id, supplier_id (all FK),
  date_id (text), claim_amount (INR), nff_flag, ai_risk_score, status, submission_date,
  adjudication_date, liability_type, recovered_amount, mileage_at_failure, cluster_id
- `fact_part_inventory`: part_inventory_id (PK), part_id → dim_part, location_id → dim_location,
  quantity, inventory_status, forecasted_90d_demand, reorder_recommended
- `fact_data_quality`: dq_id, date_id, total_expected_packets, valid_packets_received (unused by app)

Dimensions:
- `dim_vehicle`: vehicle_id (PK), vin, model_id → dim_v_model, customer_id, location_id →
  dim_location, current_status, production_date, in_service_date, application_id. **No `model` column.**
- `dim_v_model`: model_id (PK), model_name, variant, vehicle_type, segment, tonnage_t
- `dim_location`: location_id (PK), location_name, region_id → dim_region, address, location_type
- `dim_region`: region_id (PK), region_name, state, country
- `dim_part`: part_id (PK), part_name, part_type, vehicle_subsystem, standard_labor_hours,
  b10_design_life_miles, unit_cost, supplier_id
- `dim_supplier`: supplier_id (PK), supplier_name, risk_tier
- `dim_date`: date_id (PK), year, month_number, month_name, quarter

RLS: enabled (public SELECT policy) only on dim_date, dim_part, dim_supplier, dim_vehicle,
fact_data_quality. Other tables have RLS off and `GRANT ALL` to `anon`, so the anon key can read
and write them.

Filtering uses PostgREST embedded `!inner` joins, e.g.
`.eq("dim_vehicle.dim_location.region_id", region)`.

## Data provenance (DB vs. hardcoded)
Nothing is mocked: every hook queries Supabase. Hardcoded or synthetic parts:
- Financial: 90-day cumulative curve is synthetic (seeded random spread of total exposure);
  "Cost by Telematics Anomaly" uses no telemetry (inventory exposure relabelled via
  `SIGNAL_MAPPING`); `INR_TO_USD`, `SAVINGS_RATE` constants.
- Diagnostics / Reliability: no hardcoded data. Thresholds come from `dim_signal`, `dim_dtc` and
  `dim_part`.
- Telematics: only the diesel price (₹90/L, same as the simulator) is a constant; everything else
  is measured.

## Known quirks / gotchas
- **Ported modules:** Overview (2026-09-30), Telematics, Diagnostics and Reliability
  (2026-10-01). Financial reads only `fact_warranty_claims`; Supply Chain reads only
  `fact_part_inventory`.
- **`mv_telemetry_daily` is a materialized view.** `db:migrate` and `db:seed` refresh it. After
  any other change to `fact_telemetry`, run `REFRESH MATERIALIZED VIEW mv_telemetry_daily`, or the
  Signal Health and precursor views go stale.
- Diagnostics and Reliability import the Telematics UI kit (`modules/telematics/TelematicsUi.jsx`,
  `telematicsFormat.js`, `telematicsMetrics.js` helpers). Keep those exports stable.
- The model filter column differs between hooks: `dim_vehicle.model_id` (Financial; valid) and
  `v_vehicle_context.model_id` (Overview, Telematics, Diagnostics, Reliability). Only Financial
  ignores `powertrain` / `application` / `customerType`. Reliability ignores the date range on
  purpose (lifetime data).
- `fact_vehicle_daily.last_ping_ts` is the last *report*; parked trucks still heartbeat (see
  `packets_received`). Don't treat "no ping for 24 h" as silent.
- `fact_vehicle_status` only holds the last 7 days, so Asset View traces are limited to them.
- Financial ignores dateRange.
- Diagnostics Asset View reads raw `fact_telemetry` for the period. Fleet views read the daily
  rollup.
- A DTC is linked to its signal through the one non-standard key of `freeze_frame` (see
  `freezeSignal` in `diagnosticsMetrics.js`). Intermittent codes have none.
- `README.md` is the stock Vite template.
