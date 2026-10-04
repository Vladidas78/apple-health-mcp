import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { makeTestDb, countRows } from "./helpers/db";
import { syncHevy } from "@/lib/hevy/sync";
import { HevyClient, type HevyWorkout, type HevyWorkoutEvent } from "@/lib/hevy/client";
import { hevyWorkouts, hevySets, hevyExerciseTemplates, hevyMeasurements } from "@/db/schema";
import { handleHevySync } from "@/app/api/hevy/sync/route";

// In-memory stand-in for the HEVY API, served through a fetch mock. Pages are
// cut to the requested pageSize so pagination is exercised for real.
type Fake = {
  workouts: HevyWorkout[];
  events: HevyWorkoutEvent[];
  templates: { id: string; title: string; primary_muscle_group: string | null }[];
  measurements: Record<string, unknown>[];
  calls: string[];
  measurementsStatus?: number;
};

function workout(id: string, start: string, updated: string, sets: number[] = [100, 100]): HevyWorkout {
  return {
    id, title: `W ${id}`, start_time: start, end_time: start, updated_at: updated,
    exercises: [{ index: 0, title: "Squat", exercise_template_id: "t-squat",
      sets: sets.map((kg, i) => ({ index: i, type: "normal", weight_kg: kg, reps: 5, rpe: 8 })) }],
  };
}

function makeFetch(f: Fake) {
  return async (input: string): Promise<Response> => {
    const url = new URL(input);
    f.calls.push(url.pathname + url.search);
    const page = Number(url.searchParams.get("page") ?? "1");
    const size = Number(url.searchParams.get("pageSize") ?? "10");
    const paged = <T,>(key: string, all: T[]) => {
      const page_count = Math.max(1, Math.ceil(all.length / size));
      return Response.json({ page, page_count, [key]: all.slice((page - 1) * size, page * size) });
    };
    switch (url.pathname) {
      case "/v1/workouts": return paged("workouts", f.workouts);
      case "/v1/workouts/events": return paged("events", f.events);
      case "/v1/exercise_templates": return paged("exercise_templates", f.templates);
      case "/v1/body_measurements":
        if (f.measurementsStatus) return new Response("nope", { status: f.measurementsStatus });
        return paged("body_measurements", f.measurements);
      default: return new Response("not found", { status: 404 });
    }
  };
}

let fake: Fake;
beforeEach(() => {
  fake = {
    workouts: [
      workout("a", "2026-02-01T06:00:00Z", "2026-02-01T07:00:00Z"),
      workout("b", "2026-03-01T06:00:00Z", "2026-03-01T07:00:00Z", [80, 90, 100]),
      workout("old", "2025-12-30T06:00:00Z", "2025-12-30T07:00:00Z"),
    ],
    events: [],
    templates: [{ id: "t-squat", title: "Squat", primary_muscle_group: "quadriceps" }],
    measurements: [{ id: "m1", date: "2026-03-01", weight_kg: 92.6, waist_cm: 90 }],
    calls: [],
  };
  process.env.MCP_SECRET = "s3cr3t";
  delete process.env.CRON_SECRET;
  process.env.HEVY_API_KEY = "k";
});

const opts = { apiKey: "k" };

