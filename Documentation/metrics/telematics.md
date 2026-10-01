# Metrics · Telematics (`/telematics-data`)

> Formula reference for every KPI, chart and table in the Telematics module: utilization,
> fuel / energy / CO₂, driver behaviour and data health, plus the single-truck Asset View.
>
> - Code:
>   - `src/hooks/useTelematicsData.js` (fetch);
>   - `src/modules/telematics/telematicsMetrics.js` (every formula, pure functions);
>   - `src/modules/telematics/*Tab.jsx`, `AssetTelematicsView.jsx`, `DriverPanel.jsx` (UI).
> - Module status: **Implemented (new data model)**, 2026-10-01. Nav link: "Telematics".
> - Audience: fleet manager (utilization, fuel), safety manager (drivers), OEM connected
>   services (data health), OEM product / pre-sales (model benchmark).
> - Last updated: 2026-10-01

## Principles
- **Fleet View = 4 tabs**; the tab is kept in the URL (`?tab=utilization|fuel|safety|data`).
  **Asset View** replaces the tabs when `selectedVin` (a `vehicle_id`) is set.
- **NOW vs PERIOD** badges, as on the Overview:
  - **NOW** = latest day / current DTC state;
  - **PERIOD** = follows the date range.
- **The period ends on the latest data day**, not on the wall clock:
  - `end = max(fact_vehicle_daily.date_id)` for the scope, `start = end − (days − 1)`;
  - the previous period is the `days` before `start`;
  - so the module still works when the seeded data isn't live.
- **Deltas** compare with the previous period. They are only shown when it has ≥ 80 % of the
  expected vehicle-days (`MIN_PREV_COVERAGE`, same rule as the Overview). With the 90-day
  window, "Last 90 Days" therefore shows no deltas.
- **Rates are ratios of sums**, never averages of ratios:
  - L/100 km = Σ L ÷ Σ km;
  - rolling series = Σ numerator over 7 days ÷ Σ denominator over 7 days.
- **Scores are distance-weighted:** `Σ(score × km) ÷ Σ km` over rows with a score and km > 0.
- **Local filters never refetch.** The hook returns rows; tabs derive everything in `useMemo`.

## Scope and data loaded
**Scope S:** `v_vehicle_context` where `is_connected = true`, plus every global filter:

| Filter | Column |
|---|---|
| Region | `region_id` |
| Vehicle model | `model_id` |
| Powertrain | `powertrain` |
| Application | `application_id` |
| Customer type | `customer_type` |

Every fact query is restricted with `.in("vehicle_id", S)`.

| Data | Source | Rows (30 d, no filters) | Window |
|---|---|---|---|
| daily | `fact_vehicle_daily` | ~12,000 | previous + current period |
| trips | `fact_trip` (incl. `speed_class_s` jsonb) | ~10,300 | current period |
| events | `fact_harsh_events` | ~19,600 | previous + current period |
| charging | `fact_charging_session` (only if a BEV is in scope) | ~1,400 | current period |
| models | `dim_v_model` (`base_consumption`, `consumption_unit`) | 5 | — |
| drivers | `dim_driver` (`driver_alias`) | 240 | — |

**Paging:** count first, then pull 1,000-row pages 6 at a time (`fetchAllRows`). Each tab loads
in ~5–6 s over the network with no filters (measured 2026-10-01).

## Constants (`telematicsMetrics.js`)
| Name | Value | Use |
|---|---|---|
| `DIESEL_PRICE_INR_PER_L` | 90 | idle waste cost; same constant as the simulator |
| `ADBLUE_NORMAL_PCT` / `ADBLUE_LOW_PCT` | 5.5 / 3 | AdBlue ratio reference / low flag |
| `ADBLUE_MIN_FUEL_L` | 100 | minimum diesel before a truck's ratio is rated |
| `ROLLING_DAYS` | 7 | every rolling series |
| `MATRIX_MIN_TRUCKS` | 5 | Region × Model cells below this are grey, not rated |
| `MIN_PREV_COVERAGE` | 0.8 | delta rule |
| `SILENT_HOURS` | 48 | stale-report threshold (same as the Overview) |
| `LOW_COMPLETENESS_PCT` | 90 | connectivity watchlist |
| `IDLE_RANKING_MIN_ENGINE_H` | 10 | minimum engine hours for the idle ranking |
| `OVERSPEED_LIMIT_KMH` | 80 | reference line (Indian HGV governed speed) |

