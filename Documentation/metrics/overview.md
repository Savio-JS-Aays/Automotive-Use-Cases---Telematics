# Metrics · Overview (`/`)

> Formula reference for every KPI, chart and table on the Overview page.
>
> - Code: `src/hooks/useOverviewData.js` and `src/modules/overview/OverviewModule.jsx`
> - Module status: **Implemented (new data model)**
> - Audience: OEM service / uptime engineer (risk first), with fleet uptime
> - Last updated: 2026-10-01

## Principles
- **Fleet View only.** A truck selected elsewhere (`selectedVin`) does not change the Overview.
  A banner offers "Open in Diagnostics" / "Back to fleet". Clicking a table row selects the truck
  (`vehicle_id`) and opens `/vehicle-diagnostics`.
- **NOW vs PERIOD.** Every card carries a badge:
  - **NOW:** the latest prediction run / current DTC state; ignores the date range.
  - **PERIOD:** follows the date range.
- **One truck = one vote.** Risk uses each truck's **worst part** (highest 30-day failure
  probability), never an arbitrary health row.
- **Normalised comparisons.** Trend and matrix values are per 100 trucks or % of the cell, so large
  regions or models don't dominate.

## Scope and data used
- **Scope S:** `v_vehicle_context` where `is_connected = true`, plus the global filters
  (`region_id`, `model_id`, `powertrain`, and since 2026-10-01 `application_id` and
  `customer_type`). `N = |S|`, 200 with no filters. Every fact query is
  restricted with `.in("vehicle_id", S)`.
- **Health H:** `fact_vehicle_health` rows with `ts ≥ anchor − 14 days`. `anchor = max(ts)` of
  the table, so the page still works when the data isn't live.
  - `latest(v, part)` = the H row with the max `ts` per vehicle × part.
  - `worst(v)` = the `latest` row with the max `failure_probability` for the truck.
  - Embeds `dim_part(part_name)`.
- **Alerts A:** `fact_vehicle_health` where `trigger = 'alert'` and
  `date_id ≥ period start − 6 days`.
- **DTC events E:** all `fact_dtc_event` rows for S (a few hundred), embedding
  `dim_dtc(spn_description, system, severity_class, recommended_action)`.
- **Daily D:** `fact_vehicle_daily` from the previous-period start to today.
- **Period:** Last 7 / 30 / 90 days ending today (local dates; `date_id` is an IST date). The
  previous period is the same length immediately before it.

## Constants
| Name | Value | Meaning |
|---|---|---|
| Risk bands (`bandFor`) | Critical p > 0.70 · High 0.40–0.70 · Medium 0.20–0.40 · Low < 0.20 | from [02 §3](../02_Domain_Theory.md) |
| `DUE_SOON_DAYS` | 14 | "Due for workshop" cut-off on `rul_days` |
| `MATRIX_MIN_TRUCKS` | 5 | matrix cells with fewer trucks are greyed and not rated |
| `HEALTH_LOOKBACK_DAYS` | 14 | two weekly prediction cycles, so every truck × part has a row |
| `TREND_WINDOW_DAYS` | 7 | rolling window for the early-warning trend |
| `MIN_PREV_COVERAGE` | 0.8 | previous-period vehicle-days needed before a delta is shown |
| `STALE_PING_HOURS` | 48 | "Last ping" shown in amber when older |
| Serious DTC | `severity_class ∈ {critical, major}` | |
| Red / derate | `lamp_status = 'RSL'` or `caused_derate = true` on an active event | |

## KPIs
### Trucks at Risk (NOW)
| | |
|---|---|
| Formula | `count(v ∈ S where band(worst(v).p) ∈ {Critical, High})`; subtitle `of N (x %) · n Critical` |
| Click | filters the action list to Critical + High |
| Seed value (all filters off) | 9 of 200 (3 Critical) |

### Trucks with Active Faults (NOW)
| | |
|---|---|
| Formula | `count(distinct vehicle_id in E where status = 'active')`; subtitle = trucks with red / derate |
| Click | opens Diagnostics |
| Note | Planned as "Red Lamp / Derated", but the seed has no *active* RSL or derate events (they are all cleared), so that card would always read 0. The red/derate count is kept as a sub-line. |

