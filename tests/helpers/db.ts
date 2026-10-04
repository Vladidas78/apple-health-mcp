import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { sql } from "drizzle-orm";
import * as schema from "@/db/schema";

// Spin up an isolated in-memory Postgres, apply ALL committed Drizzle migrations
// (0000 health tables, 0001 hevy + coach tables, 0002 xp ledger + lift baselines),
// and return a typed db. Each test gets its own instance → no cross-test leakage.
export async function makeTestDb() {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: "./drizzle" });
  return db;
}

export type TestDb = Awaited<ReturnType<typeof makeTestDb>>;

// Names of all user tables in the public schema (sorted), for schema assertions.
export async function tableNames(db: TestDb): Promise<string[]> {
  const r = await db.execute(sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      AND table_name <> '__drizzle_migrations'
    ORDER BY table_name`);
  return (r.rows as { table_name: string }[]).map((x) => x.table_name);
}

// Row count of a table by its SQL name.
export async function countRows(db: TestDb, table: string): Promise<number> {
  const r = await db.execute(sql.raw(`SELECT count(*)::int AS n FROM "${table}"`));
  return (r.rows as { n: number }[])[0].n;
}

// All XP events (oldest first), for ledger assertions.
export async function xpRows(db: TestDb): Promise<{ kind: string; source: string; source_id: string; xp: number; week_start: string }[]> {
  const r = await db.execute(sql`SELECT kind, source, source_id, xp, week_start::text AS week_start FROM coach_xp_events ORDER BY id`);
  return r.rows as { kind: string; source: string; source_id: string; xp: number; week_start: string }[];
}
