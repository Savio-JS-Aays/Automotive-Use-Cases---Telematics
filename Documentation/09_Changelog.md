# 09 · Changelog

> Dated record of feature, data-model and documentation changes. Add an entry for every
> change, newest first.
>
> Last updated: 2026-10-23

## 2026-10-23 — Health map aggregated by model and application
- **Vehicle Diagnostics → Signal Health:** the Truck × Signal Health Map has a Trucks / Models / Applications toggle. Grouped rows show the share of trucks in warning or critical per signal; a cell click drills back to the matching trucks sorted by that signal. New `signalHeatGroups`; heatmap rows carry model ID and application.

## 2026-10-23 — Table design refresh
- **All modules:** record tables share one look (new `src/components/ui/tableStyle.js`): padded card with title, subtitle and divider; a large search box with "Showing x of y records" and CSV; framed table with a grey uppercase header, roomier rows and a bold first column. Applied through the shared `DataTable` (Telematics, Diagnostics, Reliability tables) and to the Overview Workshop Action List. Supply Chain's Reorder & Allocation Master and Financial's Financial Exposure Master now use `DataTable`, so they gain search, sorting, a record count and CSV export.

## 2026-10-23 — Repeat and In warranty removed from the Supplier Quality Table
- **Component Reliability → Supplier Quality:** the Repeat and In warranty columns (and their calculations in `supplierTable`) are removed from the table and its CSV.

## 2026-10-23 — Supplier Quality table; Supplier and Build Quality tabs split
- **Component Reliability:** "Supplier & Build Quality" is now two tabs. **Supplier Quality** (`?tab=supplier`) has the Supplier Scorecard and a new **Supplier Quality Table** (`supplierTable`): one row per supplier with status, parts, rated / below-design parts, median % of design, worst part, failures, failures per 100k km, repeat %, downtime per failure, parts cost and in-warranty share; a row opens a pop-up of the supplier's parts with a "Show in scorecard" link. **Build Quality** (`?tab=build`, new `BuildQualityTab.jsx`) has Build Cohort × Age at Failure and Where Parts Fail. Old `?tab=quality` links open Supplier Quality.

## 2026-10-23 — "TELEMATICS" header; Root Cause layout
- **App header:** the "Fleet Pulse" name and its icon are replaced by the word "TELEMATICS"; the browser tab title is "Telematics".
- **Component Reliability → Root Cause:** Main Failure Cause by Part and Precursor Ramp are stacked full width, one below the other. Precursor Ramp has no pagination (all qualifying parts in one grid); its filters stay.

## 2026-10-23 — Root Cause: all parts, pagination, filters and search
- **Component Reliability → Root Cause:** Main Failure Cause by Part lists every part with failures (no top-10 cap) with search, subsystem and clear-target filters, a sort switch and pages of 10. Precursor Ramp gets search, subsystem, signal and minimum-ramp filters and pages of 10. `mainCauses` and `precursorMatrix` rows carry the part's subsystem.

## 2026-10-23 — Fix: Supplier & Build Quality tab crash
- **Component Reliability → Supplier & Build Quality:** the tab crashed with "cohorts is not defined" after the cascading-filter change dropped the line that builds the cohort matrix. Restored. A `no-undef` lint over `src/` (oxlint) finds no other undefined names.

## 2026-10-23 — Cohort filters cascade fully
- **Component Reliability → Build Cohort × Age at Failure:** the filters now cascade model → subsystem → part → supplier. Each list only offers values found in the failures that match the filters above it (so a subsystem narrows the suppliers even with no part chosen), and changing a filter clears the ones below it.

## 2026-10-23 — Build Cohort × Age at Failure filters
- **Component Reliability → Supplier & Build Quality:** the cohort heatmap has a Quarter / Year grain switch and Model, Subsystem, Part and Supplier filters (cascading part and supplier lists). `cohortMatrix` takes options.

## 2026-10-23 — Supplier filter on the Supplier Scorecard
- **Component Reliability → Supplier & Build Quality:** the Supplier Scorecard has a Supplier select. All suppliers keeps the worst-15 view; one supplier lists all its rated parts with a summary subtitle (rated parts, below design, median % of design). `supplierScorecard` rows now carry `supplierId`.

