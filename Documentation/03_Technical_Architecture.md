# 03 · Technical Architecture

> Stack, code layout, how data flows from Postgres to charts, security, and commands.
>
> Last updated: 2026-10-01

## Stack
| Layer | Technology |
|---|---|
| UI | React 19 (JS/JSX, no TypeScript), react-router-dom 7 |
| Styling | Tailwind CSS 4 (`@tailwindcss/postcss`), lucide-react icons, clsx / tailwind-merge |
| Charts | Recharts 3 (all charts), date-fns |
| State | Zustand 5 (global filters) |
| Data | Supabase (Postgres 17 + PostgREST), `@supabase/supabase-js` 2, queried client-side |
| Build / lint | Vite 8, oxlint |
| DB tooling | Node 26 scripts with `pg` (`scripts/telematics-db`) |

## Code layout
```
my-react-app/
  src/
    main.jsx, App.jsx                      router; all routes nested in DashboardLayout
    components/layout/DashboardLayout.jsx  dark top nav + filter sidebar + <Outlet/>
    components/kpi/KpiCard.jsx             KPI tile (title, value, icon, tooltip)
    components/ui/ChartHeader.jsx          chart title + InfoTooltip (business meaning)
    store/useFilterStore.js                global filters (Zustand)
    lib/supabaseClient.js                  Supabase client (publishable key)
    hooks/use<Module>Data.js               fetch + aggregate for one module (useMemo)
    modules/<module>/<Module>Module.jsx    page: KPIs, Recharts charts, master table
  scripts/telematics-db/                   schema migration + data simulator (see 06)
  docs/                                    briefs and rules (Domain, UI guide, project context, code map)
  Documentation/                           this knowledge base
```

**Module pattern:** one `modules/X/XModule.jsx` (presentational) + one `hooks/useXData.js`. The
hook:
1. reads the filters from `useFilterStore`;
2. queries Supabase;
3. derives every KPI and chart dataset in `useMemo`;
4. returns plain arrays and objects to the page.

Formulas therefore live in the hooks; they are documented in [metrics/](metrics/).

**Exception: Telematics (2026-10-01).** The module has local filters that must not refetch, so it
splits the work:
- `hooks/useTelematicsData.js` only fetches. It exports three hooks:
  - `useTelematicsFleetData`;
  - `useTelematicsAssetData`;
  - `useVehicleDayTrace` (one day of 5-minute snapshots).
- `modules/telematics/telematicsMetrics.js` holds every formula as a pure function. The tabs call
  these functions in `useMemo`, passing their local filter state.
- Other files in `modules/telematics/`:
  - `TelematicsModule.jsx`: the tab shell, with the tab kept in `?tab=`;
  - one file per tab (`UtilizationTab`, `FuelEnergyTab`, `DriverSafetyTab`, `DataHealthTab`);
  - `AssetTelematicsView.jsx` and `DriverPanel.jsx`;
  - `TelematicsUi.jsx`: shared components (ChartCard, HeatGrid, Segmented, DataTable with
    sort / search / CSV);
  - `telematicsFormat.js`: formatters (₹ lakh / crore), axis styles and pill styles.

**Vehicle Diagnostics and Component Reliability (2026-10-01)** follow the same split:

| Module | Fetch hooks | Formulas | UI files |
|---|---|---|---|
| Diagnostics | `hooks/useDiagnosticsData.js`: `useDiagnosticsFleetData`; `useSignalHealthData` (loaded only while the Signal Health tab is open); `useDiagnosticsAssetData` | `modules/diagnostics/diagnosticsMetrics.js` | `DiagnosticsModule` (tabs `?tab=faults` / `signals`), `FaultCodesTab`, `SignalHealthTab`, `DtcCodePanel` (drawer), `AssetDiagnosticsView`, `BandStrip`, `diagnosticsUi` (pills) |
| Reliability | `hooks/useReliabilityData.js`: `useReliabilityData` (lifetime, ignores the date range); `usePartPrecursor` | `modules/reliability/reliabilityMetrics.js` (life table, weighted Kaplan–Meier, Weibull fit, cohorts) | `ReliabilityModule` (tabs `?tab=life` / `quality` / `cause`, `?part=` opens `PartView`), `FieldLifeTab`, `SupplierQualityTab`, `RootCauseTab`, `ReliabilityCharts` (WeibullPlot, SurvivalChart, HazardChart) |

Both modules reuse the Telematics UI kit and formatters by importing
`modules/telematics/TelematicsUi.jsx` and `telematicsFormat.js`. `TelematicsUi` gained
`SingleLineTick`, a y-axis tick that doesn't wrap.