**Decision (2026-10-01): idle waste cost** = measured `idle_fuel_l × ₹90`. This replaces the
Domain.md estimate `idle h × 1.2 gal/h × $3.50`, because the new model measures idle fuel
directly (rFMS "fuel used at standstill") and the project reports in INR.

---

## Truck roll-up (`truckStats`)
One row per truck in S, over the current period. Shared by the roster, rankings, matrix,
distribution and data health.

| Field | Formula |
|---|---|
| utilization | `Σ engine_hours ÷ (vehicle-days × 24) × 100` |
| idlePct | `Σ idle_hours ÷ Σ engine_hours × 100` |
| consumption | diesel: `Σ fuel_l ÷ Σ distance_km × 100` (L/100 km); BEV: `Σ energy_kwh ÷ Σ km × 100` |
| idleCostInr | `Σ idle_fuel_l × 90` |
| adbluePct | `Σ adblue_l ÷ Σ fuel_l × 100`, only if `Σ fuel_l ≥ 100` |
| safety / eco | distance-weighted daily `safety_score` / `eco_score` |
| completeness | `Σ packets_received ÷ Σ packets_expected × 100` |
| lastPing | max `last_ping_ts` over all loaded days |

**Status**, from the truck's latest day, first match wins:

| Status | Rule |
|---|---|
| Workshop | `in_workshop` |
| Derated | `derate_active` or `red_lamp_flag` |
| Silent | `packets_received = 0` while `packets_expected > 0`, or `lastPing` older than 48 h before "data now" |
| Active | `is_operating` |
| Parked | otherwise |

"Data now" = the latest `last_ping_ts` in the scope.

**Why not "no ping for 24 h":** `last_ping_ts` is the last *report*. Parked trucks still send 24
hourly heartbeats (counted in `packets_received`), but their `last_ping_ts` stays at the previous
engine-off. A 24 h rule flagged 28 parked trucks as silent. Result on 2026-09-30: 174 Active,
22 Parked, 4 Workshop, 0 Silent.

---

## Tab 1 · Utilization & Uptime
### KPIs
| Title | Badge | Formula | Delta |
|---|---|---|---|
| Fleet Utilization | PERIOD | `Σ engine_hours ÷ (vehicle-days × 24) × 100`; sparkline = 7-day rolling ratio | pp |
| Active Trucks | NOW | `count(is_operating on end date) / N` | — |
| Vehicle Uptime | PERIOD | `(1 − count(in_workshop) ÷ vehicle-days) × 100`; subtitle: workshop days, derate / red-lamp days | pp |
| Avg km per Operating Day | PERIOD | `Σ distance_km ÷ count(is_operating)` | km |

### Charts
**Drive / Idle / PTO Hours per Truck-Day** (stacked bar + line)
- **Formula:** per bucket, `Σ drive_hours`, `Σ idle_hours` and `Σ pto_hours ÷ vehicle-days`.
- **Line:** utilization %. Daily view = 7-day rolling; weekly view = that week's value.
- **Local filter:** Daily / Weekly (ISO week, Monday start).

**Activity Heatmap (Hour × Weekday)**
- Built from `fact_trip.start_ts / end_ts`, in the browser's local time (IST).
- Each trip is split into hour slices.
- **Local metric toggle:**
  - "Fleet running %" = `engine-on hours in cell ÷ (N × number of that weekday in period) × 100`;
  - "Trip starts" = `trip starts in cell ÷ number of that weekday`.