## 2026-10-23 — Signal Health charts hidden again
- **Vehicle Diagnostics → Signal Health:** Signals vs Normal Band and the Anomaly → DTC Lead Time histogram are hidden again (`SHOW` flags off). The Anomaly → DTC Lead Time KPI card and the Signal Watchlist stay.

## 2026-10-22 — Signal Health: two charts restored, Signal Watchlist added
- **Vehicle Diagnostics → Signal Health:** Signals vs Normal Band and the Anomaly → DTC Lead Time histogram are visible again (`SHOW` flags on; the histogram is taller to sit beside the band chart). New **Signal Watchlist** table (`signalWatchlist`): every truck × signal outside its normal band, with state, days out of band, 14-day trend, linked active fault code and likely part.

## 2026-10-22 — Anomalous Reading Rate KPI removed
- **Vehicle Diagnostics → Signal Health:** the Anomalous Reading Rate card is removed; the KPI row is now four cards.

## 2026-10-22 — Fault matrix cell pop-up
- **Vehicle Diagnostics → Fault Codes:** clicking a Faults by System × group cell opens a pop-up with that cell's fault codes (ranked, click for the code panel) and its events (truck, fault, lamp, severity, first seen, status; searchable; click opens the truck), instead of filtering the Active Fault Codes table. New `systemMatrixCell`, sharing the matrix's filter logic.

## 2026-10-22 — Fault matrix filters; scrolling Most Common Faults
- **Vehicle Diagnostics → Fault Codes:** Faults by System × Model gains filters for rows (Model / Region / Application), scope (New in period / Active now), severity and lamp colour; cell clicks filter the table by the chosen group. Most Common Faults shows the top 30 in a scrolling list so its card aligns with the matrix. `systemModelMatrix` takes options; `topFaults` takes a `limit`; active-code rows carry region and application.

## 2026-10-22 — Date filter on the single-truck completeness trend
- **Telematics → Asset View:** Data Completeness Trend has its own date range (Page period, 7 / 30 / 90 days, Custom from–to) and loads the truck's packet counts for that range (new `useVehicleCompleteness`, which replaces the unused `useVehicleDayTrace`).

## 2026-10-22 — Rolling line removed from the single-truck completeness trend
- **Telematics → Asset View:** the Data Completeness Trend shows only the daily completeness line (with day markers up to 31 days); the 7-day rolling line and the legend are removed.

## 2026-10-22 — Unit source removed from the Connectivity Watchlist
- **Telematics → Data Health:** the Unit Source column is removed from the Connectivity Watchlist table and its CSV export.

## 2026-10-22 — Single-truck completeness trend
- **Telematics → Asset View (Trips & driving):** new Data Completeness Trend for the selected truck (daily and rolling 7-day packets received ÷ expected, 95 % target), beside Daily Distance & Engine Hours. New `assetCompletenessTrend`.

## 2026-10-22 — Completeness charts merged
- **Telematics → Data Health:** Completeness Trend and Completeness by Group are merged into one full-width "Completeness Trend by Region / Model": one 7-day rolling line per region or model, a dashed fleet line and the 95 % target. The "Unit source" grouping is removed. New `completenessTrendBy`; `completenessBy` removed.

## 2026-10-22 — Event Rate by Family filters
- **Telematics → Driver Safety:** Event Rate by Family has its own model, region and application filters and a 7-day / Daily smoothing switch. The truck filters restrict both events and km. `eventRateTrend` takes an optional `{ vehicleIds, windowDays }`.

## 2026-10-22 — Driver Safety drill-downs as pop-ups; layout
- **Telematics → Driver Safety:** the Safety by Group and Time in Speed Bands drill-downs open in a pop-up (new shared `Modal`) instead of expanding under the chart, so cards keep their size. Event Rate by Family now stretches to the height of Safety by Group beside it, removing the empty space under it.

