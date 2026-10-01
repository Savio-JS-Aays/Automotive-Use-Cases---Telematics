# Telematics Domain Knowledge

Our dashboard tracks operational waste, asset utilization, and driver safety. It does NOT track part procurement or warranty claims. 

## Core Calculations & Logic
- **Idle Waste Cost**: Engine idling is our primary metric for financial waste. Calculate waste by multiplying idle hours by an assumed fuel burn rate (1.2 gal/hr) and fuel cost ($3.50/gal).
- **Safety Score**: Calculated per driver/vehicle starting at 100. Deduct points for events from `fact_harsh_events` (e.g., -5 for Hard Braking, -10 for Harsh Cornering).
- **Time-Series Smoothing**: Raw telemetry is noisy. Whenever charting daily averages or anomaly scores over time, ALWAYS apply a 7-day rolling average in the `useMemo` hook before passing data to Recharts to avoid "spaghetti charts."

## Dual-View Module Behavior
Every module must support two modes based on `useFilterStore().selectedVin`:
1. **Fleet View (`!selectedVin`)**: Aggregates data across the whole fleet. Shows region-by-region comparisons, top 10 worst offenders, and fleet-wide health percentages.
2. **Asset View (`selectedVin != null`)**: The "Micro" view. Charts must dynamically switch to show 24-hour speed traces, specific map coordinates for harsh events, and individual DTC (Diagnostic Trouble Code) alerts for the selected truck.