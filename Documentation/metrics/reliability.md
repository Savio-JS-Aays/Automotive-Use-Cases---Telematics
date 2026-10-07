# Metrics · Component Reliability (`/component-reliability`)

> Formula reference for field life, supplier and build quality, and root cause
> (quality-engineer persona).
>
> - Code:
>   - `src/hooks/useReliabilityData.js`: fetch only;
>   - `src/modules/reliability/reliabilityMetrics.js`: every formula below;
>   - UI in `modules/reliability/*.jsx`.
> - Module status: **Implemented (new data model)**, 2026-10-01
> - Last updated: 2026-10-01

## Hidden charts (2026-10-01)
These charts are hidden with `SHOW` flags. Their formulas below remain valid; β, η and field B10
still appear in the KPI cards and in the Variance Master table.
- Field Life: Failure-Pattern Map (β × η) and Survival Curve (Kaplan–Meier). The part selector now
  sits on the Hazard Rate chart.
- Part View: Weibull Probability Plot. Survival by Group is still shown.

## Scope and data
- **Scope:**
  - connected trucks from `v_vehicle_context`;
  - region, model, powertrain, application and customer-type filters apply;
  - **the date range does not apply**, because this is lifetime data. The page header says so.
- **Failure source:** `fact_part_replacement`. It covers every unplanned replacement since
  `in_service_date`, across visit types predicted, breakdown and repair. Warranty claims are a
  subset and are not used.
- **Other sources:**
  - `dim_part` (design B10 in miles × 1.609344 = km);
  - `dim_supplier` (`risk_tier`);
  - the `fact_vehicle_daily.odometer_km_end` of the latest day, as the current odometer;
  - tagged `fact_repair_orders` (not planned), for `downtime_hours`;
  - `fact_dtc_event` (`resolved_by_ro_id`);
  - `bridge_dtc_part`;
  - `v_failure_precursor_summary`;
  - `v_failure_precursor`, loaded for one part in Part View.
- **Tabs:** `?tab=life` (default), `?tab=quality`, `?tab=cause`.
- **Part View:** `?part=<part_id>`.

## Constants
| Name | Value |
|---|---|
| `MIN_GROUP_FAILURES` | 5: fewer failures gives "Insufficient Data"; also the minimum for supplier and survival groups |
| `MIN_WEIBULL_FAILURES` | 10 before a Weibull fit is shown |
| `MIN_PRECURSOR_FAILURES` | 3 per precursor cell |
| `MIN_GROUP_TRUCKS` | 5: heatmap groups below this are greyed |
| `REPEAT_KM`, `REPEAT_DAYS` | 10,000 km, 30 days |
| `HAZARD_BUCKET_KM` | 50,000 km |
| Hazard status | variance < −20 % Critical · < 0 Watch · otherwise On Spec · < 5 failures Insufficient Data |
| Weibull pattern | β < 0.9 infant mortality · 0.9–1.1 random · > 1.1 wear-out |
| Confidence band | Greenwood, two-sided 90 % (z = 1.645) |

