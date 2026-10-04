import { hevyExerciseTemplates, hevySets, hevyWorkouts, metricSamples, workouts } from "@/db/schema";
import type { TestDb } from "./db";

// Shared fixture writers for the dashboard and coach tests. No real people:
// every id and value is invented.

export async function sample(db: TestDb, metric: string, iso: string, v: Partial<{ qty: number; avg: number; extra: object }>) {
  await db.insert(metricSamples).values({
    metricName: metric, date: new Date(iso), source: "watch",
    qty: v.qty !== undefined ? String(v.qty) : null, avg: v.avg !== undefined ? String(v.avg) : null, extra: v.extra ?? null,
  });
}

export type FixtureExercise = { template: string; title?: string; sets: { kg?: number | null; reps: number; type?: string }[] };

export async function hevyWorkout(db: TestDb, id: string, title: string, startIso: string, minutes: number, exercises: FixtureExercise[], raw: Record<string, unknown> = {}) {
  const start = new Date(startIso);
  await db.insert(hevyWorkouts).values({ id, title, startTime: start, endTime: new Date(start.getTime() + minutes * 60_000), updatedAt: start, raw, syncedAt: new Date("2026-10-04T02:00:00Z") });
  const rows: (typeof hevySets.$inferInsert)[] = [];
  exercises.forEach((ex, ei) => ex.sets.forEach((s, si) => rows.push({
    workoutId: id, exerciseIndex: ei, setIndex: si, templateId: ex.template, exerciseTitle: ex.title ?? ex.template,
    setType: s.type ?? "normal", weightKg: s.kg === undefined || s.kg === null ? null : String(s.kg), reps: s.reps,
  })));
  if (rows.length) await db.insert(hevySets).values(rows);
}

// n working sets of one template (plus one warm-up), for set-count rules.
export const filler = (template: string, n: number, kg = 40, reps = 10): FixtureExercise => ({
  template, sets: [{ kg, reps, type: "warmup" }, ...Array.from({ length: n }, () => ({ kg, reps }))],
});

export async function templates(db: TestDb) {
  await db.insert(hevyExerciseTemplates).values([
    { id: "79D0BB3A", title: "Bankdrücken (LH)", primaryMuscleGroup: "chest", raw: {} },
    { id: "1B2B1E7C", title: "Klimmzug", primaryMuscleGroup: "lats", raw: {} },
    { id: "729237D1", title: "Klimmzug (gewichtet)", primaryMuscleGroup: "lats", raw: {} },
    { id: "29472BE1", title: "Brust Dip (gewichtet)", primaryMuscleGroup: "chest", raw: {} },
    { id: "DDCC3821", title: "Squat (Smith)", primaryMuscleGroup: "quadriceps", raw: {} },
    { id: "24706DCD", title: "Iso-Lat Bankdrücken", primaryMuscleGroup: "chest", raw: {} },
    { id: "B8127AD1", title: "Beinbeugen", primaryMuscleGroup: "hamstrings", raw: {} },
    { id: "0222DB42", title: "Rudermaschine", primaryMuscleGroup: "cardio", raw: {} },
    { id: "LEGCURL1", title: "Leg Curl", primaryMuscleGroup: "hamstrings", raw: {} },
  ]);
}

export async function appleRun(db: TestDb, id: string, startIso: string, minutes: number, name = "Running", km: number | null = 5) {
  const start = new Date(startIso);
  await db.insert(workouts).values({
    id, name, start, end: new Date(start.getTime() + minutes * 60_000), durationS: String(minutes * 60),
    distance: km === null ? null : String(km), distanceUnits: km === null ? null : "km", raw: { type: name },
  });
}
