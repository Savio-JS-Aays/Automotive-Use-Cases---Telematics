#!/usr/bin/env node
// Telematics ecosystem — schema migration + realistic data seed for Supabase.
//
//   node scripts/telematics-db/setup-telematics-db.mjs <migrate|seed|all|reset> [options]
//
// Options (seed / all):
//   --vehicles <n>          connected trucks to simulate           (default 200)
//   --days <n>              simulation window length in days       (default 90)
//   --end <YYYY-MM-DD>      last day of the window                 (default today, IST)
//   --snapshot-days <n>     days with 5-min status snapshots       (default 7)
//   --readings-per-day <n>  health-signal readings per driving day (default 2)
//   --seed <n>              PRNG seed — same seed, same data       (default 42)
//   --dry-run               generate and print counts, write nothing
// Options (reset):
//   --confirm               required: drops owned tables, tagged rows and added columns
//   --restore-legacy        also rename fact_telemetry_legacy / fact_vehicle_health_legacy back
//
// Reads DATABASE_URI from my-react-app/.env. See README.md in this folder.

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { columnExists, connect, insertRows, quoteIdent, tableExists } from "./lib/db.mjs";
import { createRng } from "./lib/rng.mjs";
import { addDays, todayIst } from "./lib/time.mjs";
import { DATA_SOURCE_TAG, DTC_PART_MAP, DTCS, MODEL_SPECS, SIGNALS } from "./reference/catalog.mjs";
import { buildDrivers, buildVehicleProfiles, selectFleet, toDriverRow } from "./generators/fleet.mjs";
import { createIdGenerator, createServiceContext } from "./generators/service.mjs";
import { simulateFleet } from "./generators/simulate.mjs";
import { buildDemandForecast } from "./generators/forecast.mjs";

// Tables created and owned by this script (child → parent order for DROP).
const OWNED_TABLES = [
  "fact_part_demand_forecast",
  "fact_part_replacement",
  "fact_vehicle_daily",
  "fact_vehicle_health",
  "fact_telemetry",
  "fact_charging_session",
  "fact_dtc_event",
  "fact_harsh_events",
  "fact_vehicle_status",
  "fact_trip",
  "dim_driver",
  "bridge_dtc_part",
  "dim_dtc",
  "dim_signal",
];
// Views and materialized views (dependants first, so DROP works in this order).
const OWNED_VIEWS = ["v_failure_precursor_summary", "v_failure_precursor", "v_vehicle_context"];
const OWNED_MATVIEWS = ["mv_telemetry_daily"];
// Redesigned tables share their names with the legacy ones: only touch the new shape.
const NEW_SHAPE_MARKER = { fact_telemetry: "signal_code", fact_vehicle_health: "risk_band" };

// Nullable columns this script adds to shared tables (never touches any other column).
const ADDED_COLUMNS = {
  dim_v_model: ["powertrain", "engine_family", "transmission", "axle_config", "fuel_tank_l", "battery_kwh", "gcw_max_kg", "base_consumption", "consumption_unit", "adas_equipped"],
  dim_vehicle: ["is_connected", "telematics_unit_id", "telematics_source", "connected_since", "model_year", "warranty_end_date", "warranty_km_limit", "home_lat", "home_lon", "primary_driver_id"],
  fact_repair_orders: ["visit_type", "dtc_event_id", "open_ts", "close_ts", "downtime_hours", "odometer_km", "parts_cost", "data_source"],
  fact_warranty_claims: ["dtc_event_id", "ro_id", "was_predicted", "data_source"],
};
const SHARED_PK = { dim_v_model: "model_id", dim_vehicle: "vehicle_id", fact_repair_orders: "ro_id", fact_warranty_claims: "claim_id" };
const TAGGED_TABLES = ["fact_repair_orders", "fact_warranty_claims"];