## Life table (renewal model)
Theory: [02 §4](../02_Domain_Theory.md#4-reliability-theory).

**Failure life:**
- Sort a truck's replacements of one part by odometer.
- life = `odometer_km_at_failure` − the previous replacement's odometer. For the first
  replacement it is − 0, because the part was fitted at the factory.
- **Repeat repair:** same truck and part, with life ≤ 10,000 km or ≤ 30 days since the previous
  replacement.

**Suspension (right-censored):**
- One per scope truck × *applicable* part: life = current odometer − the last replacement's
  odometer, or the current odometer if the part was never replaced.
- **Applicable** means any truck of the same `model_id` in scope has replaced that part.
  - This matches the simulator's fitment rules, which depend on the model.
  - PART020 (PTO) is the exception: it also depends on application.

**Supplier of a suspension:**
- It is the supplier of the last replacement.
- For never-replaced factory parts the supplier is unknown. In supplier groups such a suspension
  gets weight = that supplier's share of the part's replacements (a sourcing-mix proxy).

**Exposure:** Σ weight × life over failures and suspensions. That equals the km of part life.

## Estimators
**Kaplan–Meier:**
- Weighted. At tied times, failures come before suspensions.
- S(t) = Π (1 − dᵢ ÷ nᵢ).
- Greenwood: Var = S² Σ dᵢ ÷ (nᵢ(nᵢ − dᵢ)); the band is S ± 1.645·√Var, clipped to [0, 1].

**Field B10:** the first failure km where S ≤ 0.90. If S never gets that low, the Weibull B10 is
used and flagged "extrapolated".

**Weibull fit:**
1. Plotting positions are Kaplan–Meier midpoints: F = 1 − (S(t⁻) + S(t)) ÷ 2 at each failure
   time.
2. Transform: x = ln km, y = ln(−ln(1 − F)).
3. Least squares of y on x gives slope β and intercept a.
4. η = exp(−a ÷ β); B10 = η(−ln 0.9)^(1/β).

**Rates:**
- Variance % = field B10 ÷ design B10 (km) − 1.
- Rate per 100k km = failures ÷ exposure × 10⁵.
- MTBF = exposure ÷ failures.

## Tab 1 · Field Life
| KPI | Formula |
|---|---|
| Parts Below Design B10 | parts with ≥ 5 failures and variance < 0, out of the rated parts |
| Worst Supplier Variance | min variance over part × supplier groups with ≥ 5 failures (clicking opens Part View) |
| Fleet MTBF | Σ current odometer of the scope trucks ÷ total replacements |
| Predicted Before Failure | `count(was_predicted)` ÷ replacements |
| Downtime per Failure | mean `downtime_hours` of each replacement's repair order |
| Repeat Repairs | repeat replacements ÷ replacements |

**Charts and table:**
- **Failure-Pattern Map (β × η).**
  - one bubble per part with a Weibull fit: x = η (log scale), y = β, size = failures;
  - coloured by hazard status; a reference line marks β = 1;
  - clicking a bubble opens Part View.
- **Survival Curve (Kaplan–Meier).**
  - a local part selector, defaulting to the most-replaced part;
  - group toggle: All / Supplier / Model / Application (groups with ≥ 5 failures, top 5);
  - drawn as step lines on an 80-point km grid, with the 90 % band for a single group;
  - reference lines at S = 90 % and at the design B10.
- **Hazard Rate by km.** Actuarial estimate per 50,000 km band.
  - rate = d ÷ (units at risk at the band start − suspensions in the band ÷ 2) × 1,000;
  - stops once fewer than 5 units are at risk.
- **Component Variance Master.** Table, one row per part with at least one replacement, with
  failures, running (suspensions), β, η, field B10 (and the extrapolated flag), design B10,
  variance, rate per 100k km and hazard status. Clicking a row opens Part View; CSV export.

## Tab 2 · Supplier & Build Quality
- **Supplier Scorecard.**
  - part × supplier groups with ≥ 5 failures: field B10 ÷ design B10 × 100, the worst 15;
  - coloured by `risk_tier`; labelled with n;
  - a reference line marks 100 %.
- **Risk Tier Check.**
  - per tier: the median scorecard % across all of that tier's groups with ≥ 5 failures (not only
    the worst 15);
  - labels show the group count.
  - A raw failures-per-km comparison by tier was tested and rejected. It was confounded by part
    mix and by attributing factory-fitted parts via replacement share.
- **Build Cohort × Age at Failure.** Heatmap.
  - rows = production quarter (`production_date`), with the truck count;
  - columns = vehicle age at failure (`vehicle_age_days` ÷ 30.4375): 0–12 / 12–24 / 24–36 /
    36–48 / 48+ months;
  - cell = failures ÷ cohort trucks whose current age (latest date − `in_service_date`) ≥ the
    bucket start × 100;
  - greyed if fewer than 5 trucks are exposed; blank if none are.
- **Where Parts Fail.** Heatmap of the top 12 parts × application, region or model (toggle).
  - cell = failures ÷ exposure km of that group × 10⁵;
  - greyed if fewer than 5 trucks; clicking a cell opens Part View.