**Region × Model Utilization** (heat grid)
- **Cell:** `Σ engine_hours ÷ (Σ vehicle-days × 24)` over the trucks in the cell.
- **Low sample:** cells with < 5 trucks are grey and not rated.
- **Drill-down:** click → roster filtered to that region and model.

**Utilization Distribution** (bar)
- **Formula:** trucks per 10-point utilization bin (0–10 … 60+).
- **Colours:** < 20 % amber (under-used), 20–50 % blue, ≥ 50 % green.
- **Drill-down:** click → roster filtered to that bin.

**Utilization by Application** (horizontal bar)
- **Formula:** utilization per `application_name`; the tooltip adds trucks and km per operating
  day.
- **Drill-down:** click → roster filtered to that application.

### Table: Fleet Roster
- **Columns:** truck (VIN, model · region), primary driver alias, status pill, utilization,
  distance, idle %, safety, eco, data completeness, last ping.
- **Controls:**
  - status pills with counts;
  - cross-filter chips;
  - search (VIN / vehicle / driver);
  - sort on any column (default utilization ascending);
  - CSV export.
- **Drill-down:** row click → Asset View.

---

## Tab 2 · Fuel, Energy & CO₂
Diesel-only cards (Idle Waste Cost, AdBlue, Diesel Split) are hidden when no diesel truck is in
scope.

### KPIs
| Title | Formula | Delta |
|---|---|---|
| Fuel Economy (diesel) / Energy Economy (BEV-only scope) | `Σ fuel_l ÷ Σ km × 100` over diesel vehicle-days; BEV `Σ energy_kwh ÷ Σ km × 100` shown in the subtitle | L (lower is better) |
| Idle Waste Cost | `Σ idle_fuel_l × ₹90`; subtitle: `÷ N ÷ days × 30` per truck-month, litres | % change |
| Idle Share | `Σ idle_hours ÷ Σ engine_hours × 100` | pp |
| CO₂ Emitted | `Σ co2_kg ÷ 1000` t (`co2 = diesel L × 2.68`; BEV 0); subtitle kg / 100 km | % change |
| AdBlue : Diesel | `Σ adblue_l ÷ Σ fuel_l × 100`; subtitle: trucks < 3 % | pp |

### Charts
**Consumption Trend by Model** (line per model)
- **Formula:** 7-day rolling `Σ fuel ÷ Σ km × 100` (or kWh) per model.
- **Reference:** dashed line = `dim_v_model.base_consumption` (rated).
- **Local filter:** Diesel L / BEV kWh toggle.

**Worst 10 Trucks by Idle Share** (horizontal bar)
- **Formula:** idlePct per truck, among trucks with ≥ 10 engine hours.
- **Tooltip:** idle hours and ₹ cost.
- **Drill-down:** click → Asset View.

**Consumption vs Load** (scatter per model, fitted line)
- **One dot per trip:** x = `avg_gcw_kg ÷ 1000` (t), y = `fuel_used_l` (or `energy_used_kwh`)
  `÷ distance_km × 100`.
- **Local filters:**
  - Diesel / BEV toggle;
  - minimum trip length (≥ 5 / 20 / 50 / 100 km, default 20).
- **Display cap:** each model is stride-sampled to ≤ 400 points; the fitted line uses the sample.
- **Drill-down:** click → Asset View.

**Diesel Split: Driving / Idle / PTO by Application** (100 % stacked bar)
- **Source:** trips.
- **Formula:** `drive = fuel_used_l − idle_fuel_l − pto_fuel_l`, where `fuel_used_l` already
  includes idle and PTO fuel. Each part is shown as a share of `fuel_used_l`, with litres in the
  tooltip.

### EV section (shown when a BEV is in scope)
**Tiles**