## 2026-10-22 — Safety charts merged into one band chart
- **Telematics → Driver Safety:** "Safety Risk by group" and "Truck Safety Score Distribution" are merged into "Safety by Group: Score Bands & Event Rate". Each group row is a 100 % stacked bar of its trucks across Coach now / Watch / Good, with events per 1,000 km on the right. Clicking a band lists the trucks in it (search, band switch, click-through). New `safetyBandsByGroup`; `safetyDistribution` removed. Time in Speed Bands now sits beside Event Type × Severity.

## 2026-10-22 — Safety score distribution by truck; speed-band drill-down search
- **Telematics → Driver Safety:** "Driver Safety Score Distribution" is now "Truck Safety Score Distribution". It counts trucks (period score from `truckStats`) instead of drivers and has model and region filters plus "Rate trucks with" in its header. `safetyDistribution` now takes any items and returns `count`.
- **Time in Speed Bands drill-down:** search box over the truck list (VIN, vehicle ID, model).

## 2026-10-22 — Time in Speed Bands: vehicle type and truck drill-down
- **Telematics → Driver Safety:** Time in Speed Bands can be grouped by vehicle type as well as application and model. Clicking a group or one of its band segments lists every truck in that group with its own speed-band bar, sorted by the clicked band; truck rows open the Asset View. `RankedBars` gained an `onSegmentClick` prop, and `DriverSafetyTab` now receives `onOpenAsset`.

## 2026-10-22 — Driver Safety filters moved next to the charts they change
- **Telematics → Driver Safety:** the top filter bar looked global but only changed some charts, so it is split up. The event filter (families, severity, clicked event-type chip) now sits in a shaded panel with the only two charts it filters: Event Rate by Family and Safety Risk by group. Group by moved into the Safety Risk header, and "Rate drivers with" into the Driver Safety Score Distribution header. The KPI cards no longer follow the event filter: Events per 1,000 km and High-Severity Events always count all events.

## 2026-10-22 — Primary driver removed from the Fleet Roster
- **Telematics → Utilization & Uptime → Fleet Roster:** the Primary Driver column is removed and search no longer matches driver aliases (also dropped from the CSV export). The Asset View header and the Driver Safety tab still use pseudonymised driver data.

## 2026-10-22 — Utilization tab heatmap colours
- **Telematics → Utilization & Uptime:** the Activity Heatmap is now cyan and the dimension matrix uses indigo for Utilization and sky blue for Drive (Idle amber and PTO violet unchanged), so neither heat grid is green.

## 2026-10-22 — Utilization Distribution removed
- **Telematics → Utilization & Uptime:** the Utilization Distribution chart, `utilizationDistribution`, `UTILIZATION_BANDS` and the utilization-band roster filter are removed. The dimension matrix now spans the full width of its row.

## 2026-10-22 — Utilization by Application removed
- **Telematics → Utilization & Uptime:** the Utilization by Application chart and `utilizationByApplication` are removed. The same view is available in the matrix (Analyse = Application, column "All …" totals). 

## 2026-10-22 — Utilization matrix: Analyse / Across / Metric
- **Telematics → Utilization & Uptime:** the Region × Model Utilization heat grid is now a configurable matrix. Analyse and Across choose any two of Region, Vehicle Type, Model, Application and Powertrain; Metric chooses Utilization, Drive, Idle or PTO hours per truck-day. It adds row, column and grand totals, a search box, a colour legend, and roster cross-filters for vehicle type and powertrain. `vehicle_type` is now fetched from `v_vehicle_context`; `driveH` and `ptoH` were added to the per-truck stats. Details in `metrics/telematics.md`.

## 2026-10-22 — Hover values on every chart
- **All modules:** ranked-bar rows, donut slices and legend rows, heatmap cells and Overview risk-matrix cells now show their value in a tooltip that follows the pointer (new shared `Hover` component). Ranked bars without custom hover text show each segment's value and the total. Recharts charts already had tooltips and are unchanged.