### Due for Workshop ≤ 14 days (NOW)
| | |
|---|---|
| Formula | `count(v where worst(v).rul_days ≤ 14)` |
| Click | filters the action list to those trucks |

### Fleet Uptime (PERIOD)
| | |
|---|---|
| Formula | `1 − Σ in_workshop / count(D rows in period)` × 100 |
| Delta | current − previous period, in percentage points; hidden if the previous period has < 80 % of `N × days` rows (e.g. 90 days, which predates the data window) |
| Sparkline | 7-day rolling average of daily uptime |

### Data Completeness (PERIOD)
| | |
|---|---|
| Formula | `Σ packets_received / Σ packets_expected × 100` over D in the period |
| Subtitle | the region with the lowest completeness |
| Delta | as for uptime |

## Charts
### C1 · Fleet Risk Posture (NOW)
| | |
|---|---|
| Visual | donut, 4 slices (Critical, High, Medium, Low) |
| Formula | `count(v) group by band(worst(v).p)` |
| Click | a slice filters the action list to that band |

### C2 · Early-Warning Trend (PERIOD)
| | |
|---|---|
| Visual | 2 lines, one point per day of the period |
| Formula | for day d: `alerts(d−6..d) / N × 100` and `serious DTC events first seen (d−6..d) / N × 100` |
| Tooltip | per-100 values plus raw counts |
| Why | normalised by fleet size; alerts rising before DTCs shows the model warns early |

### C3 · Region × Model Risk Matrix (NOW)
| | |
|---|---|
| Visual | CSS-grid heatmap: rows = `region_name`, columns = `model_label` |
| Cell | `atRisk / total` trucks in that region × model, as % (rose intensity saturates at 30 %) |
| Rules | 0 % cells are neutral; cells with `total < 5` are grey "—" (not rated) |
| Click | filters the action list by region and model |

### C4 · Top Predicted Failures by Part (NOW)
| | |
|---|---|
| Visual | horizontal stacked bar (Critical / High), top 8, labels truncated to 22 chars |
| Formula | `count(v at Critical/High) group by worst(v).part_name` |
| Click | a bar filters the action list by part |

## Table · Workshop Action List
| | |
|---|---|
| Rows | trucks with band Critical/High, **or** `rul_days ≤ 14`, **or** an active serious DTC, **or** an active red/derate event |
| Status | **Immediate Service**: Critical or red/derate · **Plan Workshop**: High or `rul_days ≤ 14` · **Monitor**: active serious DTC only |
| Sort | status, then failure probability (descending) |
| Columns | Truck (VIN, model · region), Status, Worst part + band, Fail. prob (30d), RUL (days, km), Related DTC (`worst.driver_dtc_event_id`, else the most severe active event; lamp pill; "not active" if cleared), Recommended action (`ai_prescriptive_action`, else `dim_dtc.recommended_action`), Last ping (max `last_ping_ts`) |
| Local filters | status chips with counts, part dropdown, VIN / vehicle-ID search, and removable chips for every chart / KPI cross-filter |
| Row click | `setSelectedVin(vehicle_id)` → `/vehicle-diagnostics` |

## Retired from the legacy Overview
| Legacy visual | Why it was removed |
|---|---|
| Data Quality Trust Score (non-null z-scores) | didn't measure connectivity; replaced by Data Completeness |
| Avg Fleet RUL (miles) | an average hides the trucks about to fail and mixes parts; replaced by Due ≤ 14 days |
| Total Telemetry Events | vanity count that only grows with the date range |
| Predictive Alert Volume Trend (z > 3 readings / day) | raw counts skewed by fleet size, unsmoothed; replaced by C2 |
| Active Risk by Region (absolute count) | favoured large regions; replaced by the normalised matrix C3 |
| Latest health row per vehicle | picked an arbitrary part; replaced by the worst part per truck |

## Known issues
- ~~The Asset View drill-down was empty because Diagnostics read the legacy tables.~~ Fixed on
  2026-10-01: a row click now opens the rebuilt Diagnostics Asset View (verified in the browser).
- "Now" is anchored on the latest prediction run, but the PERIOD range ends at the browser's
  today. If the demo runs long after the seed window, PERIOD cards go empty. Re-seed or extend the
  simulator.