| Tile | Formula |
|---|---|
| Charging sessions | session count |
| Energy charged | MWh |
| Blended cost | `Σ cost_inr ÷ Σ energy_kwh` |
| Public charging share | `public DC kWh ÷ total kWh` |
| Charging spend | ₹ |
| Regen share | `Σ regen_kwh ÷ (Σ energy_used_kwh + Σ regen_kwh)`; `energy_used_kwh` is net of regen |

**Charging Mix**
- **Formula:** kWh by `charger_type`.
- **Tooltip:** ₹, ₹/kWh, session count, average SoC gain.

**Energy Use vs Ambient Temperature** _(hidden 2026-10-01: `SHOW.energyVsTemperature` in FuelEnergyTab.jsx)_
- **One dot per BEV trip:** x = `ambient_temp_c`, y = kWh / 100 km, with a fitted line.
- **Filters:** same minimum trip length as above; capped at 600 points.

### Table: Model Efficiency Benchmark
- **One row per model:** trucks, km, actual vs rated consumption.
- **Gap:** `(actual − rated) ÷ rated`; red when > +5 %.
- **Also shown:** idle %, AdBlue %, CO₂ per 100 km, eco (distance-weighted trip `eco_score`).
- **Controls:** sort, CSV.

---

## Tab 3 · Driver Safety
### Local filter bar
Applies to event counts, rates, event mix and the scorecard's event columns. The safety score is
computed from penalties by the simulator, so it ignores the event filter.

**Event families** (multi-select chips):

| Family | Event types |
|---|---|
| Harsh driving | harsh_brake, harsh_accel, harsh_cornering |
| Speed & RPM | overspeed, over_rev |
| ADAS | aba_warning, aba_full_brake, lane_departure, close_following |
| Idling | excessive_idle |

**Other controls:**
- **Severity:** all / high / medium / low.
- **"Rank drivers with":** ≥ 100 / 500 (default) / 1,000 / 3,000 km. Used by the rankings,
  distribution, quadrant and scorecard to exclude small samples.
- **Event:** a single type, set by clicking a matrix cell and shown as a chip.

