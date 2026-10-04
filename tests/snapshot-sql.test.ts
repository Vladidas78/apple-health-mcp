import { describe, it, expect } from "vitest";
import { makeTestDb } from "./helpers/db";
import { normalize } from "@/lib/ingest";
import { persist } from "@/lib/persist";
import { latestSnapshot } from "@/lib/tools/latest-snapshot";
import { sql } from "drizzle-orm";
import { healthSql, assertReadOnly, wrapReadOnly } from "@/lib/tools/health-sql";

async function seeded() {
  const db = await makeTestDb();
  await persist(db, normalize({
    data: {
      metrics: [{ name: "step_count", units: "count", data: [
        { date: "2026-06-01 08:00:00 +0000", qty: 100 },
        { date: "2026-06-02 08:00:00 +0000", qty: 250 },
      ] }],
      workouts: [], ecg: [], stateOfMind: [], symptoms: [], medications: [], cycleTracking: [], heartRateNotifications: [],
    },
  }));
  return db;
}

describe("latest_snapshot", () => {
  it("returns the most recent value per metric", async () => {
    const snap = await latestSnapshot(await seeded());
    const step = snap.find((s: any) => s.metricName === "step_count");
    expect(step.value).toBe("250");
  });
});

describe("health_sql guard", () => {
  it("allows a single SELECT", () => {
    expect(() => assertReadOnly("SELECT count(*) FROM metric_samples")).not.toThrow();
  });
  it("allows a WITH/CTE select", () => {
    expect(() => assertReadOnly("WITH x AS (SELECT 1) SELECT * FROM x")).not.toThrow();
  });
  it("rejects INSERT", () => {
    expect(() => assertReadOnly("INSERT INTO metric_samples DEFAULT VALUES")).toThrow();
  });
  it("rejects multi-statement", () => {
    expect(() => assertReadOnly("SELECT 1; DROP TABLE workouts")).toThrow();
  });
  it("rejects a data-modifying CTE hidden behind WITH", () => {
    expect(() => assertReadOnly("WITH x AS (DELETE FROM metric_samples RETURNING 1) SELECT 1")).toThrow(/DELETE/);
    expect(() => assertReadOnly("WITH x AS (UPDATE workouts SET name = 'y' RETURNING 1) SELECT 1")).toThrow(/UPDATE/);
    expect(() => assertReadOnly("WITH x AS (INSERT INTO workouts (id, raw) VALUES ('z', '{}') RETURNING 1) SELECT 1")).toThrow(/INSERT/);
    expect(() => assertReadOnly("SELECT 1 FROM metric_samples; TRUNCATE workouts")).toThrow();
    for (const kw of ["truncate", "drop", "alter"]) {
      expect(() => assertReadOnly(`SELECT 1 WHERE 'a' = '${kw} x'`)).toThrow();
    }
  });
  it("keeps column names that merely contain a keyword", () => {
    expect(() => assertReadOnly("SELECT updated_at, deleted FROM hevy_workouts")).not.toThrow();
  });
  it("runs a select and returns rows", async () => {
    const rows = await healthSql(await seeded(), "SELECT count(*)::int AS n FROM metric_samples");
    expect(rows[0].n).toBe(2);
  });
  it("runs ORDER BY / LIMIT / WITH queries inside the subquery wrapper", async () => {
    const db = await seeded();
    const rows = await healthSql(db, "SELECT qty FROM metric_samples ORDER BY date DESC LIMIT 1;");
    expect(rows).toEqual([{ qty: "250" }]);
    const cte = await healthSql(db, "WITH x AS (SELECT qty FROM metric_samples) SELECT count(*)::int AS n FROM x");
    expect(cte[0].n).toBe(2);
  });
  it("Postgres itself rejects a data-modifying CTE inside the wrapper (second layer)", async () => {
    const db = await seeded();
    const wrapped = wrapReadOnly("WITH x AS (DELETE FROM metric_samples RETURNING 1) SELECT * FROM x");
    // Drizzle wraps the driver error; the Postgres message lives in `cause`.
    await expect(db.execute(sql.raw(wrapped))).rejects.toSatisfy((e: any) =>
      /data-modifying statement must be at the top level/i.test(e?.cause?.message ?? e?.message ?? ""));
    const rows = await healthSql(db, "SELECT count(*)::int AS n FROM metric_samples");
    expect(rows[0].n).toBe(2);
  });
});