## 2026-10-22 — Column-chart design refresh
- **All modules:** vertical bar charts share one style from `src/components/ui/barStyle.js`: wider bars with rounded tops, the value above each bar (stack totals on top; omitted when a chart has more than 16 bars), bold category labels, a light value axis on the right and horizontal grid lines only. Colours are unchanged.
- **Restyled:** Overview (Predicted vs Breakdown Repairs), Telematics (Daily Drive / Idle / PTO hours, Utilization Distribution, Driver Safety Score Distribution, Asset View Daily Distance & Engine Hours), Vehicle Diagnostics (Anomaly → DTC Lead Time), Component Reliability (Hazard Rate by km), Financial & Warranty (Cost by Telematics Anomaly).

## 2026-10-22 — Chart design refresh: donuts and ranked bars
- **All modules:** donut charts and horizontal-bar rankings use two new shared components, `DonutBreakdown` (centre total, rounded legend rows with value, share and progress bar) and `RankedBars` (label and value above a thick rounded track; stacked, grouped or single series; dashed reference marker; hover detail; click). `ChartHeader` now has a bold title, optional subtitle and a divider.
- **Converted:** Overview (Fleet Risk Posture, Top Predicted Failures by Part), Telematics (Utilization by application, Data Completeness by group, Safety Risk by group, Speed Bands, Idle Share by group, Diesel Split, Charging Mix), Vehicle Diagnostics (Most Common Faults, Fault Lifecycle), Component Reliability (Supplier Scorecard), Supply Chain (Stock vs Demand by location, Region-wise Urgency), Financial & Warranty (Exposure by Subsystem, Top Cost Components).
- **Unchanged:** line, area, scatter and vertical-bar charts remain Recharts charts. Axis ticks are replaced by value labels on the converted charts, so a few lose an explicit scale. `docs/UI_Guide.md` is updated with the new rules.

## 2026-10-22 — Predicted vs Breakdown Repairs chart added
- **Overview:** new monthly stacked-bar chart of predicted versus breakdown repair orders (last 6 months, filters apply but not the date range). It adds one query on `fact_repair_orders` (tagged `telematics_sim`) to `useOverviewData.js`. The label comes from `visit_type`, which the simulator assigns; it is not matched to individual alerts. Formula and caveats are in `metrics/overview.md` (C5).

## 2026-10-22 — Early-Warning Trend removed
- **Overview:** the Early-Warning Trend chart (prediction alerts and major / critical DTCs per 100 trucks, rolling 7 days) is removed, together with the separate query for `trigger = 'alert'` rows in `useOverviewData.js`.

## 2026-10-22 — Region × Model Risk Matrix band filter (Critical / High / Medium / Low)
- **Overview:** the Region × Model Risk Matrix has a Critical / High / Medium / Low switch in its header (default Critical). The earlier combined Critical + High option is removed. Each cell shows the share of trucks in the selected band, coloured by that band, and clicking a cell filters the action list by region, model and band.

## 2026-10-21 — Day Trace: Speed & Fuel Level and Safety Score card removed
- **Telematics → Asset View:** the Day Trace chart (speed, fuel level / state of charge, harsh-event dots, day chips, trip zoom) is removed. The Trip Log rows are no longer clickable, since their only action was to zoom the trace. `useVehicleDayTrace` and `fact_vehicle_status` are no longer used by the dashboard.
- **Telematics → Asset View:** the Safety Score KPI card is removed; four cards remain (Distance, Fuel Economy / Energy Use, Idle Share, Active DTCs). The fleet-level Fleet Safety Score on the Driver Safety tab is unchanged.

## 2026-10-21 — Part View KPIs trimmed
- **Component Reliability → Part View:** the Weibull Shape / Life, Failures / Running and Predicted cards are not shown; three cards remain (Field B10, Downtime per Failure, Parts Cost per Failure). The metrics documentation is updated to match.

## 2026-10-21 — KPI card deltas and sparklines removed
- **All modules:** the green / red change-vs-previous-period line and the trend sparkline are no longer rendered on any KPI card. A card now shows title, badge, value and the hover tooltip only. Change is in the shared `KpiCard` component; the `delta`, `sparkline` and `subtitle` props passed by pages are ignored.

