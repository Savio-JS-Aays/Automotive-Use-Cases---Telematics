# 06 · Data Generation (simulator)

> How the telematics dataset is produced by `scripts/telematics-db`: the assumptions, constants,
> causal logic, and the checks that guard it. Change any of these → update this file.
>
> Last updated: 2026-10-01

## Running it
```bash
npm run db:migrate                                  # schema (idempotent)
npm run db:seed -- --end 2026-09-30                 # regenerate data (one transaction)
npm run db:seed -- --dry-run                        # generate + print counts only
npm run db:reset -- --confirm [--restore-legacy]    # remove everything the scripts added
```

| Flag | Default | Meaning |
|---|---|---|
| `--vehicles` | 200 | connected trucks, stratified equally across the 5 models |
| `--days` | 90 | window length |
| `--end` | today (IST), capped at the `dim_date` max | last day of the window |
| `--snapshot-days` | 7 | days that get 5-min `fact_vehicle_status` rows |
| `--readings-per-day` | 2 | health-signal readings per driving day |
| `--seed` | 42 | PRNG seed. The run is deterministic: the same seed and inputs give the same data |

**Rollup refresh (added 2026-10-01).**
- Both `migrate` and `seed` finish with `REFRESH MATERIALIZED VIEW mv_telemetry_daily` plus
  `ANALYZE`. The seed runs it after its transaction commits.
- `reset` drops `v_failure_precursor_summary`, `v_failure_precursor`, `v_vehicle_context` and then
  `mv_telemetry_daily` before dropping the tables, because they depend on `fact_telemetry` and
  `fact_part_replacement`.
- On the current seed the rollup has 145,156 rows, one per distinct vehicle × signal × day of
  `fact_telemetry`.

Code map:

| File | Contents |
|---|---|
| `setup-telematics-db.mjs` | CLI, migrate/seed/reset, checks |
| `reference/catalog.mjs` | every constant below |
| `generators/fleet.mjs` | fleet sample, drivers |
| `generators/simulate.mjs` | daily state machine |
| `generators/service.mjs` | workshop, parts, claims, history |
| `generators/forecast.mjs` | demand forecast |

## 1. Fleet sample
- **Selection:** from existing `dim_vehicle` rows with `current_status = 'Delivered'` and an
  `in_service_date` before the window. Stratified: `vehicles / 5` per model; a per-model seeded
  shuffle picks them.
- **Home base:** the city parsed from `dim_location.location_name`, jittered 2–9 km (the depot).
- **Annual km:** `application annual_km × U(0.8, 1.2)`, × 0.85 for BEVs.
- **Odometer at window start:** `age_days / 365 × annual_km × U(0.9, 1.1)`.
- **Engine hours:** `km / (avg_speed × (1 − idle_share − pto_share))`.
- **Telematics source:** Truckonnect for BharatBenz, Fleetboard for Mercedes.
- **Telematics unit ID:** `TCU-` + a hash of the vehicle ID.

### Duty-cycle profiles (`APPLICATION_PROFILES`, keyed by `dim_vehicle.application_id`)
| App | Label | km/yr | Trips/day | Trip km | Avg moving speed km/h | Idle | PTO | Load | Severity | Brakes /100 km | Cruise |
|---|---|---|---|---|---|---|---|---|---|---|---|
| APP001 | FMCG distribution | 70k | 2–3 | 40–140 | 32 | 16 % | 0 | 0.60 | 1.10 | 85 | 12 % |
| APP002 | Refrigerated | 90k | 1–2 | 150–380 | 42 | 15 % | 0 | 0.70 | 1.00 | 40 | 30 % |
| APP003 | Tanker | 80k | 1–2 | 100–300 | 40 | 12 % | 4 % | 0.80 | 1.00 | 45 | 28 % |
| APP004 | Mining & construction | 45k | 3–5 | 15–45 | 22 | 30 % | 10 % | 0.92 | 1.60 | 140 | 2 % |
| APP005 | Ready-mix concrete | 35k | 3–5 | 10–30 | 24 | 25 % | 25 % | 0.85 | 1.35 | 120 | 2 % |
| APP006 | Automotive & industrial freight | 100k | 1–2 | 200–450 | 45 | 11 % | 0 | 0.75 | 0.95 | 35 | 38 % |
| APP007 | Heavy haul & ODC | 50k | 1 | 80–250 | 30 | 18 % | 2 % | 0.95 | 1.25 | 50 | 10 % |
| APP008 | Long-haul freight | 120k | 1–2 | 250–550 | 48 | 10 % | 0 | 0.72 | 0.90 | 25 | 45 % |

