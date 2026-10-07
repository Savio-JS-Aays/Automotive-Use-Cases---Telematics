# Metrics · Vehicle Diagnostics (`/vehicle-diagnostics`)

> Formula reference for the Vehicle Diagnostics module (service-engineer persona): Fault Codes
> tab, Signal Health tab and the single-truck Asset View.
>
> - Code:
>   - `src/hooks/useDiagnosticsData.js`: fetch only;
>   - `src/modules/diagnostics/diagnosticsMetrics.js`: every formula below;
>   - UI in `modules/diagnostics/*.jsx`.
> - Module status: **Implemented (new data model)**, 2026-10-01. The planned standalone DTC
>   Analysis module is merged into the Fault Codes tab (see [dtc-analysis.md](dtc-analysis.md)).
> - Last updated: 2026-10-01

## Hidden charts (2026-10-01)
These charts are hidden with `SHOW` flags in `FaultCodesTab.jsx` / `SignalHealthTab.jsx`; their formulas
below remain valid and the KPI cards still show.
- Fault Codes: DTC Rate Trend by Lamp, Fault Lifecycle, Operating Conditions at Fault.
- Signal Health: Signals vs Normal Band, Anomaly Trend, Anomaly → DTC Lead Time (chart only),
  DPF Soot Load vs Differential Pressure, SCR NOx Conversion Efficiency by Model.

## Scope, periods and filters
- **Scope:**
  - trucks from `v_vehicle_context` where `is_connected = true`;
  - all six global filters apply (region, model, powertrain, application, customer type, date
    range);
  - Asset View ignores everything except the date range.
- **Period:**
  - it ends on the **latest day with data** in `fact_vehicle_daily` for the scope, not on the
    wall clock;
  - the previous period has equal length and is used for deltas.
- **Badges:**
  - **NOW:** the current state (active DTCs, latest reading);
  - **PERIOD:** follows the date range.
- **Rolling trends:** 7 days, computed as a ratio of sums. The hooks load 6 extra days before the
  period so that the first point is complete.
- **Tabs:** `?tab=faults` (default) and `?tab=signals`.
- **Asset View:**
  - `selectedVin` holds a `vehicle_id`;
  - `?signal=<code>` puts that signal first and highlights it.
- **Signal Health data:** loaded only when that tab is opened.

## Constants
| Name | Value | Where |
|---|---|---|
| `ROLLING_DAYS` | 7 | shared with Telematics |
| `MATRIX_MIN_TRUCKS` | 5 (a model below this is greyed in the System × Model heatmap) | shared |
| `TOP_FAULTS` | 10 faults | |
| `WEAR_MIN_POINTS` | 5 daily points before a wear slope is used | |
| `LEAD_LOOKBACK_DAYS` | 30 | |
| Red lamps | RSL, PL → action "Immediate Service"; AWL, MIL → "Plan Workshop" | |
| Risk bands (Asset) | Critical p > 0.7 · High ≥ 0.4 · Medium ≥ 0.2 · Low (same as the Overview) | |

## Definitions
- **Active DTC:** `fact_dtc_event.status = 'active'`.
- **Intermittent DTC:** `status = 'previously_active'`, a code that self-healed.
  - It is excluded from the repair KPIs, the rate, the funnel and the lead time.
  - Most Common Faults can include it ("+ Intermittent").
- **New DTC in the period:** `date_id` (first-seen date) lies in the period.
- **Band state of a value v** against `dim_signal`, taking `direction` into account:

  | `direction` | critical | warning |
  |---|---|---|
  | high | v ≥ `crit_threshold` | v ≥ `warn_threshold` |
  | low | v ≤ `crit_threshold` | v ≤ `warn_threshold` |

  Otherwise the state is **outside** if v < `normal_min` or v > `normal_max`, and **normal** if
  not.
- **Drifting signal of a DTC:**
  - the one key of `freeze_frame` that is not a standard key (the standard keys are
    `engine_rpm`, `ambient_temp_c`, `coolant_temp_c`, `engine_load_pct`, `wheel_speed_kmh`,
    `battery_voltage_v`);
  - it is upper-cased to a `signal_code`, for example `dpf_soot_load` → `DPF_SOOT_LOAD`.
- **Daily rollup:** `mv_telemetry_daily` (vehicle × signal × day). "Latest reading" means the
  latest day's `avg_value` in the period.