## 2026-10-21 — KPI card subtitles removed everywhere
- **All modules:** the grey line under the value on every KPI card (for example "per 100 km", "3 red · 2 amber", the part name under a risk) is no longer rendered. The change is in the shared `KpiCard` component, so it applies to Overview, Telematics, Vehicle Diagnostics, Component Reliability, Supply Chain and Financial & Warranty at once. The change-vs-previous-period line and the sparkline are removed too (see the next entry up). The `subtitle` props passed by each page are now ignored; they are documented in the metrics files as card detail that the tooltip explains.

## 2026-10-21 — Supplier risk tier removed
- **Component Reliability → Supplier & Build Quality:** the Risk Tier Check chart is removed. The Supplier Scorecard now uses a single bar colour, drops the High / Medium / Low risk legend and tooltip wording, and spans the full width. `dim_supplier.risk_tier` is no longer fetched by the dashboard (the column stays in the database; the "Validation against the simulator" rows for risk-tier suppliers are historical).

## 2026-10-21 — Failure Modes chart removed
- **Component Reliability → Part View:** the Failure Modes bar chart is removed; Hazard Rate by km and Precursor Signature now share the row. The failure mode remains a column in the Replacements table and still feeds the Root Cause tab.

## 2026-10-21 — Worst-Part Risk card and intermittent toggle removed
- **Vehicle Diagnostics → Asset View:** the Worst-Part Risk KPI card is removed (five cards remain). The risk band pill in the header still uses the same highest-probability calculation.
- **Vehicle Diagnostics → Fault Codes:** the Repairable / + Intermittent toggle on Most Common Faults is removed. The chart always excludes intermittent (self-healed) codes, so the grey "self-healing glitch" bar colour and legend entry are gone too.

## 2026-10-21 — Driver Safety and Asset View trimmed
- **Telematics → Driver Safety:** the Eco Score KPI card and the Safety Scorecard by Model / Application / Region table are removed. The Group by toggle still drives the Safety Risk chart; the Coaching Quadrant still uses eco.
- **Telematics → Asset View:** the Eco Score KPI card (row is now five cards) and the Harsh & ADAS Event Log table are removed. Harsh events still appear as dots on the Day Trace, and the Trip Log keeps its events column.

## 2026-10-21 — Blended cost, AdBlue %, CO₂ / 100 km and Eco Score removed
- **Telematics → Fuel, Energy & CO₂:** the Blended cost tile (battery-electric section) and the AdBlue %, CO₂ / 100 km and Eco Score columns of the Model Efficiency Benchmark table are removed. The AdBlue ratio, its thresholds and the per-model CO₂ and eco calculations are deleted from `telematicsMetrics.js`. `adblue_l`, `co2_kg` and `eco_score` are still stored in the database.

## 2026-10-21 — AdBlue : Diesel KPI removed
- **Telematics → Fuel, Energy & CO₂:** the AdBlue : Diesel card is removed; the KPI row is now three cards (two when no diesel truck is in scope). The per-model "AdBlue %" column in the table is unchanged.

## 2026-10-21 — Regen share tile removed
- **Telematics → Fuel, Energy & CO₂ → Battery-electric fleet:** the Regen share tile is removed; five tiles remain. `regen_kwh` is still stored on `fact_trip`.

## 2026-10-21 — CO₂ Emitted KPI removed
- **Telematics → Fuel, Energy & CO₂:** the CO₂ Emitted card is removed; the KPI row is now four cards (two when no diesel truck is in scope). CO₂ per 100 km is still shown in the model table.

## 2026-10-09 — Beta and Eta columns removed from Component Variance Master
- **Component Reliability → Field Life:** the Beta (β) and Eta (η) columns are removed from the table. The Weibull fit is still computed and still drives the failure-pattern map, the extrapolated B10 flag and the hazard status.

## 2026-10-09 — Predicted Before Failure KPI removed
- **Component Reliability → Field Life:** the Predicted Before Failure card is removed; the KPI row is now five cards. The per-part "Predicted" card in Part View is unchanged.