## Global filters (`useFilterStore`)
| Field | Values | Effect |
|---|---|---|
| `dateRange` | Last 7 / 30 (default) / 90 Days | lower bound on `date_id` / timestamps |
| `region` | "All Regions" or a `region_id` (REG001–REG005) | filters through vehicle → location → region |
| `vehicleModel` | "All Models" or a `model_id` (MOD001–MOD005) | filters through vehicle → model |
| `powertrain` | "All Powertrains", `diesel`, `bev` | filters on `dim_v_model.powertrain` |
| `application` | "All Applications" or an `application_id` | duty cycle, filters on `v_vehicle_context.application_id` (added 2026-10-01) |
| `customerType` | "All Customer Types" or a `customer_type` (Fleet Operator, Owner-Operator, …) | filters on `v_vehicle_context.customer_type` (added 2026-10-01). Customer *type*, not customer: 189 customers own the 200 connected trucks, so a per-customer filter would be useless |
| `selectedVin` | `null` / `vehicle_id` | `null` = **Fleet View**; set = **Asset View** (single truck; overrides region/model) |

- **Options are loaded from the DB.** `DashboardLayout.jsx` (`useFilterOptions`) reads the
  distinct `region_id`/`region_name`, `model_id`/`model_label`, `powertrain`,
  `application_id`/`application_name` and `customer_type` values of connected trucks from
  `v_vehicle_context`. The store keeps the **codes**; the sidebar shows the
  labels. See [05_Data_Relationships.md](05_Data_Relationships.md#filter-mapping).
- "Today" and "Year to Date" were removed (2026-09-30): the data window is 90 days and predictions
  are weekly.
- Only the Overview and Telematics read `powertrain`, `application` and `customerType` so far.
  Hooks that still compare region/model with display strings are fixed as each module is ported.

## Data access
- **Client-side PostgREST** queries with embedded joins,
  e.g. `.select("..., dim_vehicle!inner(vin, dim_location!inner(region_id))")`, filtered with
  `.eq("dim_vehicle.dim_location.region_id", …)`.
- **Paging:** PostgREST returns at most 1,000 rows per request. Hooks page with `.range()` in
  1,000-row blocks (`fetchAllRows`, currently duplicated per hook).
  - The Telematics version counts first (`count: "exact", head: true`) and then fetches the pages
    6 at a time. Each query orders on a unique key so pages don't overlap.
- **Target for the port:**
  - Fleet View reads **aggregates** (`fact_vehicle_daily`, `fact_trip`, weekly
    `fact_vehicle_health`).
  - Only Asset View reads raw rows (`fact_vehicle_status`, ≤ ~300 rows per truck-day).
  - Heavy aggregations should move to Postgres views or RPC functions.
- **Done so far (2026-10-01):**
  - `mv_telemetry_daily` (a materialized vehicle × signal × day rollup) replaces paging raw
    `fact_telemetry` in fleet views. That is about 58k instead of about 97k rows for 30 days, with
    narrow columns.
  - `v_failure_precursor` and `v_failure_precursor_summary` do the pre-failure signal join in
    Postgres.
  - The rollup is refreshed by `db:migrate` and `db:seed`.

## Security
| Credential | Where | Power |
|---|---|---|
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` | `.env`, bundled into the browser | `anon` role: **read-only** on all telematics tables (RLS + SELECT policy) |
| `DATABASE_URI` | `.env`, **scripts only** (no `VITE_` prefix, so never bundled) | owner-level Postgres access for migration and seeding |

- New telematics tables have RLS enabled with a `telematics_public_read` SELECT policy, and
  `anon` / `authenticated` are granted SELECT only.
- `v_vehicle_context`, `v_failure_precursor` and `v_failure_precursor_summary` use
  `security_invoker = true`, so the permissions of the underlying tables apply.
- `mv_telemetry_daily` is a materialized view, which cannot have RLS. It is granted SELECT only to
  `anon` / `authenticated`.
- Shared legacy tables keep their existing (broader) grants. They are not changed by this project.

## Commands
| Command | Purpose |
|---|---|
| `npm run dev` / `build` / `preview` | Vite dev server / production build / preview |
| `npm run lint` | oxlint |
| `npm run db:migrate` | apply `scripts/telematics-db/sql/schema.sql` (idempotent) and refresh `mv_telemetry_daily` |
| `npm run db:seed -- [flags]` | regenerate the simulated telematics dataset (one transaction) |
| `npm run db:setup` | migrate + seed |
| `npm run db:reset -- --confirm [--restore-legacy]` | remove everything the telematics scripts added |

The flags are described in [06_Data_Generation.md](06_Data_Generation.md#running-it). There is no
test suite. Data correctness is guarded by the seed's built-in consistency checks.

## Time and units
- **Time zone:** all simulated activity is IST (UTC+05:30).
  - `timestamptz` columns hold instants.
  - `date_id` is the IST calendar date.
  - `dim_date` covers 2025-01-01 → 2026-12-31.
- **Units:** km, L, kWh, °C, kPa, V, and INR in the new model.
  - Legacy and shared columns in **miles**: `dim_part.b10_design_life_miles`,
    `fact_warranty_claims.mileage_at_failure`.
  - The legacy Financial module converts INR→USD with a fixed `0.012`.
