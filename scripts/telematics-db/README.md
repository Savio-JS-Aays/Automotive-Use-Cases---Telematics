# Telematics DB setup

Creates the telematics ecosystem schema in Supabase and fills it with simulated but internally
consistent data for the Daimler India CV fleet (BharatBenz 1617R / 3528C / 5528TT, Mercedes-Benz
Actros L / eActros 600). The data model is described in `docs/project_context.md`.

## Setup
Add the direct Postgres connection string to `my-react-app/.env`. It has no `VITE_` prefix, so it
never reaches the browser:

```
DATABASE_URI="postgresql://postgres.<project>:<password>@aws-0-ap-south-1.pooler.supabase.com:5432/postgres"
```

## Commands
| Command | What it does |
|---|---|
| `npm run db:migrate` | Applies `sql/schema.sql`. Idempotent. The first run renames the outdated `fact_telemetry` / `fact_vehicle_health` to `*_legacy`. |
| `npm run db:seed` | Regenerates all telematics data in **one transaction**: clears the previous telematics data, inserts, runs consistency checks, and commits only if every check passes. |
| `npm run db:setup` | `migrate` followed by `seed`. |
| `npm run db:reset -- --confirm` | Drops the owned tables and view, deletes the tagged rows and drops the added columns. Add `--restore-legacy` to rename the `*_legacy` tables back. |

Seed options (pass after `--`, e.g. `npm run db:seed -- --vehicles 300 --end 2026-09-30`):

| Flag | Default | Meaning |
|---|---|---|
| `--vehicles` | 200 | connected trucks (stratified across the 5 models) |
| `--days` | 90 | simulation window length |
| `--end` | today (IST) | last day of the window; must lie inside `dim_date` |
| `--snapshot-days` | 7 | days that get 5-min `fact_vehicle_status` rows |
| `--readings-per-day` | 2 | health-signal readings per driving day |
| `--seed` | 42 | same seed produces the same data |
| `--dry-run` | – | generate and print row counts; writes nothing |

The default run produces about 540k rows (~115 MB) and takes about 2.5 minutes over the pooler.

## Shared-table rules
The DB is shared with other apps (sales, logistics, service, DevOps):

- **Telematics-owned** (created, truncated, dropped freely):
  - `dim_signal`, `dim_dtc`, `bridge_dtc_part`, `dim_driver`;
  - `fact_trip`, `fact_vehicle_status`, `fact_harsh_events`, `fact_dtc_event`, `fact_charging_session`;
  - `fact_telemetry`, `fact_vehicle_health` (both redesigned);
  - `fact_vehicle_daily`, `fact_part_replacement`, `fact_part_demand_forecast`;
  - the `v_vehicle_context` view.
- **Shared tables only gain nullable columns:**
  - `dim_v_model`, `dim_vehicle`, `fact_repair_orders`, `fact_warranty_claims`.
  - Rows the script inserts into the shared facts carry `data_source = 'telematics_sim'`. Only
    those rows are ever deleted.
- **Verified on every seed:** before commit, the script compares an md5 fingerprint of the original
  columns and rows of every shared table. If anything changed, the transaction is rolled back.

## What the simulation guarantees
- **Consistent totals:**
  - odometers are monotonic;
  - trips never overlap;
  - Σ trip km = Σ daily km;
  - fuel, AdBlue and SoC levels carry across trips.
- **Fault scenarios** (~25 % of trucks) run in this order:
  1. The signal drifts in `fact_telemetry`.
  2. J1939 DTCs escalate from amber to red lamp and, where applicable, derate.
  3. `fact_vehicle_health` risk rises.
  4. The outcome is either a **predicted** repair (cheap, short downtime) or a **breakdown**
     (costly, long downtime).
  5. A part replacement follows, then a warranty claim if within 36 months / 300k km.
- **Driver behaviour:** latent smooth / average / aggressive profiles drive harsh events, RPM
  green-band %, fuel use and brake wear. Safety scores range from about 60 to 95+.
- **Workshop history back to `in_service_date`:** Weibull failures per part, scaled from
  `dim_part.b10_design_life_miles`, with supplier risk tier and duty severity. This gives
  Reliability enough failures for survival and B10 analysis.
- **Supply Chain:** `fact_part_demand_forecast` scales connected-fleet risk to the regional fleet,
  for comparison with `fact_part_inventory`.

Money is in INR:
- parts from `dim_part.unit_cost`;
- labour at ₹1,050–1,800 per hour by dealer tier.