## Tab 1 · Fault Codes
**Sources:**
- `fact_dtc_event` ⋈ `dim_dtc` for every event of the scope;
- `fact_vehicle_daily.distance_km`, used as exposure;
- tagged `fact_repair_orders` where `dtc_event_id` is not null;
- `bridge_dtc_part` ⋈ `dim_part`;
- `fact_part_inventory` ⋈ `dim_location` (read-only).

### KPIs
| Title | Badge | Formula |
|---|---|---|
| Trucks with Warning Lamp | NOW | distinct trucks with an active DTC. Split: **red** = any active RSL / PL; **amber** = the rest |
| Active Fault Codes | NOW | `count(status = 'active')`; subtitle by `dim_dtc.severity_class` |
| DTC Rate per 10k km | PERIOD | new non-intermittent DTCs ÷ Σ `distance_km` × 10,000. Delta = % change vs the previous period (lower is good). Sparkline = 7-day rolling total |
| Derate Events | PERIOD | `count(caused_derate)` among new DTCs. Subtitle = derate conversion = `count(caused_derate)` ÷ count of new DTCs whose code has `can_derate` |
| Mean Time to Clear | PERIOD | mean(`cleared_ts − first_seen_ts`) in days, over events whose `cleared_ts` falls in the period. Subtitle: cleared count, and intermittent share = intermittent ÷ all DTCs first seen in the period |

### Charts and tables
- **Most Common Faults.** Simple horizontal bars (replaced "Top Fault Codes (Pareto)" on
  2026-10-01, which had a cumulative-% line, a second axis and SPN / FMI labels).
  - **Bar = distinct trucks** that had the fault in scope: `count(distinct vehicle_id) by dtc_id`.
    A truck that raised the same code five times counts once, so one noisy truck cannot dominate.
  - Times raised (`count(*)`) and active now (`count(status = 'active')`) are in the tooltip.
  - Sorted by trucks descending, then by times raised. Top `TOP_FAULTS` = 10.
  - **Name:** a plain-English name from `FAULT_NAMES` in `diagnosticsMetrics.js` (for example
    "Front brake lining worn" for `SPN1099-FMI18`). It is display text only. `dim_dtc` keeps the
    technical description, which the code drawer shows as a subtitle with the SPN / FMI. A code
    without an entry falls back to its SPN description plus a short FMI phrase.
  - **Colour:** by the code's `default_lamp`.
    - Red: RSL or PL, meaning stop or power limited.
    - Amber: AWL or MIL, meaning service soon.
    - Grey: codes whose occurrences all self-healed, shown only with "+ Intermittent".
  - **Takeaway line above the bars:** "{top fault} is the most widespread fault: N of M trucks
    with a fault." M = distinct trucks with any fault in scope.
  - **Footnote:** "Showing the top 10 of K faults · M trucks had at least one."
  - Scope toggle: Period / Active now. Repairable / + Intermittent toggle.
  - Clicking a bar opens the code drawer, titled with the plain name.
- **Faults by System × Model.** Heatmap.
  - cell = new non-intermittent DTCs of (model, `dim_dtc.system`) ÷ the model's trucks in scope ×
    100;
  - models with fewer than 5 trucks are muted;
  - clicking a cell filters the Active Fault Codes table (filter chip).
- **DTC Rate Trend by Lamp.** Stacked area.
  - per day and lamp: Σ new DTCs over the trailing 7 days ÷ Σ km over the same 7 days × 10,000;
  - the lamp layers add up to the total rate.
- **Fault Lifecycle.** Horizontal bars over new non-intermittent DTCs of the period.

  | Stage | Counted when |
  |---|---|
  | Raised | every such DTC |
  | Escalated to derate | `caused_derate` |
  | Repair order opened | a tagged repair order has `dtc_event_id` = the event, or `resolved_by_ro_id` is set |
  | Cleared | `status = 'cleared'` |

  Each stage is labelled as % of Raised.
- **Operating Conditions at Fault.** Scatter.
  - x = `freeze_frame.ambient_temp_c`, y = `freeze_frame.engine_load_pct`;
  - one point per DTC first seen in the period, coloured by `dim_dtc.system`.