// ---------------------------------------------------------------------------
function parseCli() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      vehicles: { type: "string", default: "200" },
      days: { type: "string", default: "90" },
      end: { type: "string" },
      "snapshot-days": { type: "string", default: "7" },
      "readings-per-day": { type: "string", default: "2" },
      seed: { type: "string", default: "42" },
      "dry-run": { type: "boolean", default: false },
      confirm: { type: "boolean", default: false },
      "restore-legacy": { type: "boolean", default: false },
    },
  });
  const command = positionals[0];
  if (!["migrate", "seed", "all", "reset"].includes(command)) {
    console.error("Usage: setup-telematics-db.mjs <migrate|seed|all|reset> [--vehicles 200] [--days 90] [--end YYYY-MM-DD] [--snapshot-days 7] [--readings-per-day 2] [--seed 42] [--dry-run] [--confirm] [--restore-legacy]");
    process.exit(1);
  }
  const int = (k) => {
    const n = Number.parseInt(values[k], 10);
    if (!Number.isFinite(n) || n <= 0) throw new Error(`--${k} must be a positive integer`);
    return n;
  };
  return {
    command,
    vehicles: int("vehicles"),
    days: int("days"),
    end: values.end,
    snapshotDays: int("snapshot-days"),
    readingsPerDay: int("readings-per-day"),
    seed: int("seed"),
    dryRun: values["dry-run"],
    confirm: values.confirm,
    restoreLegacy: values["restore-legacy"],
  };
}

// ---------------------------------------------------------------------------
// Migrate
// ---------------------------------------------------------------------------
async function migrate(client) {
  console.log("▶ migrate: applying sql/schema.sql");
  const sql = await readFile(new URL("./sql/schema.sql", import.meta.url), "utf8");
  client.on("notice", (n) => console.log(`  notice: ${n.message}`));
  await client.query(sql);
  await refreshRollups(client);
  console.log("✔ schema is up to date");
}

// Materialized rollups read by Diagnostics / Reliability. Run after every seed and migrate.
async function refreshRollups(client) {
  for (const view of OWNED_MATVIEWS) {
    await client.query(`REFRESH MATERIALIZED VIEW ${quoteIdent(view)}`);
    await client.query(`ANALYZE ${quoteIdent(view)}`);
    console.log(`  refreshed ${view}`);
  }
}

async function assertMigrated(client) {
  for (const [table, marker] of Object.entries(NEW_SHAPE_MARKER)) {
    if (!(await columnExists(client, table, marker))) throw new Error(`${table} is not in the new shape — run "migrate" first.`);
  }
  for (const table of TAGGED_TABLES) {
    if (!(await columnExists(client, table, "data_source"))) throw new Error(`${table}.data_source missing — run "migrate" first.`);
  }
}

