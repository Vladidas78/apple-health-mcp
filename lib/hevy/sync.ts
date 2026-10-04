import { eq, sql } from "drizzle-orm";
import { hevyWorkouts, hevySets, hevyExerciseTemplates, hevyMeasurements } from "@/db/schema";
import { HevyClient, type FetchLike, type HevyWorkout, type HevyBodyMeasurement } from "@/lib/hevy/client";

// Stateless, idempotent HEVY → Postgres mirror. Pure function of (db, fetch, opts)
// so it runs unchanged against neon-http in prod and PGlite in tests.
//
// Mode is derived from the table, not from stored state:
// - hevy_workouts empty  → BACKFILL: page through /workouts, keep start_time >= backfillFrom
// - otherwise            → INCREMENTAL: /workouts/events?since=max(updated_at) - overlap
// The overlap re-delivers already-known workouts; the upsert makes that harmless.
// "deleted" events remove the workout row (sets cascade).

type Db = {
  insert: (...a: any[]) => any;
  delete: (...a: any[]) => any;
  select: (...a: any[]) => any;
  execute: (...a: any[]) => any;
};

export type SyncOpts = {
  apiKey: string;
  now?: Date;
  backfillFrom?: Date; // default 2026-01-01T00:00:00Z
  overlapMs?: number; // default 1 day
  baseUrl?: string;
  maxPages?: number; // safety cap per endpoint, default 500
  syncTemplates?: boolean; // default true
  syncMeasurements?: boolean; // default true
};

export type SyncSummary = {
  mode: "backfill" | "incremental";
  since: string | null;
  workoutsSeen: number;
  workoutsUpserted: number;
  workoutsDeleted: number;
  templatesUpserted: number;
  measurementsUpserted: number;
  warnings: string[];
};

export const DEFAULT_BACKFILL_FROM = new Date("2026-01-01T00:00:00Z");
const DAY_MS = 24 * 60 * 60 * 1000;

