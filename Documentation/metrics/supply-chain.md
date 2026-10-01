# Metrics · Supply Chain (route hidden)

> Formula reference for parts demand vs stock.
>
> - Code: `src/hooks/useSupplyChainData.js` and `src/modules/supply-chain/SupplyChainModule.jsx`
> - Module status: **Implemented (legacy model)**. The import, route and nav are commented out
> - Last updated: 2026-09-30

## Legacy implementation
**Source:** `fact_part_inventory(quantity, forecasted_90d_demand, reorder_recommended)`, embedding
`dim_part(part_name)` and `dim_location(location_name, region_id)`.
- Only the region filter is applied.
- `reorder_recommended` is fetched but never used.

**Per row:**
- `urgency` = Critical if `quantity = 0 and demand > 0`; Reorder if `demand > quantity`; else
  Healthy.
- `reorder_qty = max(demand − quantity, 0)`.

| Title | Visual | Formula |
|---|---|---|
| Projected Component Demand | KPI | `Σ forecasted_90d_demand` |
| Parts Availability Score | KPI | `min(Σ quantity / Σ demand × 100, 100)`; 100 if demand = 0 |
| Depots in Deficit | KPI | `count(distinct location_name with any row demand > quantity)` |
| Critical Stockout Risk | KPI | `Σ demand where quantity = 0 / Σ demand × 100` |
| Depot Demand vs Stock (Top 15) | horizontal grouped bar | per depot: `Σ quantity`, `Σ demand`; top 15 by demand (optionally one part) |
| Region-Wise Urgency Distribution | stacked bar | `count(rows) by region_id × urgency` |
| Reorder & Allocation Master | table | per row: part, depot, on-hand, 90-day demand, reorder quantity, urgency |

**Known issues:**
- "In-transit stock" and "lead time" appear in the tooltips but are not modelled.
- The demand figures are static inventory data, not derived from predictions.

## Target on the new data model (Planned)
**Demand source:** `fact_part_demand_forecast`, which is prediction-driven and fleet-scaled (see
[02 §9](../02_Domain_Theory.md#9-parts-demand)). It is compared against the existing
`fact_part_inventory`, joined through `dim_location.region_id`.

| Title | Visual | Formula |
|---|---|---|
| 12-week expected demand | KPI | `Σ fleet_expected_demand where is_future` |
| Demand vs stock by region × part | grouped bar | `Σ fleet_expected_demand (future, 12 wk)` vs `Σ quantity` by region (inventory via `dim_location.region_id`) |
| Coverage (weeks of stock) | table | `Σ quantity / (Σ future demand / 12)` per part × region |
| Parts at risk of stockout | KPI | `count(part × region where Σ quantity < Σ demand of the next 4 weeks)` |
| Forecast vs actual | line | past weeks: `connected_predicted_failures` vs `connected_actual_replacements` (forecast accuracy, MAPE) |
| Risk-driven demand | bar | future weeks: demand share from `avg_failure_probability` (predictive) vs historical baseline |
| Reorder recommendation | table | `reorder = max(0, Σ 12-wk demand − quantity)`, with urgency pills per UI_Guide |