## 2026-10-09 — Derate Events KPI removed
- **Vehicle Diagnostics → Fault Codes:** the Derate Events card (and its derate-conversion subtitle) is removed; the KPI row is now four cards. The "Escalated to derate" stage in the fault funnel and the per-code derate flags are unchanged.

## 2026-10-09 — Day Trace merged with Fuel level
- **Telematics → Asset View:** "Day Trace: Speed, Engine and Driver State" is now "Day Trace: Speed & Fuel Level" (State of charge for BEV). The engine and tachograph strips are removed, and the separate "Fuel level (Selected Day)" chart is merged in as a second line on a right-hand 0–100 % axis. Daily Distance & Engine Hours now spans the full width.

## 2026-10-08 — Wear Forecast removed
- **Vehicle Diagnostics → Signal Health:** the Wear Forecast: Nearest to Limit chart is removed.

## 2026-10-08 — Survival by Group removed
- **Component Reliability → Part View:** the Survival by Group chart (and its group-type selector) is removed.

## 2026-10-07 — UI restyle (KPI cards, filters, header, layout)
- Visual only; no formulas, data or chart/bar/alert colours changed.
- `KpiCard`: accent top border (derived from `iconColorClass`), bold slate title, 32 px value,
  "?" tooltip at top-right; the icon bubble is no longer drawn.
- Sidebar: "Filters" heading, wider (w-72), larger select text (`text-base`) with white fields and
  bold labels. Header: darker navy bar, white active pill, brand "Fleet Pulse".
- Cards use `rounded-2xl` / more padding, chart titles are bolder, module page titles are
  `text-2xl`, main padding is larger.

## 2026-10-01 — Failure-Mode Mix redesigned as Main Failure Cause by Part
- **Component Reliability → Root Cause:** "Failure-Mode Mix (Top 10 Parts)" (stacked bars with up to
  ~20 failure modes and a 12-colour legend) is replaced by **Main Failure Cause by Part**.
  - A ranked list of the 10 most-replaced parts. Each row has one single-colour bar for the
    failure count and a plain sentence: "Mostly {failure mode} ({share} %)".
  - Parts where one mode causes 40 % or more of the failures (and there are at least 5 failures)
    get a **Clear target** tag. Otherwise the second most common mode is shown.
  - Hovering a row lists every mode with its count and share. Clicking a row opens the Part View.
  - No legend and no colours to decode.
- Code: `mainCauses()` replaces `failureModeMix()` in `reliabilityMetrics.js`; `MODE_PALETTE` is
  removed; new constants `CLEAR_CAUSE_SHARE` and `MAIN_CAUSE_PARTS`.
- Docs: `metrics/reliability.md`.

## 2026-10-01 — Signal map shows all trucks with sorting; freeze frame as a popup
- **Vehicle Diagnostics → Signal Health → Truck × Signal Health Map:**
  - the worst-40 limit and its toggle are removed: **all trucks load**, in a scrolling grid with a
    sticky header row;
  - **sort by risk** (default), VIN or model, with a reverse button;
  - **every signal column header sorts** the trucks by that signal (worst first; click again to
    reverse; trucks without the signal go last), with an arrow on the active column.
  - `HEATMAP_ROWS` is removed; `sortHeatmap()` is new. `HeatGrid` (shared) gained optional
    `scrollClass`, `onColClick`, `sortId` and `sortDir`, and the other heatmaps are unchanged.
- **Vehicle Diagnostics → Asset View:** the standing **Freeze Frame** card is removed. The Fault
  Code Timeline is full width, and **clicking a bar opens a freeze-frame popup** (Esc, the close
  button or a click outside closes it).
- Docs: `metrics/diagnostics.md`, `docs/CLAUDE.md`.