function num(v: unknown): string | null {
  return typeof v === "number" && Number.isFinite(v) ? String(v) : null;
}
function int(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? Math.trunc(v) : null;
}
function ts(v: unknown): Date | null {
  if (typeof v !== "string") return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Upsert one workout and replace all its sets. Not transactional (neon-http has
// no interactive transactions); the 1-day overlap of the next run heals a partial
// write of a recently updated workout.
async function upsertWorkout(db: Db, w: HevyWorkout, syncedAt: Date): Promise<void> {
  const row = {
    id: w.id,
    title: w.title ?? null,
    startTime: ts(w.start_time),
    endTime: ts(w.end_time),
    updatedAt: ts(w.updated_at) ?? ts(w.created_at),
    raw: w as Record<string, unknown>,
    syncedAt,
  };
  await db.insert(hevyWorkouts).values(row).onConflictDoUpdate({ target: hevyWorkouts.id, set: row });
  await db.delete(hevySets).where(eq(hevySets.workoutId, w.id));

  const sets: (typeof hevySets.$inferInsert)[] = [];
  (w.exercises ?? []).forEach((ex, exI) => {
    const exerciseIndex = int(ex.index) ?? exI;
    (ex.sets ?? []).forEach((s, sI) => {
      sets.push({
        workoutId: w.id,
        exerciseIndex,
        setIndex: int(s.index) ?? sI,
        templateId: typeof ex.exercise_template_id === "string" ? ex.exercise_template_id : null,
        exerciseTitle: typeof ex.title === "string" ? ex.title : null,
        setType: typeof s.type === "string" ? s.type : null,
        weightKg: num(s.weight_kg),
        reps: int(s.reps),
        rpe: num(s.rpe),
      });
    });
  });
  if (sets.length) await db.insert(hevySets).values(sets);
}

async function maxUpdatedAt(db: Db): Promise<Date | null> {
  const r = await db.execute(sql`SELECT max(updated_at) AS m FROM hevy_workouts`);
  const rows = (r.rows ?? r) as { m: string | Date | null }[];
  const m = rows[0]?.m;
  return m ? new Date(m) : null;
}

// Measurement date → calendar day key. HEVY may send "YYYY-MM-DD" or an ISO datetime.
function dayKey(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(v);
  return m ? m[1] : null;
}
function pick(m: HevyBodyMeasurement, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = num(m[k]);
    if (v !== null) return v;
  }
  return null;
}

export async function syncHevy(db: Db, fetchImpl: FetchLike, opts: SyncOpts): Promise<SyncSummary> {
  const now = opts.now ?? new Date();
  const backfillFrom = opts.backfillFrom ?? DEFAULT_BACKFILL_FROM;
  const overlapMs = opts.overlapMs ?? DAY_MS;
  const maxPages = opts.maxPages ?? 500;
  const client = new HevyClient(opts.apiKey, fetchImpl, opts.baseUrl);
  const summary: SyncSummary = {
    mode: "incremental", since: null, workoutsSeen: 0, workoutsUpserted: 0, workoutsDeleted: 0,
    templatesUpserted: 0, measurementsUpserted: 0, warnings: [],
  };

  const cursor = await maxUpdatedAt(db);
  if (!cursor) {
    summary.mode = "backfill";
    summary.since = backfillFrom.toISOString();
    for (let page = 1; page <= maxPages; page++) {
      const res = await client.listWorkouts(page);
      for (const w of res.workouts ?? []) {
        summary.workoutsSeen++;
        const start = ts(w.start_time);
        if (!start || start < backfillFrom) continue;
        await upsertWorkout(db, w, now);
        summary.workoutsUpserted++;
      }
      if (page >= (res.page_count ?? 0)) break;
    }
  } else {
    const since = new Date(cursor.getTime() - overlapMs).toISOString();
    summary.since = since;
    for (let page = 1; page <= maxPages; page++) {
      const res = await client.listWorkoutEvents(since, page);
      for (const ev of res.events ?? []) {
        summary.workoutsSeen++;
        if (ev.type === "deleted") {
          await db.delete(hevyWorkouts).where(eq(hevyWorkouts.id, ev.id));
          summary.workoutsDeleted++;
        } else if (ev.type === "updated" && ev.workout?.id) {
          await upsertWorkout(db, ev.workout, now);
          summary.workoutsUpserted++;
        } else {
          summary.warnings.push(`unknown event ${JSON.stringify(ev).slice(0, 80)}`);
        }
      }
      if (page >= (res.page_count ?? 0)) break;
    }
  }

  if (opts.syncTemplates !== false) {
    for (let page = 1; page <= maxPages; page++) {
      const res = await client.listExerciseTemplates(page);
      for (const t of res.exercise_templates ?? []) {
        if (!t.id) continue;
        const row = {
          id: t.id,
          title: t.title ?? null,
          primaryMuscleGroup: t.primary_muscle_group ?? null,
          raw: t as Record<string, unknown>,
          syncedAt: now,
        };
        await db.insert(hevyExerciseTemplates).values(row).onConflictDoUpdate({ target: hevyExerciseTemplates.id, set: row });
        summary.templatesUpserted++;
      }
      if (page >= (res.page_count ?? 0)) break;
    }
  }

  if (opts.syncMeasurements !== false) {
    try {
      for (let page = 1; page <= maxPages; page++) {
        const res = await client.listBodyMeasurements(page);
        const list = res.body_measurements ?? res.measurements ?? [];
        for (const m of list) {
          const date = dayKey(m.date);
          if (!date) continue;
          // [ANNAHME] circumference field names; raw keeps whatever HEVY sends.
          const row = {
            date,
            weightKg: pick(m, "weight_kg"),
            waistCm: pick(m, "waist_cm", "waist"),
            chestCm: pick(m, "chest_cm", "chest"),
            bicepCm: pick(m, "bicep_cm", "bicep", "biceps_cm", "biceps"),
            raw: m as Record<string, unknown>,
            syncedAt: now,
          };
          await db.insert(hevyMeasurements).values(row).onConflictDoUpdate({ target: hevyMeasurements.date, set: row });
          summary.measurementsUpserted++;
        }
        if (page >= (res.page_count ?? 0)) break;
      }
    } catch (e) {
      // The measurements endpoint is unverified; a 404 there must not fail the
      // workout sync. Surface it in the summary instead.
      summary.warnings.push(`measurements: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return summary;
}
