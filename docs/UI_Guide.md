# UI/UX & Styling Guidelines

## Executive OEM Aesthetic
- Use a clean, dark-text-on-light-background aesthetic (`bg-slate-50` for backgrounds, white cards with subtle borders `border-slate-200`).
- **Color Palette**: 
  - Neutral/Text: `slate-600` to `slate-900`.
  - Healthy/Moving: `emerald-500` to `emerald-600`.
  - Warning/Idling: `amber-500`.
  - Critical/Offline/Waste: `rose-500` to `red-600`.

## Charting Rules (Recharts)
- **Label Truncation**: Recharts horizontal `BarChart` components will silently fail and push the chart off-screen if Y-Axis text labels are too long. ALWAYS include a `truncateString` utility for Y-Axis labels.
- **Categorical Data** (updated 2026-10-22): rankings and part-of-whole breakdowns use the shared components, not raw Recharts:
  - `src/components/ui/RankedBars.jsx`: label left, value right, thick rounded track below; single, stacked or grouped series, optional dashed reference marker, hover detail and click. Use it instead of `<BarChart layout="vertical">` (it also removes the long-label problem).
  - `src/components/ui/DonutBreakdown.jsx`: donut with the total in the centre and one rounded legend row per slice (dot, name, value, share chip, progress bar). Use it instead of `<PieChart>`.
  - Column (vertical bar) charts stay in Recharts but spread the shared props from `src/components/ui/barStyle.js`: wide bars with 6 px rounded tops (`BAR_RADIUS`, `BAR_MAX_SIZE`, `BAR_CHART_PROPS`), the value printed above each bar (`VALUE_LABEL`; for stacks, the total on the top segment; left off above `MAX_LABELLED_BARS` = 16 bars), bold category labels (`BAR_X_AXIS`), a quiet value axis on the right (`BAR_Y_AXIS`; `BAR_Y_AXIS_LEFT` for the second axis of a dual-axis chart) and horizontal grid only (`BAR_GRID`). Each chart keeps its own colours.
  - Line and scatter charts are unchanged.
- **Hover values** (2026-10-22): every chart shows its exact value on hover. Recharts charts use `<Tooltip>`; custom visuals (`RankedBars` rows, `DonutBreakdown` slices and legend rows, `HeatGrid` and risk-matrix cells) use `src/components/ui/Hover.jsx`, a pointer-following tooltip rendered in a portal so scroll containers never clip it. `RankedBars` defaults to every segment's value plus the total when no `renderDetail` is given.
- **Drill-downs** open in a pop-up (`src/components/ui/Modal.jsx`: dimmed page, Esc / outside click / close button, header slot for search and toggles), not inline under the chart, so cards keep their size.
- **Card header** (`ChartHeader`): bold title, optional one-line `subtitle`, thin divider underneath, info tooltip beside the title.
- **Tooltips**: Every chart and KPI card must feature a `ChartHeader` component with a Lucide `HelpCircle` icon that reveals a Tailwind absolute-positioned tooltip explaining the business value of the metric.

## Master Tables
- **Look (2026-10-23):** use the shared `DataTable` (`src/modules/telematics/TelematicsUi.jsx`) or, for a hand-built
  table, the tokens in `src/components/ui/tableStyle.js`: a padded card with `ChartHeader` (title, subtitle, divider),
  a large search box on the left and "Showing x of y records" (plus CSV) on the right, then a framed table with a
  grey uppercase header (`TABLE_TH`), roomy rows (`TABLE_TD`, `TABLE_ROW`) and a bold first column (`TABLE_FIRST_TD`).
  Status cells stay as rounded pills in the module's own colours.
- Tables sit at the bottom of the module (`overflow-x-auto`).
- Do not use generic statuses like "Paid/Rejected". Use actionable operational states rendered as colored pills (e.g., "Immediate Service" (Red), "Monitor" (Amber)).
- Rows should have a hover state (`hover:bg-sky-50`) and an `onClick` handler that triggers the Asset Drill-Down view.