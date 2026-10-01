# Metrics · Financial & Warranty (`/financial-warranty`)

> Formula reference for exposure, savings, and claim-cost analytics.
>
> - Code: `src/hooks/useFinancialData.js` and `src/modules/financial-warranty/FinancialWarrantyModule.jsx`
> - Module status: **Implemented (legacy model)**, to be ported
> - Last updated: 2026-09-30

## Constants (legacy)
| Name | Value |
|---|---|
| `SAVINGS_RATE` | 0.6 |
| `HORIZON_DAYS` | 90 |
| `INR_TO_USD` | 0.012 (fixed) |
| `SIGNAL_MAPPING` | Powertrain → "RPM & Engine Load"; Electrical → "Battery Voltage"; Chassis → "Vibration & Alignment"; Cooling → "Coolant Temperature"; Brakes → "Brake Pressure" |

## Legacy implementation
**Sources:**
- **WC:** `fact_warranty_claims(claim_amount)`, embedding `dim_part(vehicle_subsystem)` and
  `dim_supplier(supplier_name)`. Region and model filters applied.
- **INV:** `fact_part_inventory(forecasted_90d_demand)`, embedding `dim_part(part_name, unit_cost,
  vehicle_subsystem)`. Region filter only.
- **The date range is ignored.**
- Per INV row: `exposure = forecasted_90d_demand × unit_cost × 0.012`.

| Title | Visual | Formula |
|---|---|---|
| Total Projected Exposure | KPI (USD) | `Σ exposure` |
| Preventable Loss Savings | KPI | `Σ exposure × 0.6` |
| Avg Cost Per Breakdown | KPI | `Σ claim_amount × 0.012 / count(WC)` |
| Highest Cost Supplier | KPI | `argmax Σ claim_amount by supplier_name` |
| Cumulative Financial Risk (90D) | AreaChart | **synthetic**: a seeded random ramp that distributes total exposure over 90 days (`seed = round(total)`) |
| Historical Exposure by Subsystem | donut | `Σ claim_amount × 0.012 by vehicle_subsystem` |
| Top 5 Cost-Driving Components | horizontal bar | `Σ exposure by part_name`, top 5 |
| Cost by Telematics Anomaly | bar | `Σ exposure by SIGNAL_MAPPING[vehicle_subsystem]` (static mapping; **no telemetry**) |
| Financial Exposure Master | table | per part: `Σ demand`, unit cost (first row), `Σ exposure` |

**Known issues:**
- The 90-day curve is synthetic.
- "Cost by Telematics Anomaly" uses no telemetry.
- `SAVINGS_RATE` is an assumption.
- The exchange rate is fixed.
- The legacy claims are not linked to faults or visits.

## Target on the new data model (Planned)
**Sources:**
- `fact_repair_orders` and `fact_warranty_claims`, restricted to `data_source = 'telematics_sim'`
  for the connected fleet;
- `fact_part_replacement`, `fact_vehicle_health`, `dim_part`.

**Currency:** keep **INR** as the base; show USD only as an optional display conversion.

| Title | Visual | Formula |
|---|---|---|
| Cost per breakdown vs predicted repair | KPI pair | `avg(labor_cost + parts_cost) by visit_type` (breakdown vs predicted) |
| Downtime per breakdown vs predicted | KPI pair | `avg(downtime_hours) by visit_type` |
| Realised preventable savings | KPI | `count(predicted) × (avg cost_breakdown − avg cost_predicted)`, computed from data instead of a fixed 60 % |
| Projected 30-day exposure | KPI + curve | `Σ over trucks × monitored parts of failure_probability × expected repair cost(part)`; expected cost = `avg(labor + parts)` of past breakdowns of that part. The cumulative curve spreads each truck's risk by `rul_days` |
| Warranty cost | KPI | `Σ claim_amount` (tagged) |
| Supplier recovery rate | KPI | `Σ recovered_amount / Σ claim_amount where liability_type = 'Supplier' and status = 'Paid'` |
| NFF rate | KPI | `count(nff_flag = 1) / count(claims)` |
| Cost by subsystem | donut / bar | `Σ (labor + parts) by dim_part.vehicle_subsystem` (via `fact_part_replacement`) |
| Cost by fault code | bar | `Σ RO cost by fact_dtc_event.dtc_id` (via `fact_repair_orders.dtc_event_id`). This is the real "cost by telematics anomaly" |
| Claim status funnel | bar | `count by status` (Submitted → In Review → Paid / Rejected) |
| Highest-cost supplier | KPI | `argmax Σ claim_amount by supplier_id` |
