# Project Context — Fleet Pulse for OEM Connected Trucks

> Companion to `Domain.md` (business rules), `UI_Guide.md` (styling/charting rules) and
> `CLAUDE.md` (current code + schema). This file describes **where the product is going**: the OEM
> we build for, the features on the roadmap, and the redesigned telematics data model that
> replaces today's `fact_telemetry`.

---

## 1. Product & audience

Fleet Pulse is an **OEM connected-vehicle analytics** demo. It shows what a truck manufacturer such
as **Daimler Truck** can offer its fleet customers and its own service/quality organisation from
the data its trucks already transmit.

Target vehicle portfolio (heavy/medium commercial vehicles):

| Brand | Models | Powertrain |
|---|---|---|
| Mercedes-Benz Trucks | Actros, Arocs, Atego, **eActros** | Diesel (OM471 / OM936), BEV |
| Freightliner | Cascadia, **eCascadia**, M2 | Diesel (Detroit DD13/DD15), BEV |
| FUSO | Canter, **eCanter** | Diesel, BEV |

Personas and their questions:

| Persona | Primary question | Modules |
|---|---|---|
| Fleet manager | Are my trucks productive, and where is fuel wasted? | Utilization, Fuel & Idle |
| Safety manager | Which drivers and routes are risky, and are they improving? | Driver Behaviour |
| OEM uptime / service engineer | Which trucks will break down, and what must the workshop prepare? | DTC Analysis, Component Health |
| OEM quality engineer | Which DTCs are trending by model, engine family or build period? | DTC Analysis (fleet view) |

Scope (from `Domain.md`): operational waste, utilization, driver safety and vehicle diagnostics.
Part procurement and warranty claims are **not** part of the telematics module (they stay in the
separate Reliability / Financial modules).

---

## 2. OEM data landscape — what the truck actually sends

Every signal in this project must be traceable to one of these sources. If an OEM can't deliver
it, we don't design a chart around it.

### 2.1 rFMS 4.0 (OEM-neutral truck API)
The ACEA **remote Fleet Management System** standard is offered by all major European truck OEMs
(Daimler via FleetBoard / Mercedes-Benz Trucks portals). It is the most defensible source for a
demo because every OEM supports it.

- **Vehicle positions:** GNSS lat/lon, heading, altitude, GNSS speed, wheel-based speed,
  tachograph speed, trigger type (timer, ignition on/off, driver login, etc.).
- **Vehicle statuses** (snapshot fields):
  - high-resolution total vehicle distance;
  - total engine hours;
  - total fuel used;
  - fuel level;
  - catalyst (AdBlue/DEF) level;
  - gross combination vehicle weight;
  - axle weights;
  - driver working state (drive/work/available/rest);
  - driver ID;
  - engine coolant temperature;
  - service distance;
  - tell-tale lamp states;
  - door status.
- **Accumulated data** (histograms since last report). These power the driver-behaviour charts
  without needing high-frequency data:
  - time/distance with wheel speed > 0 vs = 0 (idle);
  - fuel used at standstill (idle fuel);
  - cruise-control active distance/time/fuel;
  - PTO active time/fuel;
  - brake-pedal counters;
  - time in speed classes;
  - time in engine-speed classes;
  - time in acceleration and high-acceleration classes;
  - retarder torque classes;
  - driving without torque (coasting) classes;
  - engine torque classes.
- **EV / alternative-fuel status** (added in rFMS 4.0):
  - battery pack remaining charge;
  - electric motor / propulsion state;
  - charging status.

> ⚠ Field names above are paraphrased. **Verify exact names against the rFMS 4.0 specification**
> before generating data or writing ingestion code.

### 2.2 SAE J1939 via OEM remote diagnostics
rFMS carries **tell-tales, not DTCs**. Fault codes come from the OEM's own remote-diagnostics
services:

- Daimler Truck: **Mercedes-Benz Uptime**, **FleetBoard**, **Detroit Connect / Virtual Technician**.
- J1939 diagnostic messages:
  - **DM1**: active DTCs;
  - **DM2**: previously active DTCs;
  - **DM3 / DM11**: clear.