The probability that a truck operates on a given day is 0.75–0.92 by application, × 0.55 on
Sundays.

### Model specs (written into `dim_v_model` columns)
| Variant | Base consumption | Idle L/h | Tank / battery | GCW max | Empty | Top gear | ADAS |
|---|---|---|---|---|---|---|---|
| 1617R | 17.5 L/100 km | 1.8 | 215 L | 16.2 t | 5.8 t | 6 | no |
| 3528C | 30 L/100 km | 2.6 | 380 L | 35 t | 12.5 t | 9 | no |
| 5528TT | 34 L/100 km | 2.8 | 415 L | 55 t | 15.5 t | 9 | no |
| Actros L | 28 L/100 km | 2.4 | 600 L | 44 t | 15 t | 12 | yes |
| eActros 600 | 110 kWh/100 km | — | 621 kWh | 44 t | 17 t | 4 | yes |

## 2. Drivers
- **Primary drivers:** one per truck.
- **Relief drivers:** a pool of ~20 % of the trucks in each region. A relief driver drives 15 % of
  a truck's operating days.
- **Latent profile:** assigned per driver, **never written to the DB**, so the analytics have to
  discover it.

| Profile | Share | Aggression *a* | Idle factor | Overspeed share of drive time |
|---|---|---|---|---|
| smooth | 25 % | 0.6 | 0.8 | 0.4 % |
| average | 55 % | 1.0 | 1.0 | 2 % |
| aggressive | 20 % | 1.7 | 1.3 | 6 % |

## 3. Daily state machine (per truck, per day)
1. **Workshop jobs due today open** (predicted / planned / repair). They open at 08:30–10:30, or
   after the truck returns from a trip that crossed midnight. The truck is off the road until the
   RO closes.
2. **Does the truck operate today?** `operate_p × weekday factor`, and never while it is in the
   workshop.
3. **Driver:** the relief driver on 15 % of days.
4. **Trips:** 1–5 per day, by application.
   - **Short-haul** (trip km ≤ 150): radial trips from home towards a city in the same region; the
     last trip returns home.
   - **Long-haul:** point to point between cities at the target road distance
     (road = great-circle × 1.3). The truck heads home once it is more than 350 km from base.
   - The first trip starts at 05:00–09:30. Gaps between trips are 0.4–1.5 h. No trip starts
     after 22:00. Trips never overlap, including across midnight.