// ---------------------------------------------------------------------------
// Shared-data fingerprint (proves existing rows/columns are untouched)
// ---------------------------------------------------------------------------
async function sharedFingerprint(client) {
  const result = {};
  for (const [table, pk] of Object.entries(SHARED_PK)) {
    const { rows: cols } = await client.query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position`,
      [table]
    );
    const original = cols.map((c) => c.column_name).filter((c) => !ADDED_COLUMNS[table].includes(c));
    const filter = (await columnExists(client, table, "data_source")) ? `WHERE data_source IS DISTINCT FROM '${DATA_SOURCE_TAG}'` : "";
    const { rows } = await client.query(
      `SELECT count(*)::int AS n, md5(string_agg(md5(ROW(${original.map(quoteIdent).join(", ")})::text), '' ORDER BY ${quoteIdent(pk)})) AS hash FROM ${quoteIdent(table)} ${filter}`
    );
    result[table] = rows[0];
  }
  return result;
}

function compareFingerprints(before, after) {
  let ok = true;
  console.log("▶ shared tables — original data fingerprint");
  for (const table of Object.keys(before)) {
    const same = before[table].n === after[table].n && before[table].hash === after[table].hash;
    ok &&= same;
    console.log(`  ${same ? "✔" : "✘"} ${table.padEnd(22)} ${String(after[table].n).padStart(6)} original rows  ${same ? "unchanged" : "CHANGED"}`);
  }
  return ok;
}

// ---------------------------------------------------------------------------
// Seed
// ---------------------------------------------------------------------------
export async function loadShared(client) {
  const q = async (sql) => (await client.query(sql)).rows;
  // sequential: a single pg client must not run concurrent queries
  const vehicles = await q(`SELECT v.vehicle_id, v.vin, v.model_id, v.customer_id, v.location_id, v.application_id, v.current_status,
              v.production_date, v.in_service_date, l.location_name, l.region_id
         FROM dim_vehicle v JOIN dim_location l ON l.location_id = v.location_id`);
  const models = await q("SELECT model_id, model_name, variant FROM dim_v_model ORDER BY model_id");
  const parts = await q("SELECT * FROM dim_part ORDER BY part_id");
  const suppliers = await q("SELECT supplier_id, supplier_name, risk_tier FROM dim_supplier ORDER BY supplier_id");
  const dealers = await q("SELECT dealer_id, region_id, dealer_tier, status FROM dim_dealer ORDER BY dealer_id");
  const dateRange = await q("SELECT min(date_id) AS min, max(date_id) AS max FROM dim_date");
  return { vehicles, models, parts, suppliers, dealers, dateRange: dateRange[0] };
}

export function generate(shared, opts) {
  const windowEnd = opts.end ?? (todayIst() > shared.dateRange.max ? shared.dateRange.max : todayIst());
  const windowStart = addDays(windowEnd, -(opts.days - 1));
  if (windowStart < shared.dateRange.min || windowEnd > shared.dateRange.max) {
    throw new Error(`Window ${windowStart} → ${windowEnd} is outside dim_date (${shared.dateRange.min} → ${shared.dateRange.max}).`);
  }
  console.log(`▶ generating: ${opts.vehicles} trucks, ${windowStart} → ${windowEnd} (${opts.days} days), seed ${opts.seed}`);

  const rng = createRng(opts.seed);
  const nextId = createIdGenerator();
  const sample = selectFleet({ rng, vehicles: shared.vehicles, models: shared.models, count: opts.vehicles, windowStart });
  const fleet = buildVehicleProfiles({ rng, sample, models: shared.models, windowStart });
  const drivers = buildDrivers({ rng, fleet, windowEnd });

  const partsById = new Map(shared.parts.map((p) => [p.part_id, p]));
  const suppliersById = new Map(shared.suppliers.map((s) => [s.supplier_id, s]));
  const dtcsById = new Map(DTCS.map((d) => [d.dtc_id, d]));
  const service = createServiceContext({ dealers: shared.dealers, suppliersById, partsById, windowEnd, nextId });

  const sim = simulateFleet({
    fleet,
    parts: shared.parts,
    partsById,
    suppliers: shared.suppliers,
    suppliersById,
    dtcsById,
    signalsByCode: new Map(SIGNALS.map((s) => [s.signal_code, s])),
    nuisanceCodes: DTCS.filter((d) => d.nuisance),
    service,
    windowStart,
    days: opts.days,
    snapshotDays: Math.min(opts.snapshotDays, opts.days),
    readingsPerDay: opts.readingsPerDay,
    nextId,
  });

  const forecast = buildDemandForecast({
    fleet,
    parts: shared.parts,
    replacements: service.replacements,
    health: sim.health,
    vehicles: shared.vehicles,
    windowStart,
    windowEnd,
    nextId,
    rng,
  });

  const models = shared.models
    .filter((m) => MODEL_SPECS[m.variant])
    .map((m) => {
      const s = MODEL_SPECS[m.variant];
      return {
        model_id: m.model_id,
        powertrain: s.powertrain,
        engine_family: s.engine_family,
        transmission: s.transmission,
        axle_config: s.axle_config,
        fuel_tank_l: s.fuel_tank_l,
        battery_kwh: s.battery_kwh,
        gcw_max_kg: s.gcw_max_kg,
        base_consumption: s.base_consumption,
        consumption_unit: s.consumption_unit,
        adas_equipped: s.adas_equipped,
      };
    });

  const connected = fleet.map((v) => ({
    vehicle_id: v.vehicle_id,
    telematics_unit_id: v.telematicsUnitId,
    telematics_source: v.spec.telematics_source,
    connected_since: v.connectedSince,
    warranty_end_date: v.warrantyEnd,
    warranty_km_limit: v.warrantyKm,
    home_lat: Math.round(v.home[0] * 1e5) / 1e5,
    home_lon: Math.round(v.home[1] * 1e5) / 1e5,
    primary_driver_id: v.primaryDriver.driver_id,
  }));

  const signals = SIGNALS.map(({ health: _health, ...s }) => s);
  const dtcs = DTCS.map(({ nuisance: _nuisance, ...d }) => d);
  const bridge = Object.entries(DTC_PART_MAP).flatMap(([dtc_id, links]) => links.map(([part_id, likelihood]) => ({ dtc_id, part_id, likelihood })));

  const scenarios = fleet.flatMap((v) => v.scenarios);
  return {
    windowStart,
    windowEnd,
    fleet,
    models,
    connected,
    tables: {
      dim_signal: signals,
      dim_dtc: dtcs,
      bridge_dtc_part: bridge,
      dim_driver: drivers.map(toDriverRow),
      fact_trip: sim.trips,
      fact_vehicle_status: sim.status,
      fact_harsh_events: sim.harsh,
      fact_dtc_event: sim.dtcEvents,
      fact_charging_session: sim.charging,
      fact_telemetry: sim.telemetry,
      fact_vehicle_health: sim.health,
      fact_repair_orders: service.repairOrders,
      fact_warranty_claims: service.claims,
      fact_part_replacement: service.replacements,
      fact_vehicle_daily: sim.daily,
      fact_part_demand_forecast: forecast,
    },
    summary: {
      scenarios: scenarios.length,
      predicted: scenarios.filter((s) => s.outcome === "predicted").length,
      breakdown: scenarios.filter((s) => s.outcome === "breakdown").length,
      byKey: scenarios.reduce((m, s) => ({ ...m, [s.key]: (m[s.key] ?? 0) + 1 }), {}),
    },
  };
}

function printSummary(data) {
  console.log("▶ generated rows");
  let total = 0;
  for (const [table, rows] of Object.entries(data.tables)) {
    total += rows.length;
    console.log(`  ${table.padEnd(28)} ${rows.length.toLocaleString().padStart(9)}`);
  }
  console.log(`  ${"total".padEnd(28)} ${total.toLocaleString().padStart(9)}`);
  const s = data.summary;
  console.log(`▶ fault scenarios: ${s.scenarios} (${s.predicted} caught by predictive alert, ${s.breakdown} ended in breakdown or still open)`);
  console.log(`  ${Object.entries(s.byKey).map(([k, n]) => `${k}=${n}`).join("  ")}`);
}

async function runChecks(client) {
  const checks = [
    ["replacement → repair order", `SELECT count(*)::int AS n FROM fact_part_replacement r WHERE NOT EXISTS (SELECT 1 FROM fact_repair_orders o WHERE o.ro_id = r.ro_id)`],
    ["replacement → warranty claim", `SELECT count(*)::int AS n FROM fact_part_replacement r WHERE r.claim_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM fact_warranty_claims c WHERE c.claim_id = r.claim_id)`],
    ["odometer monotonic across trips", `SELECT count(*)::int AS n FROM (SELECT start_odometer_km, lag(end_odometer_km) OVER (PARTITION BY vehicle_id ORDER BY start_ts) AS prev FROM fact_trip) x WHERE start_odometer_km < prev - 0.05`],
    ["trips never overlap per truck", `SELECT count(*)::int AS n FROM (SELECT start_ts, lag(end_ts) OVER (PARTITION BY vehicle_id ORDER BY start_ts) AS prev FROM fact_trip) x WHERE start_ts < prev`],
    ["Σ trip km = Σ daily km per truck", `SELECT count(*)::int AS n FROM (SELECT vehicle_id, sum(distance_km) s FROM fact_trip GROUP BY 1) t JOIN (SELECT vehicle_id, sum(distance_km) s FROM fact_vehicle_daily GROUP BY 1) d USING (vehicle_id) WHERE abs(t.s - d.s) > 1 + 0.001 * d.s`],
    ["DTC precedes the repair order it caused", `SELECT count(*)::int AS n FROM fact_repair_orders o JOIN fact_dtc_event e ON e.dtc_event_id = o.dtc_event_id WHERE o.data_source = '${DATA_SOURCE_TAG}' AND e.first_seen_ts > o.open_ts`],
    ["every claim is within warranty", `SELECT count(*)::int AS n FROM fact_warranty_claims c JOIN fact_part_replacement r ON r.claim_id = c.claim_id WHERE c.data_source = '${DATA_SOURCE_TAG}' AND NOT r.in_warranty`],
    ["every cleared DTC links to a repair order", `SELECT count(*)::int AS n FROM fact_dtc_event e WHERE e.status = 'cleared' AND NOT EXISTS (SELECT 1 FROM fact_repair_orders o WHERE o.ro_id = e.resolved_by_ro_id)`],
  ];
  console.log("▶ consistency checks");
  let ok = true;
  for (const [label, sql] of checks) {
    const { rows } = await client.query(sql);
    const pass = rows[0].n === 0;
    ok &&= pass;
    console.log(`  ${pass ? "✔" : "✘"} ${label}${pass ? "" : ` — ${rows[0].n} violations`}`);
  }
  return ok;
}

async function seed(client, opts) {
  const shared = await loadShared(client);
  const data = generate(shared, opts);
  printSummary(data);
  if (opts.dryRun) {
    console.log("✔ dry run — nothing written");
    return;
  }
  await assertMigrated(client);
  const before = await sharedFingerprint(client);

  await client.query("BEGIN");
  try {
    console.log("▶ clearing previous telematics data (owned tables + tagged rows)");
    await client.query(`TRUNCATE ${OWNED_TABLES.map(quoteIdent).join(", ")} RESTART IDENTITY`);
    for (const table of TAGGED_TABLES) await client.query(`DELETE FROM ${quoteIdent(table)} WHERE data_source = $1`, [DATA_SOURCE_TAG]);

    console.log("▶ writing new columns on shared dimensions");
    for (const m of data.models) {
      const cols = ADDED_COLUMNS.dim_v_model;
      await client.query(
        `UPDATE dim_v_model SET ${cols.map((c, i) => `${quoteIdent(c)} = $${i + 1}`).join(", ")} WHERE model_id = $${cols.length + 1}`,
        [...cols.map((c) => m[c]), m.model_id]
      );
    }
    await client.query(
      `UPDATE dim_vehicle SET model_year = EXTRACT(YEAR FROM production_date)::int, is_connected = false,
         telematics_unit_id = NULL, telematics_source = NULL, connected_since = NULL, warranty_end_date = NULL,
         warranty_km_limit = NULL, home_lat = NULL, home_lon = NULL, primary_driver_id = NULL`
    );
    await client.query(
      `CREATE TEMP TABLE tmp_connected (vehicle_id text PRIMARY KEY, telematics_unit_id text, telematics_source text,
         connected_since date, warranty_end_date date, warranty_km_limit integer, home_lat double precision,
         home_lon double precision, primary_driver_id text) ON COMMIT DROP`
    );
    await insertRows(client, "tmp_connected", data.connected);
    await client.query(
      `UPDATE dim_vehicle v SET is_connected = true, telematics_unit_id = t.telematics_unit_id, telematics_source = t.telematics_source,
         connected_since = t.connected_since, warranty_end_date = t.warranty_end_date, warranty_km_limit = t.warranty_km_limit,
         home_lat = t.home_lat, home_lon = t.home_lon, primary_driver_id = t.primary_driver_id
       FROM tmp_connected t WHERE v.vehicle_id = t.vehicle_id`
    );

    console.log("▶ inserting");
    for (const [table, rows] of Object.entries(data.tables)) await insertRows(client, table, rows);

    const checksOk = await runChecks(client);
    const after = await sharedFingerprint(client);
    const sharedOk = compareFingerprints(before, after);
    if (!checksOk || !sharedOk) throw new Error("Post-seed checks failed — rolling back, nothing was written.");
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  }
  for (const table of OWNED_TABLES) await client.query(`ANALYZE ${quoteIdent(table)}`);
  await refreshRollups(client);
  const { rows } = await client.query("SELECT pg_size_pretty(pg_database_size(current_database())) AS size");
  console.log(`✔ seed committed — database size now ${rows[0].size}`);
}

// ---------------------------------------------------------------------------
// Reset
// ---------------------------------------------------------------------------
async function reset(client, opts) {
  if (!opts.confirm) {
    console.error("reset drops all telematics-owned tables, tagged rows and added columns. Re-run with --confirm.");
    process.exit(1);
  }
  await client.query("BEGIN");
  try {
    for (const view of OWNED_VIEWS) await client.query(`DROP VIEW IF EXISTS ${quoteIdent(view)}`);
    for (const view of OWNED_MATVIEWS) await client.query(`DROP MATERIALIZED VIEW IF EXISTS ${quoteIdent(view)}`);
    for (const table of OWNED_TABLES) {
      const marker = NEW_SHAPE_MARKER[table];
      if (marker && !(await columnExists(client, table, marker))) {
        console.log(`  skip ${table} (not the redesigned table)`);
        continue;
      }
      await client.query(`DROP TABLE IF EXISTS ${quoteIdent(table)}`);
      console.log(`  dropped ${table}`);
    }
    for (const table of TAGGED_TABLES) {
      if (await columnExists(client, table, "data_source")) {
        const { rowCount } = await client.query(`DELETE FROM ${quoteIdent(table)} WHERE data_source = $1`, [DATA_SOURCE_TAG]);
        console.log(`  deleted ${rowCount} tagged rows from ${table}`);
      }
    }
    for (const [table, cols] of Object.entries(ADDED_COLUMNS)) {
      await client.query(`ALTER TABLE ${quoteIdent(table)} ${cols.map((c) => `DROP COLUMN IF EXISTS ${quoteIdent(c)}`).join(", ")}`);
      console.log(`  dropped added columns on ${table}`);
    }
    if (opts.restoreLegacy) {
      for (const table of Object.keys(NEW_SHAPE_MARKER)) {
        const legacy = `${table}_legacy`;
        if (!(await tableExists(client, legacy)) || (await tableExists(client, table))) continue;
        await client.query(`ALTER TABLE ${quoteIdent(legacy)} RENAME TO ${quoteIdent(table)}`);
        const { rows } = await client.query(`SELECT conname FROM pg_constraint WHERE conrelid = $1::regclass AND conname LIKE '%\\_legacy'`, [`public.${table}`]);
        for (const { conname } of rows) {
          await client.query(`ALTER TABLE ${quoteIdent(table)} RENAME CONSTRAINT ${quoteIdent(conname)} TO ${quoteIdent(conname.replace(/_legacy$/, ""))}`);
        }
        console.log(`  restored ${legacy} → ${table}`);
      }
    }
    await client.query("COMMIT");
    console.log("✔ reset complete");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  }
}

// ---------------------------------------------------------------------------
async function main() {
  const opts = parseCli();
  const client = await connect();
  try {
    if (opts.command === "migrate" || opts.command === "all") {
      if (opts.dryRun) console.log("▶ migrate skipped (dry run)");
      else await migrate(client);
    }
    if (opts.command === "seed" || opts.command === "all") await seed(client, opts);
    if (opts.command === "reset") await reset(client, opts);
  } finally {
    await client.end();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(`✘ ${err.message}`);
    process.exit(1);
  });
}