### KPIs
| Title | Formula | Delta |
|---|---|---|
| Fleet Safety Score | distance-weighted daily `safety_score` (formula in [02 §5](../02_Domain_Theory.md#5-driver-behaviour)) | pts |
| Events per 1,000 km | `count(filtered events) ÷ Σ distance_km × 1000` | lower is better |
| High-Severity Events | `count(filtered events with severity = high)` | — |
| Eco Score | distance-weighted trip `eco_score` | — |
| ADAS Activations | ADAS-family events on `adas_equipped` trucks ÷ their km × 1000 | — |

### Charts
**Event Rate by Family** (stacked area)
- **Formula:** per family, `7-day Σ events ÷ 7-day Σ km × 1000`.

**Worst 10 Drivers by Safety Score** (horizontal bar)
- **Formula:** distance-weighted `safety_score` of the vehicle-days assigned to the driver
  (`fact_vehicle_daily.driver_id`), among drivers above the km threshold.
- **Colours:** red < 70, amber 70–85, green ≥ 85.
- **Drill-down:** click → driver panel.

**Event Type × Severity** (heat grid)
- **Formula:** counts in the period. The grid ignores the local filter, because it *is* one.
- **Drill-down:** click → sets event type + severity for the whole tab.

**Driver Safety Score Distribution** (bar)
- **Formula:** drivers per 5-point bin (< 60 … 95+), coloured by band.
- **Drill-down:** click → scorecard filtered to that band.

**Coaching Quadrant: Eco vs Safety** (bubble) _(hidden 2026-10-01: `SHOW.coachingQuadrant` in DriverSafetyTab.jsx)_
- **One bubble per driver:** x = eco (trips), y = safety, size = km.
- **Split lines:** safety 85, eco 70.
- **Drill-down:** click → driver panel.

**Time in Speed Bands** (100 % stacked bar)
- **Formula:** `Σ speed_class_s` per band (0–30, 30–50, 50–70, 70–80, > 80 km/h) ÷ total.
- **Local filter:** by application or by model.

### Table: Driver Scorecard
- **Columns:** alias, band pill, safety, Δ safety, eco, distance, events / 1k km, top event type,
  trucks driven.
- **Δ safety** = current − previous period, shown when the previous period has ≥ 3 days for the
  driver.
- **Controls:** search, sort (default safety ascending), CSV.
- **Drill-down:** row → driver panel.

### Driver panel (drawer)
**Sources:**
- safety and km from `fact_vehicle_daily.driver_id`;
- events from `fact_harsh_events.driver_id`;
- driving style from `fact_trip.driver_id` (relief drivers are counted on the trips they
  drove).

**Stat tiles**

| Tile | Formula |
|---|---|
| Safety, eco, km, events / 1k km | as in the scorecard |
| RPM green band | `Σ(rpm_green_band_pct × drive_s) ÷ Σ drive_s` (BEV: coasting %) |
| Cruise | distance-weighted `cruise_distance_pct` |
| Idle | `Σ idle_s ÷ (Σ drive_s + Σ idle_s)` |
| Brakes / 100 km | `Σ brake_applications ÷ Σ km × 100` |

**Weekly safety** (line)
- **Formula:** distance-weighted, per ISO week.
- **Reference lines:** 70 and 85.

**Event mix**
- **Formula:** counts by type, following the event filter.

**Trucks driven**
- **Content:** the driver's trucks with km.
- **Drill-down:** click → Asset View.

**Coaching focus** (plain-language tips, compared with fleet medians):

| Tip | Shown when |
|---|---|
| Top event type | always (its share of the driver's events) |
| Brakes / 100 km | > 1.3 × median |
| Green band % | < median − 10 pp (diesel only) |
| Idle % | > 1.3 × median |
| Cruise % | < median − 10 pp |
| Overspeed s / 100 km | > 1.5 × max(median, 1) |

**Privacy:** aliases only, with a GDPR note in the panel.

---

## Tab 4 · Data Health
### KPIs
| Title | Formula | Delta |
|---|---|---|
| Connected Trucks | N | — |
| Data Completeness | `Σ packets_received ÷ Σ packets_expected × 100` | pp |
| Trucks < 90 % Complete | trucks with completeness < 90 % | — |
| Silent Trucks | trucks with status Silent (see the status rules above) | — |

### Charts
**Completeness Trend**
- **Formula:** 7-day rolling received ÷ expected.
- **Reference:** 95 % target line.

**Completeness by Group** (horizontal bar)
- **Local toggle:** by region, telematics unit source (`telematics_source`) or model.
- **Order:** weakest first.
- **Colours:** amber below 95 %.

### Table: Connectivity Watchlist
- **Rows:** trucks that are Silent or below 90 %. "Only trucks with an issue" is on by default;
  untick it to see all trucks.
- **Columns:** unit source, status, completeness, packets received / expected, last ping.
- **Controls:** CSV.
- **Drill-down:** row → Asset View.

---

## Asset View (one truck)
**Loaded data:**
- `v_vehicle_context` row and the model's rated consumption;
- period rows: `fact_vehicle_daily`, `fact_trip`, `fact_harsh_events` (with lat/lon, speed
  before → after, peak g);
- active DTCs: `fact_dtc_event` with `status = 'active'` and `dim_dtc`;
- the list of days available in `fact_vehicle_status` (the last 7 days).

**Header:** VIN, powertrain pill, vehicle ID, model, region, application, customer type, primary
driver, last ping. Buttons: "Open in Diagnostics", "Back to fleet".

| KPI | Formula |
|---|---|
| Safety Score | distance-weighted daily `safety_score`; subtitle events, events / 1k km |
| Eco Score | distance-weighted daily `eco_score` |
| Distance | Σ km; operating days / days; km per operating day |
| Fuel Economy / Energy Use | `Σ fuel_l (or energy_kwh) ÷ Σ km × 100`; delta = `(actual − rated) ÷ rated` labelled "vs rated" |
| Idle Share | idle h ÷ engine h; diesel subtitle `Σ idle_fuel_l × ₹90` |
| Active DTCs (NOW) | count of active DTC events; subtitle red lamp (`RSL`) / derate count. Click → Diagnostics |

### Charts
**Day Trace: Speed, Engine and Driver State**
- **Source:** `fact_vehicle_status` for one day (`useVehicleDayTrace`, loaded separately).
- **Line:** `wheel_speed_kmh` against time.
- **Dots:** harsh events at `speed_before_kmh`, coloured by severity.
- **Reference:** 80 km/h line.
- **Strips:**
  - `engine_state` (running / ready green, idle amber, PTO violet);
  - tachograph `driver_working_state`.
- **Day chips:** the 7 available days, default the latest.
- **Trip zoom:** clicking a trip in the trip log narrows the trace to that `trip_id`. Trips older
  than 7 days only filter the event log, with a notice.

**Fuel level / State of charge**
- **Formula:** `fuel_level_pct` (diesel) or `soc_pct` (BEV) for the same day.

**Daily Distance & Engine Hours**
- **Formula:** `distance_km` bars and `engine_hours` line per day.

### Tables
**Trip Log** (newest first)
- **Columns:** start, route (start → end city), km, duration, consumption per 100 km,
  idle % = `idle_s ÷ (drive_s + idle_s + pto_s)`, events, eco.
- **Controls:** search, CSV.
- **Drill-down:** click → trip zoom.

**Harsh & ADAS Event Log**
- **Columns:** time, type, severity pill, speed before → after, peak g, source, position.
- **Position:** links to OpenStreetMap.
- **Trip filter:** follows the selected trip.
- **Controls:** CSV.

---

## Verification (2026-10-01, Last 30 Days, no filters)
- **Utilization:** 32.84 %, matching an independent `Σ engine_hours ÷ (6,000 vehicle-days × 24)`.
- **Uptime:** 97.8 %.
- **Fuel:** 30.9 L / 100 km diesel, 106 kWh / 100 km BEV; idle waste ₹13.57 L; CO₂ 969 t;
  AdBlue 5.49 %.
- **Safety:** score 86.6; 6.14 events / 1,000 km.
- **Data:** completeness 96.2 %; East is weakest at 91.8 %.
- **Model benchmark:** 3528C is +48.5 % over rated (tipper / mining duty cycle, 30 % idle);
  eActros is −3.6 %.
- **App run:** headless Chromium on every tab, the driver panel, the Asset View and the BEV-only
  filter showed no console errors.

## Known issues / limitations
- **Client-side aggregation.** A 90-day range loads ~18k daily rows, ~30k trips and ~30k events.
  Move the heavy roll-ups into Postgres views or RPCs if the fleet grows beyond the 200-truck
  sample.
- **Day trace window.** `fact_vehicle_status` holds only the last 7 days, so older trips can't be
  traced.
- **Heatmap time zone.** The heatmap uses the browser's local time zone. The data is IST, so a
  viewer in another zone sees shifted hours.
- **Driver attribution.** Driver safety comes from the vehicle-day's assigned driver, while
  driving style comes from trips. A relief driver's events count against them, but their km come
  from the days they were the assigned driver.

## Backlog (suggested, not yet built)
**P2**
- Downtime calendar: vehicle × day grid of operating / idle / workshop / derate.
- Event hotspot map (Leaflet or a lat/lon scatter).
- RPM-band profile.
- SoC start → end dumbbell per charging session.
- Hour × event-type fatigue heatmap.
- Model-year / in-service cohort global filter.
- Custom date range.

**P3**
- Idle-cost Pareto with a cumulative line.
- Engine RPM × load operating-point cloud (needs a status-level aggregate).
- Route map for the Asset View.
