# 02 · Domain Theory

> The OEM telematics, diagnostics, reliability and cost concepts behind every metric. Formulas
> here are the *definitions*. How each chart applies them is in [metrics/](metrics/).
>
> Last updated: 2026-10-01

## 1. Where truck data comes from
| Source | What it delivers | Used for |
|---|---|---|
| **rFMS 4.0** (ACEA remote Fleet Management System) | Positions (GNSS, heading, speed); vehicle status snapshots (odometer, engine hours, total fuel, fuel and AdBlue level, GCW, driver ID and working state, tell-tales, coolant temp, BEV state of charge); **accumulated data** (time and distance in speed, RPM, acceleration and brake classes, cruise, PTO, idle fuel) | Trips, utilization, fuel, driver behaviour |
| **SAE J1939** (vehicle CAN standard), via OEM remote diagnostics (Truckonnect / Fleetboard / Uptime) | Parameter values by **SPN**; fault codes via **DM1** (active) and **DM2** (previously active) | Engineering signals, DTCs |
| **OEM backend** | High-rate engineering signals not in rFMS: DPF soot, SCR efficiency, brake-lining wear, TPMS, HV battery SoH / cell temperature | Component health |
| **Derived** (by us) | Trips, harsh events, scores, CO₂, anomaly scores, predictions | Most KPIs |

**Key nuance:** rFMS carries **tell-tale lamps, not DTCs**. Fault codes come from the OEM's
diagnostic channel.

### J1939 fault codes
A DTC is **SPN + FMI + OC**, plus the source ECU and lamp status:
- **SPN** (Suspect Parameter Number): *what* is faulty, e.g. 110 = engine coolant temperature,
  3719 = DPF soot load. SPNs ≥ 520192 are the OEM-proprietary range.
- **FMI** (Failure Mode Identifier): *how* it is faulty.

  | FMI | Meaning |
  |---|---|
  | 0 | Above normal, most severe |
  | 1 | Below normal, most severe |
  | 2 | Erratic |
  | 3 | Voltage high |
  | 4 | Voltage low |
  | 5 | Open circuit |
  | 7 | Mechanical not responding |
  | 15 | Above normal, least severe |
  | 16 | Above normal, moderate |
  | 18 | Below normal, moderate |
- **OC** (Occurrence Count): how many times the fault became active.
- **Lamps:**

  | Lamp | Meaning |
  |---|---|
  | **MIL** | Emissions malfunction |
  | **AWL** | Amber warning: service soon |
  | **RSL** | Red stop: stop safely |
  | **PL** | Protect: derate / inducement |
- **Source address** (the ECU that raised it):

  | Address | ECU |
  |---|---|
  | 0x00 | Engine |
  | 0x03 | Transmission |
  | 0x0B | Brakes (EBS/ABS) |
  | 0x17 | Instrument cluster |
  | 0x3D | Aftertreatment |
  | 0xF3 | HV battery (used in this dataset) |

**DTC lifecycle** (`fact_dtc_event.status`):
1. **Active** (DM1): the fault is present now.
2. Then one of:
   - **Previously active** (DM2): healed by itself but still stored (intermittent / nuisance codes).
   - **Cleared**: cleared by a workshop when the root cause was repaired
     (`resolved_by_ro_id` is set).

**Derate / inducement:** the ECU limits torque or speed to protect the engine, or to force repair
of emissions faults (SCR inducement, SPN 5246). Derating codes have `dim_dtc.can_derate = true`.
A derated truck is slower and covers fewer km.

## 2. Anomaly detection on signals
Each engineering signal has a normal band in `dim_signal` (`normal_min`, `normal_max`), plus a
`direction` (which side of the band is bad) and warn/critical thresholds.

**z-score against the normal band:**

```
μ = (normal_min + normal_max) / 2        σ = (normal_max − normal_min) / 4
z = (value − μ) / σ                      (so the band edges ≈ ±2σ)
```

**Multivariate distance (Mahalanobis, diagonal covariance)**, for the *k* health signals read
from one truck at the same timestamp:

```
D = 1.1 × sqrt( Σ zᵢ² / k )
```

Normal operation gives D ≈ 1. A single strongly drifting signal pushes D above 3.

**Anomaly flag:**

```
is_anomalous = |z| > 3  OR  (D > 3 AND |z| > 2)
```

Vehicle Diagnostics reads `is_anomalous` directly. It also classifies each value into a **band
state** from `dim_signal`, taking `direction` into account:
- **critical:** beyond `crit_threshold`;
- **warning:** beyond `warn_threshold`;
- **outside:** outside `normal_min`–`normal_max`;
- otherwise **normal**.

**Anomaly → DTC lead time:** the days between the first anomalous reading of a fault's drifting
signal (named in its freeze frame) and the DTC itself. This measures the head start that signal
monitoring gives the workshop.