- A DTC is **SPN + FMI + Occurrence Count + source ECU address**, plus lamp status:
  - MIL: malfunction indicator;
  - RSL: red stop lamp;
  - AWL: amber warning lamp;
  - PL: protect lamp.
- Uptime / Virtual Technician add a **freeze-frame snapshot** (engine speed, load, coolant temp,
  etc.), a severity, and a recommended action.
- Higher-rate engineering signals such as DPF soot load, SCR efficiency, turbo boost and
  brake-lining wear are available to the OEM, but not through rFMS. They come from the OEM
  backend, so we label them "OEM backend".

### 2.3 Derived (computed by us)
Not transmitted directly; derived in the pipeline from the sources above:
- trips (ignition on → off);
- idle periods;
- harsh events (from acceleration/g where the OEM doesn't flag them);
- safety score and eco score;
- utilization;
- CO₂ (fuel × emission factor);
- anomaly scores (z-score, Mahalanobis).

### 2.4 Privacy (GDPR)
Daimler is an EU OEM, and driver-level data is personal data. Rules:
- `dim_driver` stores **pseudonymised** IDs (hash of the tachograph card number) and a display
  alias. Real names never go into the demo DB.
- Driver-level views are aggregate-first (leaderboards show alias + score, not raw GPS trails
  by name).

---

## 3. Feature roadmap

All modules follow the `Domain.md` **dual-view rule**:
- **Fleet View** when `selectedVin` is null;
- **Asset View** when it is set.

Time series use a 7-day rolling average. Rankings use horizontal bar charts. A donut is allowed
only for part-of-whole with < 5 slices (see `UI_Guide.md`).

### 3.1 DTC Analysis (new)
Business question: *Which faults are driving downtime, where are they concentrated, and which trucks
need a workshop slot now?*

| Visualization | View | Source tables |
|---|---|---|
| Pareto of top SPN/FMI by occurrence (horizontal bar + cumulative %) | Fleet | `fact_dtc_event`, `dim_dtc` |
| Heatmap: system (engine, aftertreatment, transmission, brakes, HV battery) × model / engine family | Fleet | `fact_dtc_event`, `dim_dtc`, `dim_v_model` |
| DTC rate per 10,000 km or per 1,000 engine hours, trended weekly (7-day rolling) | Fleet | `fact_dtc_event`, `fact_vehicle_daily` |
| Lamp severity mix (Red Stop / Amber / MIL / Protect) donut | Fleet | `fact_dtc_event` |
| DTC → derate / breakdown conversion: share of DTCs followed by a derate or unplanned stop within N days | Fleet | `fact_dtc_event`, `dim_dtc.can_derate`, `fact_trip` |
| Co-occurrence matrix (which DTCs appear together, e.g. DEF quality + SCR efficiency) | Fleet | `fact_dtc_event` |
| Mean time-to-clear by system | Fleet | `fact_dtc_event.first_seen_ts / cleared_ts` |
| DTC lifecycle Gantt (active → previously active → cleared) | Asset | `fact_dtc_event` |
| Freeze-frame panel for a selected DTC | Asset | `fact_dtc_event.freeze_frame` |
| Master table: active DTCs with action pill ("Immediate Service" / "Plan Workshop" / "Monitor") | Both | `fact_dtc_event`, `dim_dtc` |

Illustrative heavy-truck DTCs to seed `dim_dtc` (verify against Detroit/Mercedes fault catalogs):

| SPN | Meaning | Typical FMIs |
|---|---|---|
| 3719 | DPF soot load | 0, 16 |
| 3251 | DPF differential pressure | 0, 2 |
| 4364 | SCR conversion efficiency | 18 |
| 3364 | DEF quality | 2, 18 |
| 1761 | DEF tank level | 1, 18 |
| 5246 | SCR operator inducement severity | 0, 15, 16 |
| 100 | Engine oil pressure | 1, 17, 18 |
| 110 | Engine coolant temperature | 0, 16 |
| 111 | Coolant level | 1, 17 |
| 168 | Battery / supply voltage | 3, 4, 17 |
| 190 | Engine speed sensor | 2, 8 |

FMI reference:

| FMI | Meaning |
|---|---|
| 0 | Above normal, most severe |
| 1 | Below normal, most severe |
| 2 | Erratic |
| 3 | Voltage high |
| 4 | Voltage low |
| 7 | Mechanical system not responding |
| 16 | Above normal, moderate |
| 18 | Below normal, moderate |
| 31 | Condition exists |

### 3.2 Driver Behaviour & Safety (new / rebuilt)
Business question: *Which drivers need coaching, on what, and is coaching working?*

| Visualization | View | Source |
|---|---|---|
| Safety score distribution (per `Domain.md`: 100 minus event penalties) | Fleet | `fact_harsh_events`, `dim_driver` |
| Driver leaderboard: worst 10 by safety score (horizontal bar) | Fleet | `fact_harsh_events`, `fact_trip` |
| Events per 100 km by event type, 7-day rolling | Both | `fact_harsh_events`, `fact_trip` |
| Speed-band histogram (time in 0–50 / 50–80 / 80–90 / > 90 km/h) | Both | `fact_trip` (from rFMS speed classes) |
| RPM "green band" % (time in economical engine-speed range) | Both | `fact_trip` |
| Cruise %, coasting %, anticipation (brake applications per 100 km) | Both | `fact_trip` |
| ADAS activations: Active Brake Assist warnings/full brakes, lane-departure, close-following | Fleet | `fact_harsh_events` |
| Event map (lat/lon scatter coloured by type) | Asset | `fact_harsh_events` |
| 24 h speed trace with events overlaid | Asset | `fact_vehicle_status`, `fact_harsh_events` |
| Driver working state timeline (drive / work / rest from the tachograph) | Asset | `fact_vehicle_status` |

### 3.3 Fuel, Energy & Idle Waste
Business question: *How much money and CO₂ are we burning, and why?*

| Visualization | View | Source |
|---|---|---|
| Idle waste cost (`Domain.md`: idle h × 1.2 gal/h × $3.50) KPI + trend | Both | `fact_vehicle_daily` |
| Fuel L/100 km vs gross combination weight (scatter, per model) | Fleet | `fact_trip` |
| Worst 10 vehicles by idle % (horizontal bar) | Fleet | `fact_vehicle_daily` |
| AdBlue-to-diesel consumption ratio (flags DEF system faults or tampering) | Fleet | `fact_vehicle_daily` |
| CO₂ tonnes by region / model | Fleet | `fact_trip` |
| PTO fuel vs driving fuel split | Both | `fact_trip` |
| EV: kWh/100 km vs ambient temperature | Fleet | `fact_trip`, `fact_vehicle_status` |
| EV: charging sessions (AC/DC, kWh, SoC in → out), battery SoH trend | Both | `fact_charging_session`, `fact_vehicle_status` |

### 3.4 Utilization & Uptime
Business question: *Are assets earning money?*

| Visualization | View | Source |
|---|---|---|
| Utilization %, moving / idle / off split | Both | `fact_vehicle_daily` |
| Hour-of-day × weekday activity heatmap | Fleet | `fact_vehicle_status` / `fact_trip` |
| Uptime % (not in workshop / not red-lamp) | Both | `fact_vehicle_daily`, `fact_dtc_event` |
| Data completeness per vehicle (packets received / expected) | Fleet | `fact_vehicle_daily` |
| Daily km and engine hours trend | Asset | `fact_vehicle_daily` |

### 3.5 Aftertreatment & Component Health
Business question: *Which components are degrading before they throw a DTC?*

| Visualization | View | Source |
|---|---|---|
| DPF soot load % and regeneration frequency (active vs passive) | Both | `fact_telemetry` |
| SCR NOx conversion efficiency trend | Both | `fact_telemetry` |
| Brake-lining wear % per axle | Asset | `fact_telemetry` |
| Tyre pressure / temperature (TPMS) per wheel position | Asset | `fact_telemetry` |
| 24 V battery voltage at crank (starter battery health) | Both | `fact_telemetry` |
| Signal deviation vs `dim_signal` normal range (z-score, Mahalanobis) | Both | `fact_telemetry`, `dim_signal` |

---

## 4. Redesigned data model

### 4.1 Why `fact_telemetry` had to change
Legacy columns (kept as `fact_telemetry_legacy`):
- telemetry_id, vehicle_id;
- date_id, time_id;
- avg_temp, max_rpm;
- z_score, mahalanobis_score, is_anomalous;
- signal_type, signal_value.

Problems:
- **No real timestamp, GPS, speed, fuel, engine state or driver.** The Telematics module can't
  load, harsh events are guessed from speed deltas, and maps are impossible.
- **Mixed grain.** Summary columns (`avg_temp`, `max_rpm`) sit next to a single EAV
  `signal_type/value` pair, so one row is neither a snapshot nor a reading.
- **No signal metadata.** Units and normal ranges are hardcoded (`FLEET_BASELINE` in
  `useDiagnosticsData.js`).
- **DTCs are an untyped jsonb blob** (`fact_vehicle_health.active_dtcs`), so no Pareto, lifecycle
  or co-occurrence is possible.
- **No rollups.** Every Fleet View KPI pages raw rows to the browser in 1,000-row chunks.

### 4.2 Target model (layered star schema)

```
                     dim_date   dim_driver   dim_vehicle ── dim_v_model
                         │           │            │
  ┌──────────────────────┼───────────┼────────────┼─────────────────────────────┐
  │ RAW / SNAPSHOT       │           │            │                             │
  │   fact_vehicle_status (wide, rFMS-shaped, 1–5 min)                          │
  │   fact_telemetry (long health-signal readings) ── dim_signal                │
  ├─────────────────────────────────────────────────────────────────────────────┤
  │ EVENTS                                                                      │
  │   fact_harsh_events (driving + ADAS)                                        │
  │   fact_dtc_event (J1939 lifecycle) ── dim_dtc                               │
  │   fact_charging_session (BEV)                                               │
  ├─────────────────────────────────────────────────────────────────────────────┤
  │ AGGREGATES                                                                  │
  │   fact_trip (per ignition cycle)                                            │
  │   fact_vehicle_daily (per vehicle-day rollup)                               │
  ├─────────────────────────────────────────────────────────────────────────────┤
  │ ECOSYSTEM (feeds Overview, Reliability, Financial, Supply Chain)            │
  │   fact_vehicle_health (weekly vehicle × part prediction) ── dim_part        │
  │   fact_repair_orders* ── fact_part_replacement ── fact_warranty_claims*     │
  │   fact_part_demand_forecast (part × region × week)                          │
  │   bridge_dtc_part (dim_dtc ↔ dim_part)                                      │
  └─────────────────────────────────────────────────────────────────────────────┘
  * shared table: telematics rows are tagged data_source = 'telematics_sim'
```

Design principles:
1. **One grain per table.** Snapshot, reading, event, trip and day are never mixed.
2. **Wide where the OEM payload is wide, long where it's open-ended.** rFMS status is a fixed,
   well-known record, so `fact_vehicle_status` is wide (easy speed traces and correlations via
   PostgREST). Engineering signals keep growing, so `fact_telemetry` is long and driven by
   `dim_signal`.
3. **Real `timestamptz`** on every fact, plus `date_id` for cheap date filters and joins to
   `dim_date`.
4. **Nullable powertrain-specific columns.** Diesel trucks leave EV columns null and vice versa.
   Avoid separate tables per powertrain.
5. **Charts read aggregates first.** Fleet View reads `fact_vehicle_daily` / `fact_trip`. Asset
   View reads raw snapshots and events for one vehicle.

### 4.3 Tables

#### `dim_signal` — signal catalog
| Column | Type | Notes |
|---|---|---|
| signal_code (PK) | text | e.g. `COOLANT_TEMP`, `DPF_SOOT_LOAD` |
| signal_name | text | display label |
| unit | text | °C, kPa, %, V, km/h, rpm, L/h, kWh |
| category | text | powertrain, aftertreatment, brakes, tyres, electrical, ev, driver |
| j1939_pgn / j1939_spn | int | e.g. SPN 110 for coolant temp |
| rfms_field | text | null when not in rFMS |
| source | text | `rFMS` / `J1939-remote-diag` / `OEM-backend` / `derived` |
| powertrain | text | diesel / bev / all |
| sample_interval_s | int | expected cadence |
| normal_min / normal_max | numeric | replaces hardcoded `FLEET_BASELINE` |
| warn_threshold / crit_threshold | numeric | for colouring (amber / rose per UI_Guide) |
| direction | text | `high` / `low`: which side of the normal band is bad |

#### `fact_vehicle_status` — rFMS-style snapshot
Grain: one row per vehicle per report (every 1–5 min while ignition is on, plus ignition-on/off
triggers).

| Group | Columns |
|---|---|
| Keys | status_id (PK), vehicle_id, driver_id, trip_id, ts (timestamptz), date_id, trigger_type |
| Position | lat, lon, heading_deg, gnss_speed_kmh |
| Motion | wheel_speed_kmh, tacho_speed_kmh, odometer_km, engine_hours |
| Engine | engine_state (idle / running / pto / ready for BEV), engine_rpm, engine_load_pct, accel_pedal_pct, brake_pedal_active, cruise_active, retarder_active, current_gear |
| Fuel / DEF | fuel_level_pct, total_fuel_used_l, fuel_rate_lph, adblue_level_pct |
| Thermal / electrical | coolant_temp_c, oil_pressure_kpa, battery_voltage_v, ambient_temp_c |
| Load | gross_combination_weight_kg |
| Driver | driver_working_state (drive / work / available / rest) |
| EV (nullable) | soc_pct, soh_pct, hv_battery_temp_c, energy_used_kwh_total, regen_kwh_total, charging_state |

#### `fact_telemetry` (redesigned) — long health-signal readings
Successor to the legacy `signal_type / signal_value` rows. It holds engineering signals: coolant,
oil pressure, 24 V, DPF soot and ΔP, SCR efficiency, boost, rail pressure, air pressure, brake
lining, TPMS and HV battery.

| Column | Notes |
|---|---|
| telemetry_id (PK, identity), vehicle_id, ts, date_id | |
| signal_code → dim_signal | |
| value | numeric |
| z_score, mahalanobis_score, is_anomalous | z against the `dim_signal` normal band; Mahalanobis over all signals at that timestamp |

The Diagnostics module ports with minimal change: `signal_type` → `signal_code`, and baselines come
from `dim_signal`.

#### `fact_trip` — one row per ignition cycle
- trip_id, vehicle_id, driver_id, date_id;
- start_ts, end_ts, start_city, end_city;
- start_lat/lon, end_lat/lon, start/end_odometer_km;
- distance_km;
- drive_s, idle_s, pto_s;
- fuel_used_l, idle_fuel_l, pto_fuel_l, adblue_used_l;
- energy_used_kwh, regen_kwh (EV);
- avg_speed_kmh, max_speed_kmh, overspeed_s;
- cruise_distance_pct, coasting_distance_pct, rpm_green_band_pct;
- brake_applications;
- avg_gcw_kg;
- ambient_temp_c, co2_kg;
- harsh_event_count, eco_score;
- speed_class_s (jsonb histogram), rpm_class_s (jsonb histogram).

Maps 1:1 onto rFMS *accumulated data*, so every column is OEM-deliverable.

#### `fact_harsh_events` — driving & ADAS events (name from `Domain.md`)
| Column | Notes |
|---|---|
| event_id (PK), vehicle_id, driver_id, trip_id, ts, date_id | |
| event_type | harsh_brake, harsh_accel, harsh_cornering, overspeed, excessive_idle, over_rev, aba_warning, aba_full_brake, lane_departure, close_following |
| severity | low / medium / high |
| lat, lon | for event maps |
| speed_before_kmh, speed_after_kmh, peak_g, duration_s | |
| source | `OEM-ADAS` / `derived` |
| score_penalty | Domain.md penalty for this event type |

Penalties (`Domain.md`: −5 hard braking, −10 harsh cornering, …) live in `HARSH_EVENT_TYPES`.
Daily safety score = 100 − (Σ penalties per 100 km) × 6, floored at 0. This puts aggressive drivers
around 60–70 and smooth drivers above 90.

#### `dim_dtc` — J1939 fault catalog
- dtc_id (PK), spn, fmi, spn_description, fmi_description;
- system (engine, aftertreatment, transmission, brakes_ebs, abs, hv_battery, body, electrical);
- ecu_source_address, ecu_name (engine = 0x00, transmission = 0x03, brakes = 0x0B, …);
- default_lamp (MIL / RSL / AWL / PL);
- severity_class (critical / major / minor);
- can_derate (bool);
- recommended_action.

#### `fact_dtc_event` — DTC lifecycle
- dtc_event_id (PK), vehicle_id, dtc_id → dim_dtc;
- first_seen_ts, last_seen_ts, cleared_ts;
- status (active / previously_active / cleared);
- occurrence_count, lamp_status;
- odometer_km_at_first, engine_hours_at_first;
- freeze_frame (jsonb);
- trip_id, driver_id, date_id;
- caused_derate, resolved_by_ro_id.

This replaces analytics on the old `active_dtcs` blob. `fact_vehicle_health.active_dtcs` still
exists as a convenience copy (array of `{dtc_id, spn, fmi, lamp, severity}`).

#### `fact_charging_session` — BEV only
- session_id, vehicle_id, driver_id, date_id;
- start_ts, end_ts;
- city, lat, lon;
- charger_type (DEPOT_DC / PUBLIC_DC);
- energy_kwh, max_power_kw, cost_inr;
- soc_start_pct, soc_end_pct.

#### `fact_vehicle_daily` — rollup (vehicle × day)
- vehicle_id, date_id (PK), driver_id;
- is_operating, in_workshop, trips;
- distance_km, engine_hours, drive_hours, idle_hours, pto_hours;
- fuel_l, idle_fuel_l, adblue_l, energy_kwh, co2_kg;
- utilization_pct (engine-on hours / 24 h);
- harsh_event_count, safety_score, eco_score;
- active_dtc_count, amber_lamp_flag, red_lamp_flag, derate_active;
- odometer_km_end;
- packets_expected, packets_received, last_ping_ts.

This feeds nearly every Fleet View KPI and removes the need for client-side paging over raw rows.

#### `dim_driver` (new) and dimension additions
- `dim_driver`: driver_id (pseudonymised), driver_alias, driver_card_hash, license_class
  (HGMV / HTV), customer_id, home_location_id, hire_date, experience_years.
- `dim_v_model` gains nullable columns:
  - powertrain (diesel / bev);
  - engine_family (OM904 LA, OM926 LA, OM471, eAxle);
  - transmission, axle_config;
  - fuel_tank_l, battery_kwh, gcw_max_kg;
  - base_consumption, consumption_unit;
  - adas_equipped.
- `dim_vehicle` gains nullable columns:
  - is_connected;
  - telematics_unit_id, telematics_source (Truckonnect for BharatBenz, Fleetboard for Mercedes);
  - connected_since, model_year;
  - warranty_end_date, warranty_km_limit;
  - home_lat, home_lon;
  - primary_driver_id.
- `bridge_dtc_part`: dtc_id ↔ part_id with a likelihood. It links diagnostics to reliability,
  warranty and supply chain.

### 4.4 Ecosystem tables (feed the other modules)
| Table | Grain | Feeds |
|---|---|---|
| `fact_vehicle_health` (redesigned) | vehicle × monitored part × week, plus `alert` rows on the day the model flags a fault | Overview (risk distribution, action tracker), Diagnostics, Supply Chain |
| `fact_repair_orders` (shared, + visit_type, dtc_event_id, open/close_ts, downtime_hours, odometer_km, parts_cost, data_source) | workshop visit: planned / predicted / repair / breakdown | Uptime, Financial (cost of breakdowns vs predicted repairs) |
| `fact_part_replacement` (new) | part swapped in a repair order, back to in-service date | Reliability (Weibull / B10 by km, supplier variance), Financial |
| `fact_warranty_claims` (shared, + dtc_event_id, ro_id, was_predicted, data_source) | claim for an in-warranty replacement (36 months / 300k km; HV battery 8 years / 800k km) | Financial / Warranty |
| `fact_part_demand_forecast` (new) | part × region × week (13 past weeks with actuals, 12 future) | Supply Chain, compared against `fact_part_inventory` |
| `v_vehicle_context` (view) | one row per vehicle with model, region, customer, application and driver names | every hook's region / model / VIN filters |

Money is in INR. Parts are costed from `dim_part.unit_cost`; labour costs ₹1,050–1,800 per hour
depending on dealer tier.

### 4.5 Shared-table rules & implementation
- **Telematics-owned tables:** `fact_telemetry` and `fact_vehicle_health` were redesigned. The
  outdated versions were renamed to `*_legacy` and kept.
- **Shared tables only gain nullable columns.** Existing columns and rows are never changed. Rows
  the seed inserts into shared facts carry `data_source = 'telematics_sim'`.
- **Where it lives:** `scripts/telematics-db/`
  - `npm run db:migrate` / `db:seed` / `db:setup` / `db:reset`;
  - see its README.
- **Seed safety:** the seed runs in one transaction. It commits only when:
  - the consistency checks pass;
  - an md5 fingerprint of the shared tables' original data is unchanged.

---

## 5. Signal → OEM source mapping

| Signal | Unit | rFMS | J1939 SPN | Source | Powertrain | Raw / derived |
|---|---|---|---|---|---|---|
| GNSS position | lat/lon | ✔ positions | — | rFMS | all | raw |
| Wheel-based speed | km/h | ✔ | 84 | rFMS | all | raw |
| Tachograph speed | km/h | ✔ | 1624 | rFMS | all | raw |
| Total vehicle distance | km | ✔ | 917 | rFMS | all | raw |
| Engine total hours | h | ✔ | 247 | rFMS | diesel | raw |
| Engine speed | rpm | classes | 190 | rFMS / remote diag | diesel | raw |
| Engine load | % | torque classes | 92 | remote diag | diesel | raw |
| Accelerator pedal | % | — | 91 | remote diag | all | raw |
| Brake switch | bool | counters | 597 | rFMS / remote diag | all | raw |
| Cruise active | bool | ✔ accumulated | 595 | rFMS | all | raw |
| Current gear | — | — | 523 | remote diag | all | raw |
| Fuel level | % | ✔ | 96 | rFMS | diesel | raw |
| Total fuel used | L | ✔ | 250 | rFMS | diesel | raw |
| Fuel rate | L/h | — | 183 | remote diag | diesel | raw |
| AdBlue / DEF level | % | ✔ | 1761 | rFMS | diesel | raw |
| Coolant temperature | °C | ✔ | 110 | rFMS | diesel | raw |
| Oil pressure | kPa | — | 100 | remote diag | diesel | raw |
| Battery voltage | V | — | 168 | remote diag | all | raw |
| Ambient temperature | °C | — | 171 | remote diag | all | raw |
| Gross combination weight | kg | ✔ | 1760 | rFMS | all | raw |
| Driver working state | enum | ✔ | 1612 | rFMS | all | raw |
| Driver ID | text | ✔ | — | rFMS (tacho card) | all | raw → pseudonymised |
| DPF soot load | % | — | 3719 | OEM backend | diesel | raw |
| SCR efficiency | % | — | (derived from NOx SPNs) | OEM backend | diesel | derived |
| Tyre pressure | kPa | — | 241 | OEM backend (TPMS) | all | raw |
| Brake-lining wear | % | — | OEM-specific | OEM backend | all | raw |
| HV battery SoC | % | ✔ (rFMS 4) | — | rFMS / OEM backend | bev | raw |
| HV battery SoH | % | — | — | OEM backend | bev | raw |
| DTC (SPN/FMI/OC/lamp) | — | tell-tales only | DM1/DM2 | remote diag | all | raw |
| Idle time / idle fuel | s / L | ✔ accumulated | — | rFMS | diesel | raw |
| Harsh events | — | accel classes | — | OEM ADAS / derived | all | derived |
| Trips | — | — | — | derived | all | derived |
| Safety / eco score | 0–100 | — | — | derived | all | derived |
| CO₂ | kg | — | — | derived (fuel × 2.64 kg/L diesel) | diesel | derived |

SPN numbers are the standard J1939 assignments. Verify them against the J1939-71 digital annex
before seeding data.

---

## 6. Migration & performance notes

- **Status:** the schema is migrated and seeded (200 trucks, 2026-07-03 → 2026-09-30, ~540k
  rows). The legacy data is in `fact_telemetry_legacy` / `fact_vehicle_health_legacy`.
- **The current React hooks still query the legacy column names.** Overview, Diagnostics,
  Reliability and Telematics break until they are ported.
- **Porting order:**
  1. Telematics → `fact_vehicle_status`, `fact_trip`, `fact_harsh_events`, `fact_vehicle_daily`,
     `fact_charging_session`.
  2. Diagnostics / new DTC Analysis → `fact_telemetry` + `dim_signal` + `fact_dtc_event` +
     `dim_dtc`.
  3. Overview → `fact_vehicle_health` + `fact_vehicle_daily` (trust score from `packets_*`).
  4. Reliability → `fact_part_replacement` + `dim_part` + `dim_supplier`.
  5. Financial / Warranty → `fact_repair_orders` + `fact_warranty_claims` (tagged rows) +
     `fact_part_replacement`.
  6. Supply Chain → `fact_part_demand_forecast` vs `fact_part_inventory`.
- **Indexes:** `(vehicle_id, ts)` on every raw/event fact, `(date_id)` on all facts, and
  `(dtc_id, status)` on `fact_dtc_event`.
- **Aggregation server-side:** expose Postgres views or RPC functions (e.g.
  `rpc_fleet_kpis(date_from, region, model)`) instead of paging raw rows into React.
- **Demo data volume:** 5-min snapshots cover only the last 7 days (~130k rows). Fleet View
  must read `fact_vehicle_daily` / `fact_trip`. Only Asset View touches snapshots (one vehicle,
  ≤ 24 h ≈ 300 rows).
- **Synthetic data must be correlated, not random:**
  - fuel rate follows load and GCW;
  - DPF soot rises until a regen event;
  - DTCs precede derates or breakdowns;
  - harsh events cluster on specific drivers and routes.

  Correlation is what makes the charts tell a story.
- **Fix known bugs from `CLAUDE.md` during the port:**
  - region/model filters compare display strings to IDs; load options from `dim_region` /
    `dim_v_model`;
  - Asset View passes `vin` but queries `vehicle_id`;
  - inconsistent model-filter columns across hooks;
  - duplicated `fetchAllRows` / `resolveStartDate` helpers belong in a shared `src/lib` util.
- **Security:** done for the new tables: RLS plus a public SELECT policy, with `anon` limited to
  SELECT. Shared tables keep their existing grants.

---

## 7. Open questions

1. **Map rendering:** Recharts has no map. Options:
   - add `react-leaflet` with OpenStreetMap tiles, for real event maps and trip traces;
   - keep a lat/lon scatter as a fallback.
2. **Refresh cadence:** a batch nightly rollup is enough for the demo. Is a near-real-time "live
   fleet" tile needed (Supabase Realtime on `fact_vehicle_status`)?
3. **Mixed fleets:** do we later need non-Daimler trucks via rFMS (the standard makes this cheap)
   or light vehicles (OBD-II / UDS P-codes, which would extend `dim_dtc` with a code-system
   column)?
4. **Prediction layer:** should `fact_vehicle_health` failure probability / RUL be re-derived from
   the new DTC + signal tables, so the ML story is traceable end-to-end?
