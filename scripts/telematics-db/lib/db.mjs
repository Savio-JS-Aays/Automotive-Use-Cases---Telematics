import pg from "pg";

// Postgres caps a statement at 65,535 bind parameters.
const MAX_PARAMS = 60000;

// Keep DATE columns as 'YYYY-MM-DD' strings (no timezone shifting) and numerics as numbers.
pg.types.setTypeParser(1082, (v) => v);
pg.types.setTypeParser(1700, (v) => (v === null ? null : Number(v)));
pg.types.setTypeParser(20, (v) => (v === null ? null : Number(v)));

export async function connect() {
  try {
    process.loadEnvFile(new URL("../../../.env", import.meta.url));
  } catch {
    // .env is optional when DATABASE_URI is already exported in the shell
  }
  const connectionString = process.env.DATABASE_URI;
  if (!connectionString) {
    throw new Error("DATABASE_URI is not set. Add it to my-react-app/.env (see scripts/telematics-db/README.md).");
  }
  const client = new pg.Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
    application_name: "telematics-db-setup",
  });
  await client.connect();
  await client.query("SET statement_timeout = 0");
  return client;
}

export const quoteIdent = (name) => `"${name.replace(/"/g, '""')}"`;

function toParam(value) {
  if (value === undefined) return null;
  if (value !== null && typeof value === "object" && !(value instanceof Date)) return JSON.stringify(value);
  if (typeof value === "number" && !Number.isFinite(value)) return null;
  return value;
}

// Batched multi-row INSERT. Column list comes from `columns` or the first row's keys.
export async function insertRows(client, table, rows, { columns } = {}) {
  if (!rows.length) {
    console.log(`  ${table.padEnd(28)} ${"0".padStart(9)} rows`);
    return 0;
  }
  const cols = columns ?? Object.keys(rows[0]);
  const colSql = cols.map(quoteIdent).join(", ");
  const batchSize = Math.max(1, Math.floor(MAX_PARAMS / cols.length));
  const started = Date.now();

  for (let offset = 0; offset < rows.length; offset += batchSize) {
    const batch = rows.slice(offset, offset + batchSize);
    const params = [];
    const tuples = batch.map((row) => {
      const placeholders = cols.map((col) => {
        params.push(toParam(row[col]));
        return `$${params.length}`;
      });
      return `(${placeholders.join(", ")})`;
    });
    await client.query(`INSERT INTO ${quoteIdent(table)} (${colSql}) VALUES ${tuples.join(", ")}`, params);
  }

  const secs = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`  ${table.padEnd(28)} ${rows.length.toLocaleString().padStart(9)} rows  (${secs}s)`);
  return rows.length;
}

export async function tableExists(client, table) {
  const { rows } = await client.query("SELECT to_regclass($1) AS oid", [`public.${table}`]);
  return rows[0].oid !== null;
}

export async function columnExists(client, table, column) {
  const { rows } = await client.query(
    `SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2`,
    [table, column]
  );
  return rows.length > 0;
}