## 3. Predictive maintenance
**Failure probability** (`fact_vehicle_health.failure_probability`) is the probability that a
monitored part fails **within the next 30 days**.
- **Normal wear:** it comes from the part's Weibull life model (§4) as a *conditional* probability.
- **Developing fault:** it rises with the fault's progression stage `s ∈ [0,1]`:
  `p = max(p_weibull, 0.06 + 0.9·s^1.4)`.

**Risk bands**, used everywhere:

| Band | Rule | UI colour / action |
|---|---|---|
| Critical | p > 0.70 | rose: "Immediate Service" |
| High | 0.40 ≤ p ≤ 0.70 | amber: "Plan workshop visit" |
| Medium | 0.20 ≤ p < 0.40 | "Monitor" |
| Low | p < 0.20 | no action |

**RUL (remaining useful life):**
- Normal wear: the median residual life (§4).
- Developing fault: `RUL_km = (1 − s) × L × avg_daily_km`, where *L* is the fault's progression
  length in days.
- `rul_days = rul_km / avg_daily_km`.

**Predicted vs reactive maintenance:** a fault caught early becomes a **predicted** workshop visit
(short downtime, no collateral damage). A missed fault becomes a **breakdown** (towing, long
downtime, higher cost). The difference is the core value of the predictive model: *preventable
savings*.

## 4. Reliability theory
Part lifetimes follow a **Weibull** distribution in km, with shape β and scale η:

```
Reliability (survival)   S(x) = exp(−(x/η)^β)
Failure CDF              F(x) = 1 − S(x)
B10 life                 x such that F(x) = 0.10   →  B10 = η · (−ln 0.9)^(1/β)
```

