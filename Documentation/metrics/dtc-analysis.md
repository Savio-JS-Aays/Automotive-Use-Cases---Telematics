# Metrics · DTC Analysis (new module)

> Formula reference for the planned J1939 fault-code analysis module.
>
> - Module status: **Merged into Vehicle Diagnostics → Fault Codes tab** (2026-10-01). Implemented
>   formulas are in [diagnostics.md](diagnostics.md). This file keeps the definitions and the
>   original plan; the rows still marked "Deferred" below are not built.
> - Last updated: 2026-10-01

Theory: [02 §1](../02_Domain_Theory.md#j1939-fault-codes) covers SPN/FMI, lamps, lifecycle and
derate.

## Definitions
- **Active DTC at time t:** `first_seen_ts ≤ t AND (cleared_ts IS NULL OR cleared_ts > t)
  AND status ≠ 'previously_active'`.
- **Intermittent (nuisance) DTC:** `status = 'previously_active'`. These self-heal and are
  excluded from repair KPIs, but available in Most Common Faults ("+ Intermittent").
- **Exposure:** km from `fact_vehicle_daily.distance_km`; engine hours from
  `fact_vehicle_daily.engine_hours`.

## KPIs (plan → status)
| Title | Formula | Status |
|---|---|---|
| Active fault codes | `count(fact_dtc_event where status = 'active')` | Implemented |
| Trucks with red lamp | `count(distinct vehicle_id where status = 'active' and lamp_status in ('RSL', 'PL'))` | Implemented (as red + amber split) |
| DTC rate per 10,000 km | `count(dtc events first seen in range) / Σ distance_km × 10,000` | Implemented (non-intermittent only) |
| Mean time to clear | `avg(cleared_ts − first_seen_ts)` in days, over cleared events | Implemented |
| Derate conversion | `count(events with caused_derate) / count(events of can_derate codes)` | Implemented |
| Predicted-repair share | `count(fact_repair_orders where dtc_event_id not null and visit_type = 'predicted') / count(… where dtc_event_id not null)` | Deferred (Prediction Performance) |

## Charts (plan → status)
| Title | View | Visual | Formula | Status |
|---|---|---|---|---|
| Top fault codes (Pareto) | Fleet | horizontal bar + cumulative % line | `count(*) group by dtc_id`, sorted descending; cumulative % = running sum / total. Label: SPN description + FMI | Replaced (2026-10-01) by **Most Common Faults**: bars of distinct trucks per fault, plain-English names, coloured by lamp, no cumulative line. See [diagnostics.md](diagnostics.md) |
| Faults by system × model | Fleet | heatmap | `count(*) group by dim_dtc.system, v_vehicle_context.model_label` | Implemented (per 100 trucks) |
| DTC rate trend | Fleet | line, 7-day rolling | daily `count(first seen) / daily km × 10,000` | Implemented (stacked by lamp) |
| Lamp severity mix | Fleet | donut (4 slices) | `count(*) group by lamp_status` (MIL / AWL / RSL / PL) | Replaced by the lamp-stacked trend |
| Code co-occurrence | Fleet | matrix | pairs of `dtc_id` active on the same truck with overlapping [first_seen, cleared/last_seen] intervals | Deferred (too sparse: 337 events) |
| DTC → likely part | Fleet | table | `fact_dtc_event ⋈ bridge_dtc_part`: expected part demand = `Σ likelihood` | Implemented (code drawer + Reliability confirmation table) |
| Fault lifecycle | Asset | Gantt | one bar per event from `first_seen_ts` to `cleared_ts` (or now), coloured by lamp | Implemented (Asset Gantt + fleet funnel) |
| Freeze frame | Asset | key/value panel | `freeze_frame` jsonb of the selected event | Implemented |
| Active DTC table | Both | table + action pill | active events with `dim_dtc.recommended_action`. Pill: RSL/PL → "Immediate Service" (red), AWL/MIL → "Plan Workshop" (amber) | Implemented |