## 2026-10-01 — Truck switcher in Asset View
- **Sidebar → Active Vehicle card:** the plain vehicle ID is replaced by a searchable **truck
  switcher** (`TruckSwitcher.jsx`). In any Asset View (Diagnostics, Telematics) you can jump to
  another truck without going back to the fleet tables.
  - Search matches VIN, vehicle ID, model, region and application; every word must match.
  - Keyboard: Up / Down to move, Enter to choose, Esc to close. The current truck is ticked.
  - Lists the connected trucks, sorted by VIN. It reuses the sidebar's existing `v_vehicle_context`
    query (now also selects `vehicle_id` and `vin`), so there is no extra request.
  - Choosing a truck sets `selectedVin`. The Asset Views re-mount on the change, so local state
    (selected trip, day, DTC) resets. The date range is kept.
- Docs: `03_Technical_Architecture.md`, `docs/CLAUDE.md`.

## 2026-10-01 — Top Fault Codes (Pareto) redesigned as Most Common Faults
- **Vehicle Diagnostics → Fault Codes:** the Pareto (occurrence bars, second axis, cumulative-%
  line, SPN / FMI labels) is replaced by **Most Common Faults**, which is easier to read.
  - **Bar = distinct trucks** with the fault. Times raised and active now are in the tooltip.
  - **Plain-English names** for all 27 codes (`FAULT_NAMES`), for example "Front brake lining
    worn". The SPN / FMI is kept in the tooltip and the drawer subtitle.
  - **Coloured by lamp:** red = stop or power limited, amber = service soon, grey = self-healing
    glitch. A legend sits under the chart.
  - A takeaway line above the bars: "{fault} is the most widespread fault: N of M trucks".
  - The top is 10 (was 15). No cumulative line.
  - The code drawer now shows the plain name as its heading.
- Code: `topFaults()` replaces `dtcPareto()` in `diagnosticsMetrics.js`; `TOP_FAULTS` replaces
  `PARETO_TOP`. No database change.
- Checked against SQL (last 30 days, Period / Active now × Repairable / + Intermittent): trucks,
  occurrences, active counts, ranking, number of codes and trucks with a fault all match. Every
  `dim_dtc` code has a name.
- Docs: `metrics/diagnostics.md`, `metrics/dtc-analysis.md`, `08_Glossary.md`,
  `01_Project_Overview.md`, `docs/CLAUDE.md`.

## 2026-10-01 — Safety views by group instead of by driver; scatter without lines
- **Telematics → Fuel, Energy & CO₂:** the Consumption vs Load scatter no longer draws a fitted
  line through each model's dots.
- **Telematics → Driver Safety:** per-driver views are replaced by fleet groups, because an OEM
  compares truck models, duty cycles and regions, not named drivers.
  - **Group by** toggle: Model / Application / Region.
  - "Worst 10 Drivers by Safety Score" → **Safety Risk by Model / Application / Region**: events
    per 1,000 km stacked by event family, with the fleet rate as a reference line.
  - "Driver Scorecard" → **Safety Scorecard by Model / Application / Region**: safety, Δ, eco,
    distance, trucks, drivers, events per 1,000 km, high-severity %, top event and Coach-now %.
  - **Removed:** the driver panel (`DriverPanel.jsx`), `worstDrivers`, `coachingFocus` and
    `driverWeeklySafety`. The score distribution no longer filters a table, and the hidden Coaching
    Quadrant has no click-through.
  - New `safetyByGroup()` in `telematicsMetrics.js`. Checked against SQL on the seeded data (30
    days): events per 1,000 km and safety match for all three groupings.
- Docs: `metrics/telematics.md`, `02_Domain_Theory.md`, `03_Technical_Architecture.md`,
  `docs/CLAUDE.md`.

## 2026-10-01 — Idle chart aggregated by model and region
- **Telematics → Fuel, Energy & CO₂:** "Worst 10 Trucks by Idle Share" is replaced by
  **Idle Share by Model and Region**, because a list of individual trucks is not actionable.
  - Groups are ratio-of-sums idle share with a By Model / By Region toggle and a fleet-average
    reference line. The tooltip adds idle hours, trucks and diesel idle cost, plus cost per
    truck-month.
  - Code: `idleByGroup()` replaces `worstIdleTrucks()` in `telematicsMetrics.js`;
    `IDLE_RANKING_MIN_ENGINE_H` is removed.
  - Docs: `metrics/telematics.md`.

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