- **β < 1:** infant mortality.
- **β ≈ 1:** random failures (electrical, β = 1.2 in this dataset).
- **β > 1:** wear-out (mechanical 2.4, consumables 1.8).
- **B10** is the distance by which 10 % of a component population has failed. `dim_part` stores
  the **design** B10 (in miles). Comparing it with the **field** B10 shows whether a part (or a
  supplier's batch) fails early.

**Conditional failure probability** of a part that has already survived *k* km, over the next *h*
km (the 30-day horizon, `h = 30 × avg_daily_km`):

```
P(fail in (k, k+h] | survived k) = 1 − S(k+h) / S(k)
```

**Median residual life** (the km until conditional survival drops to 50 %):

```
x* = η · ( (k/η)^β + ln 2 )^(1/β)        RUL = x* − k
```

**Renewal (part) life.**
- A replaced part starts a new life, so a part's life is the km since it was fitted: the odometer
  at failure minus the odometer at the previous replacement of the same part on that truck, or 0
  for the factory part.
- Using the raw odometer instead would overstate the life of second and later parts.

**Censoring (suspensions).**
- Most parts have not failed yet. Each running part is a *suspension*: we know only that it has
  survived its current life (current odometer − last replacement odometer).
- Dropping suspensions, as the legacy "empirical survival" did, biases every estimate towards
  early failures.

**Kaplan–Meier estimator** (handles suspensions):

```
S(t) = Π over failure times tᵢ ≤ t of (1 − dᵢ / nᵢ)      dᵢ = failures at tᵢ, nᵢ = parts still at risk
Greenwood: Var S(t) = S(t)² · Σ dᵢ / (nᵢ (nᵢ − dᵢ))      90 % band = S ± 1.645·√Var
```

The **field B10** is the first km where S(t) ≤ 0.90. If fewer than 10 % have failed, B10 is
extrapolated from the Weibull fit.

**Weibull probability plot and fit.**
- Plot y = `ln(−ln(1 − F))` against x = `ln(km)`. A Weibull population falls on a straight line
  with slope β.
- With suspensions, F at each failure comes from the Kaplan–Meier curve (midpoint of S before and
  after the step) instead of simple median ranks.
- Least squares of y on x gives β (slope) and η = exp(−intercept / β).

**Failure pattern from β.**
- β < 0.9 → infant mortality: a manufacturing, fitment or quality problem.
- 0.9–1.1 → random: interval replacement does not help.
- β > 1.1 → wear-out: a planned replacement interval pays off.

**Hazard rate (actuarial).** Failures per unit at risk in each km band: `d / (n − c/2)`, where c
is the suspensions in the band. Plotted over bands it gives the "bathtub".

**Precursor ramp.** For failures inside the telemetry window, a signal's mean |z| in the 7 days
before the replacement divided by its mean |z| 21–30 days before. A ramp well above 1 marks the
signal as an early-warning precursor for that part.

## 5. Driver behaviour
**Harsh and ADAS events** (`fact_harsh_events`):

| Event | Detected from | Penalty (Domain.md) |
|---|---|---|
| harsh_brake | deceleration ≥ ~0.33 g | 5 |
| harsh_accel | acceleration ≥ ~0.28 g | 3 |
| harsh_cornering | lateral ≥ ~0.3 g | 10 |
| overspeed | > 80 km/h governor limit | 4 |
| over_rev | RPM beyond the green band | 2 |
| excessive_idle | idle stretch > 30 min | 1 |
| aba_warning / aba_full_brake | Active Brake Assist (Mercedes ADAS) | 3 / 10 |
| lane_departure | lane-keeping assist | 2 |
| close_following | distance warning | 3 |

**Daily safety score**, normalised by distance so long-haul and city trucks compare fairly:

```
safety = clamp( 100 − (Σ penalties × 100 / max(km, 100)) × 6 , 0, 100 )
```

Typical results: aggressive drivers ≈ 60–70, average ≈ 85, smooth > 90.

**Eco score** (per trip; 0–100; for BEVs the RPM term is replaced by coasting):

```
eco = 100 − 0.8·idle% − 0.4·(100 − rpm_green_band%) − 0.05·brakes_per_100km
      − 200·overspeed_share + 0.1·cruise%
```

**Other behaviour indicators** (from rFMS accumulated data):
- **RPM green band %**: share of drive time at 1,100–1,500 rpm, the economical band.
- **Cruise %**, **coasting %**.
- **Brake applications per 100 km**: a measure of anticipation.

## 6. Fuel, energy and emissions
**Diesel consumption model:**

```
L/km = base/100 × (0.72 + 0.56·load) × (0.9 + 0.1·aggression) × severity
```

where `load = payload share`. Idle and PTO fuel are added on top: idle at the model's idle L/h
(+2 %/°C above 30 °C for air-conditioning); PTO at 7 L/h.

**Other quantities:**
- **AdBlue (DEF):** ≈ 5.5 % of diesel volume. A falling AdBlue:diesel ratio indicates a DEF
  dosing fault or tampering.
- **CO₂:** `2.68 kg per litre` of diesel. BEV tailpipe CO₂ = 0.
- **BEV energy:** `kWh/km = base/100 × (0.75 + 0.5·load) × (1 + 0.012·max(0, T − 25 °C))`. Regen
  recovers 10–18 % of that.
- **Idle waste cost** (Domain.md): `idle_hours × burn_rate × fuel_price`. Domain.md defines
  1.2 gal/h × $3.50/gal. The new data model measures idle fuel directly (`idle_fuel_l`), so the
  INR equivalent is `idle_fuel_l × ₹90/L`. **Decided 2026-10-01:** the UI shows the measured INR
  figure (`idle_fuel_l × ₹90/L`).
- **Utilization:** engine-on hours / 24 h per vehicle-day.

## 7. Warranty economics
**In warranty:** repair date ≤ in-service + 36 months **and** odometer ≤ 300,000 km. The
HV battery has its own warranty: 8 years / 800,000 km.
- Consumables (e.g. brake linings) are claimable only for early failure (< 30 % of design B10).

**NFF (No Fault Found):** the replaced part tests OK. NFF claims are likelier without DTC
evidence, and are mostly rejected.

**Liability and recovery:**
- Liability falls on the **OEM** or the **Supplier**; the higher the supplier's risk tier, the
  likelier it is the supplier.
- Paid supplier-liable claims recover 50–90 % of the claim amount.

**Claim amount:** `part cost + labour hours × dealer labour rate`, in INR.

| Dealer tier | Labour rate (₹/h) |
|---|---|
| Platinum | 1,800 |
| Gold | 1,500 |
| Silver | 1,250 |
| Bronze | 1,050 |

**Cost of a failure:** `parts + labour + downtime`. In the seeded data a predicted repair averages
≈ ₹42k and ≈ 10 h of downtime; a breakdown averages ≈ ₹55k and ≈ 55 h.

## 8. Uptime and data quality
**Uptime:** share of days a truck is not in the workshop (`fact_vehicle_daily.in_workshop`).

**Data completeness:**

```
completeness = Σ packets_received / Σ packets_expected
expected per day = ceil(engine_on_minutes / 5) + 24      (5-min reports + hourly sleep heartbeats)
```

Coverage is weaker in East (REG003) and on mining sites, and there are occasional "dark days"
when a unit is offline.

**Silent truck vs parked truck:**
- A parked truck still sends its 24 hourly heartbeats, but `last_ping_ts` keeps the time of the
  last *report* (the previous engine-off).
- So "no ping for 24 h" is not a fault signal. The Telematics module calls a truck **silent**
  when:
  - it received zero packets on its latest day; or
  - its last report is more than 48 h older than the fleet's latest.

**Group comparison** (Driver Safety tab): safety is compared across fleet groups (model,
application, region), not across named drivers. A group's score is distance-weighted, and its
event rate is `events ÷ km × 1,000`. The share of its drivers below the "Coach now" line (70) is
reported as a percentage only.

Details: [metrics/telematics.md](metrics/telematics.md).

## 9. Parts demand
```
weekly expected failures (connected sample) =
    historical replacement rate per vehicle-week × applicable connected trucks
  + Σ 30-day failure probability of those trucks / 4          (next 4 weeks only)
fleet demand = ceil( expected × fleet_vehicles / connected_vehicles × 1.1 )   (10 % safety)
```