- **Active Fault Codes.** Table of active DTCs with VIN, model, code, system, lamp, severity, age,
  occurrences, derate, `recommended_action` and an action pill.
  - age = latest `last_ping_ts` in the scope − `first_seen_ts`;
  - sorted with Immediate Service first, then by severity and age;
  - clicking a row opens Asset View;
  - CSV export.
- **DTC code drawer.** For one `dtc_id`:
  - the catalog fields (SPN/FMI descriptions, ECU, lamp, severity, can derate, recommended
    action);
  - period / active / truck counts;
  - a by-model count of active and period events;
  - the freeze-frame mean of every numeric key;
  - likely parts from `bridge_dtc_part` with their `likelihood`, the Σ `fact_part_inventory.quantity`
    in the scope's regions, and a link to Reliability's Part View;
  - the affected trucks, each opening Asset View.

## Tab 2 · Signal Health
**Sources:**
- `dim_signal`;
- `mv_telemetry_daily` for the scope, from period start − 6 days to the period end;
- a lead-time lookup on `mv_telemetry_daily` for trucks with a DTC in the period: rows with
  `anomalous_readings > 0` from period start − 30 days.

### KPIs
| Title | Badge | Formula |
|---|---|---|
| Trucks with Critical Signal | NOW | distinct trucks with at least one latest reading in the **critical** state |
| Signals Out of Band | NOW | count of (truck × signal) latest readings not in the **normal** state, out of all pairs |
| Trucks with Anomalies | PERIOD | distinct trucks with `anomalous_readings > 0` on some day of the period |
| Anomalous Reading Rate | PERIOD | Σ `anomalous_readings` ÷ Σ `readings` × 100 |
| Anomaly → DTC Lead Time | PERIOD | median lead time (below). Subtitle: share of linked DTCs that had a prior anomaly |

### Charts
- **Truck × Signal Health Map.** Heatmap on the latest reading.
  - cell colour value = state rank (critical 3, warning 2, outside 1, normal 0) + min(`max_abs_z`
    ÷ 10, 0.9);
  - the number shown is `max_abs_z`;
  - **all trucks are listed** (the former worst-40 limit and its toggle were removed on
    2026-10-01); the grid scrolls vertically with a sticky header row;
  - **sort:** Risk (default), VIN or Model buttons, plus a reverse button (Worst first / Best first,
    A → Z / Z → A);
  - **sort by signal:** clicking a signal's column header sorts the trucks by that signal: band
    state rank (critical 3 … normal 0) × 100 + `max_abs_z`, worst first; clicking again reverses.
    Trucks without that signal always go last. An arrow marks the active column;
  - the default **Risk** order is the truck's worst band state × 100 + its max |z| over all its
    signals, worst first;
  - the footnote states how many trucks have a warning or critical signal and the active sort;
  - columns are the health signals present that have a normal band;
  - clicking a cell opens Asset View with `?signal=`.
- **Signals vs Normal Band.** One row per signal on its own scale.
  - the shaded area is the normal band; ticks mark warning and critical;
  - box = P25–P75, whiskers = P5–P95, tick = median, all over the trucks' latest values;
  - quantiles use linear interpolation at index (n − 1)·p;
  - right-hand count = trucks in critical / warning (or outside).
- **Anomaly Trend.** Per day: Σ anomalous truck-days over the trailing 7 days ÷ Σ reporting
  truck-days × 100. A truck-day is anomalous when any signal has `anomalous_readings > 0`.
- **DPF Soot Load vs Differential Pressure.** Scatter.
  - one point per diesel truck: latest `DPF_SOOT_LOAD` (x) against `DPF_DIFF_PRESSURE` (y);
  - the shaded rectangle is both normal bands; dashed lines are the critical thresholds;
  - coloured by model; clicking a point opens Asset View.
- **SCR NOx Conversion Efficiency by Model.** Per model and day: the 7-day rolling mean of
  truck-day `avg_value` of `SCR_EFFICIENCY`, with a warning reference line.
- **Wear Forecast: Nearest to Limit** (toggle: `BRAKE_LINING_REMAINING` / `HV_SOH`). Per truck:
  1. Fit a least-squares slope of daily `avg_value` against day index over the period (needs at
     least 5 points).
  2. remaining = latest − `crit_threshold` for low-is-bad signals, or `crit_threshold` − latest
     for high-is-bad ones.
  3. days to limit = remaining ÷ (the slope toward the limit). It is 0 if the value is already
     past the limit; trucks not trending toward the limit are dropped.
  4. km to limit = days × the truck's average km per day in the period.

  The 10 trucks with the fewest days are shown. Bars are red at ≤ 14 days and amber at ≤ 45.