## Tab 3 · Root Cause
- **Main Failure Cause by Part.** A ranked list (replaced the stacked "Failure-Mode Mix (Top 10
  Parts)" bars on 2026-10-01: up to ~20 failure modes across 10 parts needed a 12-colour legend and
  was hard to read).
  - One row per part, for the `MAIN_CAUSE_PARTS` = 10 parts with the most failures (the same
    ordering as the Field Life summaries).
  - **Bar and count:** the part's failures (`fact_part_replacement` rows in scope), in a single
    colour, scaled to the largest part.
  - **Main cause line:** "Mostly {mode} ({share} %)", where mode = the most common `failure_mode`
    of that part and share = its count ÷ the part's failures × 100. Ties are broken
    alphabetically. A missing mode counts as "Unknown".
  - **Clear target pill:** shown when the displayed (rounded) share ≥ `CLEAR_CAUSE_SHARE` = 40 % and the part has at least
    `MIN_GROUP_FAILURES` = 5 failures. The main cause is then in bold. Otherwise the second mode is
    shown in grey ("then {mode} ({share} %)").
  - **Tooltip (hover):** every mode with its count and share.
  - **Footnote:** how many of the listed parts have a clear target.
  - Clicking a row opens Part View.
- **Precursor Ramp (Part × Signal).** Heatmap built from `v_failure_precursor_summary`.
  - The view has one row per replacement × signal inside the telemetry window.
  - ramp = mean(`late_mean_abs_z`, days 1–7 before) ÷ mean(`early_mean_abs_z`, days 21–30
    before), over replacements where both are present;
  - a cell needs ≥ 3 failures; rows need ≥ 3;
  - colour value = max(0, ramp − 1).
  - Validation on the 2026-09-30 seed: Air P → Air Brake Compressor 6.4×, 24 V battery →
    Alternator 5.9×, DPF ΔP → DPF 3.4×.
- **Fault Code → Part Confirmation.** Table, per `bridge_dtc_part` link that has resolved
  occurrences:
  - observed = resolved DTC events (with `resolved_by_ro_id`) whose repair order replaced that
    part ÷ resolved events of the code;
  - gap = observed − catalog `likelihood`, in pp; the pill is green when |gap| < 20.

## Part View (`?part=`)
- **KPIs:**
  - field B10 (KM or extrapolated);
  - Weibull shape / life (β / η and the pattern);
  - failures / running, and rate per 100k km;
  - predicted % and repeat %;
  - downtime per failure;
  - parts cost per failure (mean `part_cost_inr`).
- **Weibull Probability Plot.**
  - series for all suppliers plus each supplier with ≥ 5 failures (a fit line from 10);
  - axes are labelled in km and F % (1–99);
  - reference lines at the design B10 and at F = 10 %.
- **Survival by Group.** Same as Field Life, fixed to this part.
- **Failure Modes** and **Hazard Rate by km.** Same formulas as above.
- **Precursor Signature.**
  - x = days before replacement (−30 … −1); y = mean `mean_abs_z` over this part's replacements;
  - the 4 signals with the highest ramp (days 1–7 ÷ days 21–30) are shown.
- **Replacements.** Table with VIN, model, date, odometer, part life, supplier, mode, visit type
  and repeat / warranty flags. Clicking a row opens Vehicle Diagnostics Asset View.

## Validation against the simulator (2026-10-01, seed 42)
| Check | Simulator truth | Recovered |
|---|---|---|
| Median β, Mechanical parts | 2.4 | 2.1 |
| Median β, Consumable parts | 1.8 | 1.84 |
| Median β, Electrical parts | 1.2 | 1.27 |
| Median B10 ÷ design, High-risk-tier suppliers | 0.72 ÷ duty severity | 0.74 |
| Median B10 ÷ design, Low-risk-tier suppliers | 1.08 ÷ duty severity | 0.85 |

Most parts sit below design because the simulator also divides η by the duty-cycle severity
(≥ 1).

## Deferred
**Prediction Performance tab:**
- alert precision and recall (`fact_vehicle_health` alerts against replacements);
- a lead-time histogram;
- cost and downtime of predicted vs breakdown visits.
