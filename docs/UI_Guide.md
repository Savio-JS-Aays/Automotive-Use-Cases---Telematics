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
- **Categorical Data**: Always use horizontal `<BarChart layout="vertical">` for categorical rankings (e.g., Top 5 Worst Vehicles). Donut charts are acceptable ONLY for parts-of-a-whole under 5 categories.
- **Tooltips**: Every chart and KPI card must feature a `ChartHeader` component with a Lucide `HelpCircle` icon that reveals a Tailwind absolute-positioned tooltip explaining the business value of the metric.

## Master Tables
- Tables sit at the bottom of the module (`overflow-x-auto`).
- Do not use generic statuses like "Paid/Rejected". Use actionable operational states rendered as colored pills (e.g., "Immediate Service" (Red), "Monitor" (Amber)).
- Rows should have a hover state (`hover:bg-sky-50`) and an `onClick` handler that triggers the Asset Drill-Down view.