- **Anomaly → DTC Lead Time.** Histogram, for each new non-intermittent DTC whose drifting signal
  exists in `dim_signal`:
  - lead time = first-seen date − the earliest day in [first seen − 30 days, first seen] where
    that truck × signal had `anomalous_readings > 0`;
  - buckets: same day / 1–3 / 4–7 / 8–14 / 15–30 days / no warning.

## Asset View
**Sources:**
- `v_vehicle_context`, including the warranty fields;
- `dim_signal`;
- **raw** `fact_telemetry` for the period;
- all of the truck's `fact_dtc_event` ⋈ `dim_dtc`;
- `fact_vehicle_health` ⋈ `dim_part` from period start − 7 days;
- tagged `fact_repair_orders` and `fact_part_replacement` for the truck's whole life;
- the latest `fact_vehicle_daily` row;
- bridge and inventory.

### Header and KPIs
- **Header:**
  - the status pill is the risk band of the worst part;
  - the warranty badge reads "in warranty" when the latest date ≤ `warranty_end_date` **and** the
    odometer ≤ `warranty_km_limit`.

| KPI | Formula |
|---|---|
| Worst-Part Risk | max `failure_probability` over the latest prediction per `part_id` (weekly or alert) |
| Min RUL | min `rul_km` (and min `rul_days`) over the same latest predictions |
| Active Faults | `count(status = 'active')`, by lamp |
| Signals Out of Band | latest raw reading per signal whose state is not normal ÷ signals with a band |
| Odometer | latest `odometer_km_end` |
| Last Ping | latest `last_ping_ts` |

### Visuals
- **Health Signals.** Small multiples, one per signal, over raw readings.
  - the normal band is shaded; warning and critical are dashed lines;
  - red dots mark `is_anomalous` readings;
  - vertical lines (coloured by lamp) mark DTCs in the period whose drifting signal is this one;
  - ordered by state, then by anomaly count; a `?signal=` signal goes first.
- **Fault Code Timeline.** Gantt.
  - each bar runs from `first_seen_ts` to `cleared_ts`, or to `last_seen_ts` for intermittent
    codes, or to the latest ping if still active;
  - bars are clipped to the period and coloured by lamp; intermittent codes are faded;
  - the timeline is full width. There is no standing Freeze Frame card any more (changed on
    2026-10-01): **clicking a bar opens a freeze-frame popup** with the lamp, severity and derate
    pills, first seen, odometer, occurrences, every `freeze_frame` key and the recommended
    action. Esc, the close button or a click outside closes it.
- **Part Failure Risk Trend.** Weekly (`trigger = 'weekly'`) `failure_probability` × 100 for the
  5 parts with the highest peak probability. Dashed vertical lines mark alert days; a 70 % line
  marks Critical.
- **Workshop Prep.**
  - actions = active DTCs, each with `recommended_action` and the lamp-based urgency;
  - plus Critical / High latest predictions with `ai_prescriptive_action`;
  - parts to stage = `bridge_dtc_part` parts of the active codes (keeping the max likelihood) ∪
    parts with a Critical / High prediction (score = p);
  - stock = `fact_part_inventory.quantity` at the truck's `location_id` and summed over its
    region;
  - "Copy work-order summary" copies a plain-text draft to the clipboard. It does **not** write to
    the DB.
- **Service History.** Table of the truck's repair orders, newest first, each with its replaced
  parts and failure modes, odometer, downtime, parts + labour cost, and predicted / warranty flags.

## Known limits
- The anomaly flag (`is_anomalous`) comes from the simulator's
  |z| > 3 or (Mahalanobis > 3 and |z| > 2) rule. Slow-drifting wear signals rarely trip it, which
  shows up as "no warning" lead times.
- The drifting-signal link relies on the freeze-frame extra key. Intermittent codes have none.
- `fact_part_inventory` covers only 10 parts per location, so "stock at home depot" is often 0.
- Deferred to a later version:
  - the Predictive Risk tab (risk ladder by part, RUL runway, probability trend);
  - peer percentile in Asset View;
  - the DTC co-occurrence matrix.
