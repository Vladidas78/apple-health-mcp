import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { makeTestDb, tableNames, countRows } from "./helpers/db";

describe("schema", () => {
  it("exports the health tables", () => {
    expect(schema.metricSamples).toBeDefined();
    expect(schema.workouts).toBeDefined();
    expect(schema.healthEvents).toBeDefined();
  });

  it("exports the hevy and coach tables", () => {
    for (const t of [
      schema.hevyWorkouts, schema.hevySets, schema.hevyExerciseTemplates, schema.hevyMeasurements,
      schema.coachGoals, schema.coachPlans, schema.coachAssessments, schema.coachWeeks,
      schema.coachXpEvents, schema.coachLiftBaselines,
    ]) expect(t).toBeDefined();
  });

  it("migrations create all thirteen tables in PGlite", async () => {
    const db = await makeTestDb();
    expect(await tableNames(db)).toEqual([
      "coach_assessments", "coach_goals", "coach_lift_baselines", "coach_plans", "coach_weeks", "coach_xp_events",
      "health_events", "hevy_exercise_templates", "hevy_measurements", "hevy_sets", "hevy_workouts",
      "metric_samples", "workouts",
    ]);
  });

  it("hevy_sets is unique per (workout, exercise, set) and cascades on workout delete", async () => {
    const db = await makeTestDb();
    await db.insert(schema.hevyWorkouts).values({ id: "w1", raw: {} });
    const set = { workoutId: "w1", exerciseIndex: 0, setIndex: 0, reps: 5, weightKg: "100" };
    await db.insert(schema.hevySets).values(set);
    await expect(db.insert(schema.hevySets).values(set)).rejects.toThrow();
    await expect(db.insert(schema.hevySets).values({ ...set, workoutId: "missing" })).rejects.toThrow();
    await db.delete(schema.hevyWorkouts).where(eq(schema.hevyWorkouts.id, "w1"));
    expect(await countRows(db, "hevy_sets")).toBe(0);
  });

  it("coach tables upsert on their natural keys (no duplicate on retry)", async () => {
    const db = await makeTestDb();
    const row = { weekStart: "2026-10-05", scoreVersion: 1, score: "70", ampel: "gelb" };
    for (let i = 0; i < 2; i++) {
      await db.insert(schema.coachAssessments).values(row)
        .onConflictDoUpdate({ target: schema.coachAssessments.weekStart, set: { score: "75" } });
    }
    const rows = await db.select().from(schema.coachAssessments);
    expect(rows).toHaveLength(1);
    expect(rows[0].score).toBe("75");

    await expect(db.insert(schema.coachPlans).values({ weekStart: "2026-10-05" } as never)).rejects.toThrow(); // source NOT NULL
    await db.insert(schema.coachGoals).values({ key: "weight-2026-12-27", kind: "weight", target: "88" });
    expect((await db.select().from(schema.coachGoals))[0].status).toBe("active");
    await db.insert(schema.hevyMeasurements).values({ date: "2026-10-01", weightKg: "92.6", raw: {} })
      .onConflictDoUpdate({ target: schema.hevyMeasurements.date, set: { weightKg: "92.4" } });
    await db.insert(schema.hevyMeasurements).values({ date: "2026-10-01", weightKg: "92.6", raw: {} })
      .onConflictDoUpdate({ target: schema.hevyMeasurements.date, set: { weightKg: "92.4" } });
    expect(await countRows(db, "hevy_measurements")).toBe(1);
  });

  it("coach_xp_events is append-only per (source, source_id, kind); baselines are keyed by lift", async () => {
    const db = await makeTestDb();
    const ev = { kind: "session", source: "hevy_workout", sourceId: "w1", xp: 100, weekStart: "2026-10-05" };
    for (let i = 0; i < 3; i++) await db.insert(schema.coachXpEvents).values(ev).onConflictDoNothing();
    await db.insert(schema.coachXpEvents).values({ ...ev, kind: "pr", source: "lift", sourceId: "bench:w1", xp: 80 }).onConflictDoNothing();
    expect(await countRows(db, "coach_xp_events")).toBe(2);
    await db.insert(schema.coachLiftBaselines).values({ liftKey: "bench", value: "96", day: "2026-10-06", mode: "e1rm" });
    await db.insert(schema.coachLiftBaselines).values({ liftKey: "bench", value: "80", day: "2026-10-07", mode: "e1rm" }).onConflictDoNothing();
    const b = await db.select().from(schema.coachLiftBaselines);
    expect(b).toHaveLength(1);
    expect(b[0].value).toBe("96");
  });
});