5. **Per-trip physics.** The formulas are in [02 §6](02_Domain_Theory.md#6-fuel-energy-and-emissions).
   - **Time split:** `drive_s = km / speed`; idle is added by application share and driver idle
     factor; 8 % of trips get a 30–70 min idle wait.
   - **Load:** outbound trips are loaded, returns are empty (short-haul); 85 % of long-haul trips
     are loaded.
     `GCW = empty + (max − empty) × payload share`.
   - **Fuel:** from load, aggression, severity and derate.
   - **AdBlue:** 5.5 % of diesel, × the dosing factor during a DEF fault.
   - **BEV energy:** grows with temperature.
     - Public DC charge (250–350 kW, ₹18/kWh) if SoC would drop below 12 %.
     - Overnight depot charge (100–160 kW, ₹9/kWh) if SoC < 70 %.
   - **Diesel refuels:** at < 25 % tank (to 90–98 %). AdBlue refills at < 20 %.
   - **Speed:** governor 80 km/h. Overspeed time comes from the driver profile. Derate caps speed
     at ≈ 55–60 km/h and cuts distance by 40 %.
   - **Driving style:** cruise %, coasting %, green band %, brakes per 100 km, and the speed/RPM
     class histograms.
6. **Harsh / ADAS events:** Poisson-distributed, with rate per 100 km × *a*^1.6 × severity.
   Locations are interpolated along the route.

   | Event | Base rate per 100 km |
   |---|---|
   | harsh_brake | 0.12 |
   | harsh_accel | 0.08 |
   | harsh_cornering | 0.05 |
   | overspeed | 0.06 |
   | over_rev | 0.03 |
   | aba_warning | 0.03 |
   | aba_full_brake | 0.004 |
   | lane_departure | 0.06 |
   | close_following | 0.08 |

   **Excessive idle:** 35 % chance per trip that has > 30 min of idle.
7. **Snapshots:** in the last `--snapshot-days`, one row every 5 min along each trip. The state
   per slot (moving / idle / pto) follows the trip's time split. Position, fuel, SoC and counters
   are interpolated.
8. **DTCs:**
   - Scenario codes fire on schedule.
   - Intermittent codes appear on 1.2 % of operating days (weighted towards wheel-speed and CAN
     codes) and become `previously_active`.
   - Brake-lining wear raises SPN1099-FMI18 at < 20 % lining remaining.
9. **Wear:**
   - **DPF soot** accumulates per km: 0.16 %/km for severe duty, 0.12 short-haul, 0.07 long-haul.
     It regenerates to 5–15 % once above 75 %.
   - **Brake lining** falls linearly between replacements.
   - **Background failures** fire when the odometer passes a part's Weibull life. That opens a
     same-day breakdown (35 %) or a repair 1–3 days later.
   - **Planned services** every 50,000 km (diesel) or 80,000 km (BEV).
10. **Health signals:** `--readings-per-day` readings during driving:
    - each is baseline + noise + fault drift;
    - z-score and Mahalanobis per [02 §2](02_Domain_Theory.md#2-anomaly-detection-on-signals).
11. **Predictions:**
    - weekly rows (Sunday 23:30) for every monitored part;
    - an `alert` row on a fault's detection day.
12. **Daily rollup** into `fact_vehicle_daily`:
    - the sums of the day's trips;
    - safety score (×6 scale);
    - distance-weighted eco score;
    - open DTC counts and lamp flags;
    - packets: expected = `ceil(engine_min / 5) + 24`; received = expected × vehicle completeness
      (0.92 in East and on mining sites, 0.985 elsewhere, ± noise);
    - 0.4 % "dark" days, when nothing is received.

## 4. Fault scenarios (`SCENARIOS`)
- **Who gets one:** 25 % of trucks get one fault; 15 % of those get a second.
- **Timing:** the onset day is uniform in `[−L/2, days − 4]`, and the progression length is
  `L ∈ [12, 40]` days.
- **Stage:** `s = (day − onset) / L`.

| Key | Powertrain | Weight | Part | Drifting signal → target | Code escalation (stage) |
|---|---|---|---|---|---|
| def_scr | diesel | 3 | PART009 DEF injector | SCR_EFFICIENCY → 66 %; AdBlue dosing → 35 % | 3361-7 (0.3) → 4364-18 (0.55) → 5246-15 PL derate (0.9) |
| coolant_leak | diesel | 2 | PART050 radiator | COOLANT_TEMP → 107 °C | 111-18 (0.3) → 110-16 (0.6) → 110-0 RSL derate (0.92) |
| dpf_clog | diesel | 2.5 (×3 mining/RMC, ×1.5 FMCG) | PART010 DPF | DPF_SOOT_LOAD → 118 %, ΔP → 24 kPa; regens start failing | 3719-16 (0.35) → 3251-0 (0.65) → 3719-0 RSL derate (0.92) |
| alternator | all | 1.5 | PART037 alternator | BATTERY_VOLTAGE → 24.1 V | 168-18 (0.4) → 168-1 RSL (0.9) |
| injector | diesel | 1.5 | PART006 injector | FUEL_RAIL_PRESSURE → 108 MPa, erratic | 651-7 (0.4) → 651-5 MIL derate (0.85) |
| turbo | diesel | 1.2 | PART005 turbo | BOOST_PRESSURE → 98 kPa | 102-18 (0.45) → 641-7 RSL derate (0.9) |
| air_compressor | all | 1.2 | PART031 compressor | AIR_PRESSURE → 520 kPa | 117-18 (0.45) → 117-1 RSL (0.9) |
| hv_thermal | bev | 4 | PART044 HV battery (module repair, 18 % of pack cost, 8 h) | HV_BATTERY_TEMP → 56 °C, HV_SOH → 86 % | 520211-18 (0.3) → 520210-16 (0.55) → 520210-0 RSL derate (0.9) |

**Drift:** `value = base + (target − base) × s^1.6`.

**Outcome:**
- **Detection:** the model catches the fault with probability 0.72 (Fleetboard) or 0.5
  (Truckonnect), on a day at stage 0.5–0.7.
- **Predicted:** the repair is booked 1–4 days after detection. If that's before the failure
  day, the outcome is a **predicted** repair.
- **Breakdown:** otherwise, at stage 1, the truck runs one trip, then is towed in.
- **Unresolved:** faults whose repair or failure day falls after the window end stay open
  (active DTCs, high risk at the window end). These are the "at risk now" trucks for Overview.

## 5. Workshop, parts and warranty (`service.mjs`)
### Part lifetimes
```
β by part type:   Mechanical 2.4   Consumable 1.8   Electrical 1.2
η = B10_km / (−ln 0.9)^(1/β)
    × supplier factor (High 0.72, Medium 0.9, Low 1.08)
    / application severity
    / √aggression   (brake lining and clutch only)
B10_km = dim_part.b10_design_life_miles × 1.609344
```

- **Supplier per part:** the catalogue supplier (`dim_part.supplier_id`, SUP004 = High risk) 55 %
  of the time, alternate 1 30 %, alternate 2 15 %. The alternates are chosen deterministically by
  part number.
- **Applicability:** HV battery → BEV only. BEVs have no engine, aftertreatment, clutch, flywheel
  or fuel-tank parts. AMT gearbox → Actros. Fifth wheel → tractors. Radar, MirrorCam and air
  suspension → Mercedes. Leaf springs → BharatBenz. PTO → tanker, mining, RMC.
- **History before the window:** a renewal process from 0 km to the odometer at window start, with
  dates interpolated linearly along the vehicle's service life, plus planned services every
  interval.

### Repair order
- **Dealer:** the truck's preferred dealer in its region 80 % of the time, otherwise a random one
  from that region.
- **Labour hours:**
  `Σ standard_labor_hours × U(0.9, 1.25)`, plus diagnosis time:

  | Visit type | Diagnosis hours |
  |---|---|
  | predicted | 0.5 |
  | repair | 1 |
  | breakdown | 1.5 |

  A planned service is 2–3.5 h, plus ₹18k (diesel) or ₹9k (BEV) of consumables.
- **Downtime:** `billed hours + wait`.

  | Visit type | Wait (h) |
  |---|---|
  | planned | 1–4 |
  | predicted | 2–8 |
  | repair | 6–36 |
  | breakdown | 10–30 tow/diagnosis + 0–60 parts wait |

  An RO still open at the window end has `close_ts = NULL`.
- **Cost:** `labor_cost = billed_hours × tier rate` (₹1,050–1,800 per hour); `parts_cost =
  Σ unit_cost × cost factor`.
- **3C text:** a complaint / cause / correction narrative built from the scenario or subsystem,
  quoting the DTCs.

### Warranty claim
Filed when the part is in warranty, warrantable and the RO is closed, and the submission date
(close + 0–5 days) is within the window. The rules are in [02 §7](02_Domain_Theory.md#7-warranty-economics).

| Field | Rule |
|---|---|
| NFF | 2 % with DTC evidence, 15 % for electrical parts without it, 5 % otherwise |
| status | by age since submission: < 10 d Submitted; < 30 d In Review 70 % / Paid 30 %; older: Paid 82 %, Rejected 10 % (NFF → Rejected 60 %), In Review 8 % |
| liability | Supplier with probability 0.65 / 0.45 / 0.30 by supplier risk tier High / Medium / Low; otherwise OEM |
| recovered_amount | Supplier-liable and Paid: `claim × U(0.5, 0.9)` |
| ai_risk_score | NFF 65–92, DTC-backed 8–35, otherwise 30–60 |
| mileage_at_failure | km ÷ 1.609 (miles, to match the shared column) |
| cluster_id | scenario cluster (CLS-AFT, CLS-COOL, CLS-ELEC, CLS-FUEL, CLS-AIR, CLS-BRK, CLS-HV), or subsystem cluster (CLS-PWT, CLS-CHS, CLS-ELEC, CLS-BODY) |

## 6. Demand forecast (`forecast.mjs`)
The formula is in [02 §9](02_Domain_Theory.md#9-parts-demand).
- The historical rate uses non-planned replacements over the connected sample's total
  vehicle-weeks.
- Past weeks get ±10 % noise on the prediction, plus actual replacement counts.

## 7. Guards
**Consistency checks.** The seed commits only if all of these return 0 violations:
1. Every replacement has its repair order.
2. Every `claim_id` on a replacement exists.
3. The odometer never decreases between consecutive trips.
4. Trips never overlap per truck.
5. Σ trip km = Σ daily km per truck (tolerance 1 km + 0.1 %).
6. Every DTC linked from a repair order was first seen before the RO opened.
7. Every tagged claim's replacement is `in_warranty`.
8. Every cleared DTC links to an existing repair order.

**Shared-data fingerprint:** before and after the run, the seed computes
`md5(string_agg(md5(row(original columns)), order by PK))` plus a row count for `dim_v_model`,
`dim_vehicle`, and the untagged rows of `fact_repair_orders` and `fact_warranty_claims`. Any
difference rolls the whole run back.

## 8. Current dataset (seed 42, 2026-07-03 → 2026-09-30, 200 trucks)
| Table | Rows |
|---|---|
| fact_trip | 30,480 |
| fact_vehicle_status | 133,348 |
| fact_harsh_events | 29,628 |
| fact_dtc_event | 337 |
| fact_charging_session | 4,004 |
| fact_telemetry | 289,934 |
| fact_vehicle_health | 20,192 |
| fact_vehicle_daily | 18,000 |
| fact_part_replacement | 1,252 |
| fact_part_demand_forecast | 6,500 |
| fact_repair_orders (tagged) | 2,244 |
| fact_warranty_claims (tagged) | 491 |
| dim_driver | 240 |
| mv_telemetry_daily (rollup) | 145,156 |

The database grew from 66 MB to about 180 MB.

**Calibration results:**

| Metric | Result |
|---|---|
| Fuel consumption | Actros L ≈ 31 L/100 km, 3528C tipper ≈ 44, 5528TT ≈ 38, 1617R ≈ 19 |
| eActros energy use | ≈ 106 kWh/100 km |
| Harsh events | ≈ 5–12 per 1,000 km (mining highest) |
| Driver safety averages | ≈ 62 → 95 |
| Predicted repair | ≈ ₹42k, 10 h downtime |
| Breakdown | ≈ ₹55k, 55 h downtime |