describe("syncHevy", () => {
  it("backfills from 2026-01-01 when the table is empty, with sets, templates and measurements", async () => {
    const db = await makeTestDb();
    const s = await syncHevy(db, makeFetch(fake), { ...opts, maxPages: 10 });
    expect(s.mode).toBe("backfill");
    expect(s.workoutsSeen).toBe(3);
    expect(s.workoutsUpserted).toBe(2); // "old" is before the backfill start
    expect(await countRows(db, "hevy_workouts")).toBe(2);
    expect(await countRows(db, "hevy_sets")).toBe(5);
    expect(await countRows(db, "hevy_exercise_templates")).toBe(1);
    expect(await countRows(db, "hevy_measurements")).toBe(1);
    const m = (await db.select().from(hevyMeasurements))[0];
    expect(m.weightKg).toBe("92.6");
    expect(m.waistCm).toBe("90");
    expect(fake.calls[0]).toContain("/v1/workouts?page=1&pageSize=10");
    expect(fake.calls.some((c) => c.includes("/workouts/events"))).toBe(false);
  });

  it("paginates the backfill", async () => {
    const db = await makeTestDb();
    fake.workouts = Array.from({ length: 23 }, (_, i) => workout(`p${i}`, "2026-02-01T06:00:00Z", "2026-02-01T07:00:00Z", [1]));
    const s = await syncHevy(db, makeFetch(fake), { ...opts, syncTemplates: false, syncMeasurements: false });
    expect(s.workoutsUpserted).toBe(23);
    expect(fake.calls.filter((c) => c.startsWith("/v1/workouts?")).length).toBe(3);
  });

  it("second run uses the events feed with a 1-day overlap and adds 0 rows", async () => {
    const db = await makeTestDb();
    await syncHevy(db, makeFetch(fake), opts);
    fake.calls = [];
    const s = await syncHevy(db, makeFetch(fake), opts);
    expect(s.mode).toBe("incremental");
    expect(s.since).toBe("2026-02-28T07:00:00.000Z"); // max(updated_at)=2026-03-01T07:00Z minus 1 day
    expect(s.workoutsUpserted).toBe(0);
    expect(await countRows(db, "hevy_workouts")).toBe(2);
    expect(await countRows(db, "hevy_sets")).toBe(5);
    expect(fake.calls[0]).toBe("/v1/workouts/events?page=1&pageSize=10&since=2026-02-28T07%3A00%3A00.000Z");
  });

  it("an updated event replaces the workout and its sets without duplicates", async () => {
    const db = await makeTestDb();
    await syncHevy(db, makeFetch(fake), opts);
    fake.events = [{ type: "updated", workout: workout("b", "2026-03-01T06:00:00Z", "2026-03-02T07:00:00Z", [110]) }];
    const s = await syncHevy(db, makeFetch(fake), opts);
    expect(s.workoutsUpserted).toBe(1);
    expect(await countRows(db, "hevy_workouts")).toBe(2);
    const sets = await db.select().from(hevySets).where(eq(hevySets.workoutId, "b"));
    expect(sets).toHaveLength(1);
    expect(sets[0].weightKg).toBe("110");
    const w = (await db.select().from(hevyWorkouts).where(eq(hevyWorkouts.id, "b")))[0];
    expect(w.updatedAt?.toISOString()).toBe("2026-03-02T07:00:00.000Z");
    // re-delivering the same event (overlap) changes nothing
    const again = await syncHevy(db, makeFetch(fake), opts);
    expect(again.workoutsUpserted).toBe(1);
    expect(await countRows(db, "hevy_sets")).toBe(3);
  });

  it("a deleted event removes the workout and its sets; a new workout arrives via the feed", async () => {
    const db = await makeTestDb();
    await syncHevy(db, makeFetch(fake), opts);
    fake.events = [
      { type: "deleted", id: "a", deleted_at: "2026-03-05T00:00:00Z" },
      { type: "updated", workout: workout("c", "2026-03-04T06:00:00Z", "2026-03-04T07:00:00Z", [50]) },
    ];
    const s = await syncHevy(db, makeFetch(fake), opts);
    expect(s.workoutsDeleted).toBe(1);
    expect(s.workoutsUpserted).toBe(1);
    const ids = (await db.select().from(hevyWorkouts)).map((w) => w.id).sort();
    expect(ids).toEqual(["b", "c"]);
    expect(await countRows(db, "hevy_sets")).toBe(4);
  });

  it("re-upserts templates and measurements idempotently", async () => {
    const db = await makeTestDb();
    await syncHevy(db, makeFetch(fake), opts);
    fake.templates[0].primary_muscle_group = "legs";
    await syncHevy(db, makeFetch(fake), opts);
    expect(await countRows(db, "hevy_exercise_templates")).toBe(1);
    expect((await db.select().from(hevyExerciseTemplates))[0].primaryMuscleGroup).toBe("legs");
    expect(await countRows(db, "hevy_measurements")).toBe(1);
  });

  it("a failing measurements endpoint is a warning, not a failed sync", async () => {
    const db = await makeTestDb();
    fake.measurementsStatus = 404;
    const s = await syncHevy(db, makeFetch(fake), opts);
    expect(s.workoutsUpserted).toBe(2);
    expect(s.warnings.join()).toMatch(/measurements.*404/);
  });

  it("throws on a non-2xx workouts response", async () => {
    const db = await makeTestDb();
    const fetch401 = async () => new Response("unauthorized", { status: 401 });
    await expect(syncHevy(db, fetch401, opts)).rejects.toThrow(/401/);
  });
});

describe("HevyClient", () => {
  it("sends the api-key header", async () => {
    let headers: Record<string, string> = {};
    const c = new HevyClient("k", async (_u, init) => { headers = init?.headers as Record<string, string>; return Response.json({ page: 1, page_count: 1, workouts: [] }); });
    await c.listWorkouts(1);
    expect(headers["api-key"]).toBe("k");
  });
});

describe("GET /api/hevy/sync", () => {
  const get = (auth?: string) => new Request("https://x/api/hevy/sync", { headers: auth ? { authorization: auth } : {} });

  it("401s without a bearer and does not touch the db", async () => {
    let resolved = false;
    const res = await handleHevySync(get(), () => { resolved = true; return null as never; }, makeFetch(fake));
    expect(res.status).toBe(401);
    expect(resolved).toBe(false);
  });
  it("accepts CRON_SECRET and MCP_SECRET", async () => {
    process.env.CRON_SECRET = "cron";
    const db = await makeTestDb();
    expect((await handleHevySync(get("Bearer cron"), () => db, makeFetch(fake))).status).toBe(200);
    expect((await handleHevySync(get("Bearer s3cr3t"), () => db, makeFetch(fake))).status).toBe(200);
    expect((await handleHevySync(get("Bearer nope"), () => db, makeFetch(fake))).status).toBe(401);
  });
  it("503s when HEVY_API_KEY is unset", async () => {
    delete process.env.HEVY_API_KEY;
    const res = await handleHevySync(get("Bearer s3cr3t"), () => null as never, makeFetch(fake));
    expect(res.status).toBe(503);
  });
  it("returns the summary and 502s on HEVY errors", async () => {
    const db = await makeTestDb();
    const ok = await handleHevySync(get("Bearer s3cr3t"), () => db, makeFetch(fake));
    expect(await ok.json()).toMatchObject({ mode: "backfill", workoutsUpserted: 2 });
    const bad = await handleHevySync(get("Bearer s3cr3t"), () => db, async () => new Response("x", { status: 500 }));
    expect(bad.status).toBe(502);
  });
});
