import { sql } from "drizzle-orm";
import {
  HEVY_MUSCLE_MAP,
  HEVY_ROUTINES,
  LEAD_LIFTS,
  MUSCLE_GROUPS,
  PLAN,
  RUN_MIN_MINUTES,
  WEEK_SLOTS,
  WEIGHT_GOAL,
  hevyRoutineLink,
  planWeek,
  routineKeyOf,
  type LiftMode,
  type MuscleKey,
  type RoutineKey,
  type SlotKey,
} from "@/lib/coach/plan-defaults";
import { betterThan, bestOf, valueOf, type BestSet, type LeadSetRow } from "@/lib/coach/lifts";
import { baselineWindowEnd, liftBaselineFrom, readBaselines, type BaselineKey } from "@/lib/coach/baselines";
import { fillSlots, isComplete, isCounted, slotSessionsOf, type Slot, type SlotSession } from "@/lib/coach/slots";
import { addDays, berlinDay, berlinMidnight, diffDays, weekStartOf, weekdayIndex } from "@/lib/dashboard/time";

export { betterThan, bestOf, valueOf, type BestSet, type LeadSetRow };

// Pure loaders for the dashboard. Each takes the db as a parameter (neon-http in
// prod, PGlite in tests) and a `now`, so every time boundary is deterministic.
// All day keys are Berlin calendar days ("YYYY-MM-DD"); bucketing happens in SQL
// with AT TIME ZONE so Postgres and PGlite agree.

export type Db = { execute: (q: any) => Promise<any> | any };

async function rows<T>(db: Db, q: ReturnType<typeof sql>): Promise<T[]> {
  const r = await db.execute(q);
  return (r.rows ?? r) as T[];
}
const n = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
};
const dayOf = (v: unknown): string => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));
const mean = (xs: number[]): number | null => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const round1 = (x: number) => Math.round(x * 10) / 10;

// ---------------------------------------------------------------------------
// 1. Weight trend
// ---------------------------------------------------------------------------

export type WeightPoint = { day: string; kg: number; source: "hevy" | "health" };
export type WeightTrendData = {
  from: string;
  to: string;
  points: WeightPoint[]; // one per day with a value
  avg7: { day: string; kg: number | null }[]; // one per day in the window
  latest: WeightPoint | null;
  latestAvg7: number | null;
  goal: { startDay: string; startKg: number; endDay: string; endKg: number };
  goalToday: number | null; // where the goal line is today, null outside the plan
};

export async function weightTrend(db: Db, weeks = 8, now = new Date()): Promise<WeightTrendData> {
  const to = berlinDay(now);
  const from = addDays(to, -(weeks * 7 - 1));
  const loadFrom = addDays(from, -6); // the 7-day mean of the first day looks back 6 days
  const byDay = new Map<string, WeightPoint>();

  const health = await rows<{ day: string; kg: unknown }>(
    db,
    sql`SELECT to_char(date AT TIME ZONE 'Europe/Berlin', 'YYYY-MM-DD') AS day, max(qty)::float8 AS kg
        FROM metric_samples WHERE metric_name = 'weight_body_mass' AND qty IS NOT NULL
          AND date >= ${berlinMidnight(loadFrom)} AND date < ${berlinMidnight(addDays(to, 1))}
        GROUP BY 1`,
  );
  for (const r of health) {
    const kg = n(r.kg);
    if (kg) byDay.set(r.day, { day: r.day, kg, source: "health" });
  }
  // HEVY wins over Apple Health on the same day.
  const hevy = await rows<{ day: unknown; kg: unknown }>(
    db,
    sql`SELECT date::text AS day, weight_kg::float8 AS kg FROM hevy_measurements
        WHERE weight_kg IS NOT NULL AND date >= ${loadFrom}::date AND date <= ${to}::date`,
  );
  for (const r of hevy) {
    const kg = n(r.kg);
    if (kg) byDay.set(dayOf(r.day), { day: dayOf(r.day), kg, source: "hevy" });
  }

  const avg7: WeightTrendData["avg7"] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const xs: number[] = [];
    for (let i = 0; i < 7; i++) {
      const p = byDay.get(addDays(d, -i));
      if (p) xs.push(p.kg);
    }
    avg7.push({ day: d, kg: xs.length >= 3 ? round1(mean(xs)!) : null });
  }
  const points = [...byDay.values()].filter((p) => p.day >= from).sort((a, b) => a.day.localeCompare(b.day));
  const latest = points.length ? points[points.length - 1] : null;
  const latestAvg7 = [...avg7].reverse().find((a) => a.kg !== null)?.kg ?? null;
  return {
    from, to, points, avg7, latest, latestAvg7,
    goal: { ...WEIGHT_GOAL },
    goalToday: goalAt(to),
  };
}

// Linear goal line value on a day, null outside the plan window.
export function goalAt(day: string): number | null {
  const total = diffDays(WEIGHT_GOAL.startDay, WEIGHT_GOAL.endDay);
  const t = diffDays(WEIGHT_GOAL.startDay, day);
  if (t < 0 || t > total) return null;
  return round1(WEIGHT_GOAL.startKg + ((WEIGHT_GOAL.endKg - WEIGHT_GOAL.startKg) * t) / total);
}

// ---------------------------------------------------------------------------
// 2. Recovery light
// ---------------------------------------------------------------------------

export type Ampel = "gruen" | "gelb" | "stopp" | "unbekannt";
export type RecoveryMetric = {
  today: number | null; // latest value, null when older than 36 h
  todayDay: string | null;
  mean7: number | null; // mean of the last 7 days (>= 3 days)
  baseline28: number | null; // mean of days -34 … -7 (>= 14 days)
  baselineDays: number; // clean days in the baseline window (max 28)
};
export type RecoveryData = {
  ampel: Ampel;
  reasons: string[];
  baselineComplete: boolean;
  rhr: RecoveryMetric;
  hrv: RecoveryMetric;
  sleep: { hours: number | null; day: string | null };
};

const GAP_MS = 36 * 3_600_000;

type DailyRow = { day: string; v: unknown; last: unknown };

function metricFromDaily(daily: DailyRow[], today: string, now: Date): RecoveryMetric {
  const byDay = new Map<string, number>();
  let lastInstant: Date | null = null;
  let lastDay: string | null = null;
  for (const r of daily) {
    const v = n(r.v);
    if (v === null) continue;
    byDay.set(r.day, v);
    const t = new Date(r.last as string);
    if (!lastInstant || t > lastInstant) {
      lastInstant = t;
      lastDay = r.day;
    }
  }
  const fresh = lastInstant !== null && now.getTime() - lastInstant.getTime() <= GAP_MS;
  const window = (fromOff: number, toOff: number) => {
    const xs: number[] = [];
    for (let i = fromOff; i <= toOff; i++) {
      const v = byDay.get(addDays(today, -i));
      if (v !== undefined) xs.push(v);
    }
    return xs;
  };
  const last7 = window(0, 6);
  const base = window(7, 34);
  return {
    today: fresh && lastDay ? byDay.get(lastDay)! : null,
    todayDay: fresh ? lastDay : null,
    mean7: last7.length >= 3 ? round1(mean(last7)!) : null,
    baseline28: base.length >= 14 ? round1(mean(base)!) : null,
    baselineDays: base.length,
  };
}

// Kai's rule: compare today with the 7-day mean. One signal → gelb; both hard
// signals (RHR > mean+10 AND HRV < 70 % of mean) → stopp. Until the 28-day
// baseline is clean, stopp is capped to gelb. A data gap is "unbekannt", never a
// penalty. Exported for tests.
export function ampelFrom(rhr: RecoveryMetric, hrv: RecoveryMetric): { ampel: Ampel; reasons: string[]; baselineComplete: boolean } {
  const reasons: string[] = [];
  const rhrKnown = rhr.today !== null && rhr.mean7 !== null;
  const hrvKnown = hrv.today !== null && hrv.mean7 !== null;
  if (!rhrKnown && !hrvKnown) return { ampel: "unbekannt", reasons: ["keine frischen Werte"], baselineComplete: false };

  let rhrSoft = false, rhrHard = false, hrvSoft = false, hrvHard = false;
  if (rhrKnown) {
    const d = rhr.today! - rhr.mean7!;
    rhrHard = d > 10;
    rhrSoft = d > 5;
    if (rhrHard) reasons.push(`Ruhepuls +${round1(d)} über 7d-Mittel`);
    else if (rhrSoft) reasons.push(`Ruhepuls +${round1(d)} über 7d-Mittel`);
  } else reasons.push("Ruhepuls fehlt");
  if (hrvKnown) {
    const r = hrv.today! / hrv.mean7!;
    hrvHard = r < 0.7;
    hrvSoft = r < 0.85;
    if (hrvSoft) reasons.push(`HRV ${Math.round(r * 100)} % des 7d-Mittels`);
  } else reasons.push("HRV fehlt");

  const baselineComplete = rhr.baselineDays >= 28 && hrv.baselineDays >= 28;
  let ampel: Ampel = "gruen";
  if (rhrHard && hrvHard) ampel = "stopp";
  else if (rhrSoft || hrvSoft) ampel = "gelb";
  if (ampel === "stopp" && !baselineComplete) {
    ampel = "gelb";
    reasons.push(`Baseline ${Math.min(rhr.baselineDays, hrv.baselineDays)}/28 Tage, Stopp noch gesperrt`);
  }
  return { ampel, reasons, baselineComplete };
}

export async function recovery(db: Db, now = new Date()): Promise<RecoveryData> {
  const today = berlinDay(now);
  const from = berlinMidnight(addDays(today, -35));
  const to = berlinMidnight(addDays(today, 1));

  const rhrRows = await rows<DailyRow>(
    db,
    sql`SELECT to_char(date AT TIME ZONE 'Europe/Berlin', 'YYYY-MM-DD') AS day,
               avg(qty)::float8 AS v, max(date) AS last
        FROM metric_samples WHERE metric_name = 'resting_heart_rate' AND qty IS NOT NULL
          AND date >= ${from} AND date < ${to}
        GROUP BY 1`,
  );
  // HRV: only night samples (00:00–06:59 Berlin), value = avg or qty.
  const hrvRows = await rows<DailyRow>(
    db,
    sql`SELECT to_char(date AT TIME ZONE 'Europe/Berlin', 'YYYY-MM-DD') AS day,
               avg(coalesce(avg, qty))::float8 AS v, max(date) AS last
        FROM metric_samples WHERE metric_name = 'heart_rate_variability' AND coalesce(avg, qty) IS NOT NULL
          AND extract(hour FROM date AT TIME ZONE 'Europe/Berlin') < 7
          AND date >= ${from} AND date < ${to}
        GROUP BY 1`,
  );
  const sleepRows = await rows<{ day: string; last: unknown; hours: unknown }>(
    db,
    sql`SELECT to_char(date AT TIME ZONE 'Europe/Berlin', 'YYYY-MM-DD') AS day, date AS last,
               (extra->>'totalSleep')::float8 AS hours
        FROM metric_samples WHERE metric_name = 'sleep_analysis' AND extra->>'totalSleep' IS NOT NULL
          AND date >= ${from} AND date < ${to}
        ORDER BY date DESC LIMIT 1`,
  );

  const rhr = metricFromDaily(rhrRows, today, now);
  const hrv = metricFromDaily(hrvRows, today, now);
  const s = sleepRows[0];
  const sleepFresh = s && now.getTime() - new Date(s.last as string).getTime() <= GAP_MS;
  const sleep = sleepFresh ? { hours: n(s.hours) === null ? null : round1(n(s.hours)!), day: s.day } : { hours: null, day: null };
  return { ...ampelFrom(rhr, hrv), rhr, hrv, sleep };
}

// ---------------------------------------------------------------------------
// 3. Training week
// ---------------------------------------------------------------------------

export type Session = { id: string; title: string; day: string; weekday: number; minutes: number | null; sets: number };
export type MuscleRow = { key: MuscleKey | "sonstiges"; label: string; sets: number; target: number | null };
export type TrainingWeekData = {
  weekStart: string;
  days: Session[][]; // index 0 = Monday
  sessions: Session[];
  totalSets: number;
  muscles: MuscleRow[];
};

export async function trainingWeek(db: Db, weekStart: string): Promise<TrainingWeekData> {
  const from = berlinMidnight(weekStart);
  const to = berlinMidnight(addDays(weekStart, 7));
  const ws = await rows<{ id: string; title: string | null; day: string; minutes: unknown; sets: unknown }>(
    db,
    sql`SELECT w.id, w.title, to_char(w.start_time AT TIME ZONE 'Europe/Berlin', 'YYYY-MM-DD') AS day,
               (extract(epoch FROM (w.end_time - w.start_time)) / 60)::float8 AS minutes,
               (SELECT count(*) FROM hevy_sets s WHERE s.workout_id = w.id AND coalesce(s.set_type, 'normal') <> 'warmup')::int AS sets
        FROM hevy_workouts w WHERE w.start_time >= ${from} AND w.start_time < ${to}
        ORDER BY w.start_time`,
  );
  const sessions: Session[] = ws.map((w) => ({
    id: w.id,
    title: w.title ?? "Training",
    day: w.day,
    weekday: Math.max(0, Math.min(6, diffDays(weekStart, w.day))),
    minutes: n(w.minutes) === null ? null : Math.round(n(w.minutes)!),
    sets: n(w.sets) ?? 0,
  }));
  const days: Session[][] = Array.from({ length: 7 }, () => []);
  for (const s of sessions) days[s.weekday].push(s);

  const mg = await rows<{ grp: string | null; sets: unknown }>(
    db,
    sql`SELECT t.primary_muscle_group AS grp, count(*)::int AS sets
        FROM hevy_sets s JOIN hevy_workouts w ON w.id = s.workout_id
        LEFT JOIN hevy_exercise_templates t ON t.id = s.template_id
        WHERE w.start_time >= ${from} AND w.start_time < ${to} AND coalesce(s.set_type, 'normal') <> 'warmup'
        GROUP BY 1`,
  );
  const counts = new Map<string, number>();
  for (const r of mg) {
    const key = (r.grp && HEVY_MUSCLE_MAP[r.grp]) || "sonstiges";
    counts.set(key, (counts.get(key) ?? 0) + (n(r.sets) ?? 0));
  }
  const muscles: MuscleRow[] = MUSCLE_GROUPS.map((g) => ({ key: g.key, label: g.label, sets: counts.get(g.key) ?? 0, target: g.target }));
  if (counts.get("sonstiges")) muscles.push({ key: "sonstiges", label: "Sonstiges", sets: counts.get("sonstiges")!, target: null });
  return { weekStart, days, sessions, totalSets: sessions.reduce((a, s) => a + s.sets, 0), muscles };
}

// ---------------------------------------------------------------------------
// 4. Lead lifts
// ---------------------------------------------------------------------------

export type LeadLiftData = {
  key: string;
  title: string;
  short: string;
  mode: LiftMode;
  unit: string; // "kg" | "Wdh"
  boss: { weightKg: number; reps: number; e1rm: number; value: number } | null;
  endBoss: string | null;
  weeks: { weekStart: string; best: BestSet | null }[];
  latest: BestSet | null;
};

export async function leadLifts(db: Db, weeks = 12, now = new Date()): Promise<LeadLiftData[]> {
  const thisWeek = weekStartOf(now);
  const firstWeek = addDays(thisWeek, -7 * (weeks - 1));
  const from = berlinMidnight(firstWeek);
  const ids = LEAD_LIFTS.flatMap((l) => l.templateIds);
  type SetRow = { workout_id: string; exercise_index: number; set_index: number; template_id: string; day: string; weight: unknown; reps: unknown };
  const sets = await rows<SetRow>(
    db,
    sql`SELECT s.workout_id, s.exercise_index, s.set_index, s.template_id,
               to_char(w.start_time AT TIME ZONE 'Europe/Berlin', 'YYYY-MM-DD') AS day,
               s.weight_kg::float8 AS weight, s.reps
        FROM hevy_sets s JOIN hevy_workouts w ON w.id = s.workout_id
        WHERE s.template_id IN ${ids} AND w.start_time >= ${from}
          AND coalesce(s.set_type, 'normal') <> 'warmup' AND s.reps > 0
        ORDER BY w.start_time, s.exercise_index, s.set_index`,
  );
  const weekOf = (day: string) => addDays(day, -(((diffDays(firstWeek, day) % 7) + 7) % 7));
  return LEAD_LIFTS.map((lift) => {
    const own = new Set(lift.templateIds);
    let mine = sets.filter((r) => own.has(r.template_id) && (n(r.reps) ?? 0) > 0);
    if (lift.mode === "reps") {
      // Only the last set of the exercise in each session counts (rows are ordered).
      const lastPerWorkout = new Map<string, SetRow>();
      for (const r of mine) lastPerWorkout.set(r.workout_id, r);
      mine = [...lastPerWorkout.values()];
    }
    const perWeek = new Map<string, BestSet>();
    for (const r of mine) {
      const reps = n(r.reps)!;
      const weightKg = n(r.weight) ?? 0;
      const b: BestSet = { day: r.day, weightKg, reps, ...valueOf(lift, weightKg, reps) };
      const wk = weekOf(r.day);
      const cur = perWeek.get(wk);
      const better = !cur || b.value > cur.value || (b.value === cur.value && b.e1rm > cur.e1rm);
      if (better) perWeek.set(wk, b);
    }
    const weekList: LeadLiftData["weeks"] = [];
    for (let i = 0; i < weeks; i++) {
      const wk = addDays(firstWeek, 7 * i);
      weekList.push({ weekStart: wk, best: perWeek.get(wk) ?? null });
    }
    const latest = [...weekList].reverse().find((w) => w.best)?.best ?? null;
    const boss = lift.boss ? { ...lift.boss, ...valueOf(lift, lift.boss.weightKg, lift.boss.reps) } : null;
    return {
      key: lift.key, title: lift.title, short: lift.short, mode: lift.mode,
      unit: lift.mode === "reps" ? "Wdh" : "kg",
      boss: boss ? { weightKg: boss.weightKg, reps: boss.reps, e1rm: boss.e1rm, value: boss.value } : null,
      endBoss: lift.endBoss, weeks: weekList, latest,
    };
  });
}

// ---------------------------------------------------------------------------
// 5. Measurements
// ---------------------------------------------------------------------------

export type MeasurementRow = { day: string; weightKg: number | null; waistCm: number | null; chestCm: number | null; bicepCm: number | null };
export type MeasurementsData = {
  rows: MeasurementRow[]; // newest first, max 3
  deltas: Omit<MeasurementRow, "day"> | null; // newest minus oldest of the three
  hasCircumference: boolean;
};

export async function measurements(db: Db): Promise<MeasurementsData> {
  const rs = await rows<{ day: unknown; w: unknown; wa: unknown; ch: unknown; bi: unknown }>(
    db,
    sql`SELECT date::text AS day, weight_kg::float8 AS w, waist_cm::float8 AS wa, chest_cm::float8 AS ch, bicep_cm::float8 AS bi
        FROM hevy_measurements ORDER BY date DESC LIMIT 3`,
  );
  const list: MeasurementRow[] = rs.map((r) => ({ day: dayOf(r.day), weightKg: n(r.w), waistCm: n(r.wa), chestCm: n(r.ch), bicepCm: n(r.bi) }));
  const d = (a: number | null, b: number | null) => (a !== null && b !== null ? round1(a - b) : null);
  const first = list[list.length - 1];
  const last = list[0];
  const deltas = list.length >= 2
    ? { weightKg: d(last.weightKg, first.weightKg), waistCm: d(last.waistCm, first.waistCm), chestCm: d(last.chestCm, first.chestCm), bicepCm: d(last.bicepCm, first.bicepCm) }
    : null;
  return { rows: list, deltas, hasCircumference: list.some((r) => r.waistCm !== null || r.chestCm !== null || r.bicepCm !== null) };
}

// ---------------------------------------------------------------------------
// 6. Run week
// ---------------------------------------------------------------------------

export type AppleWorkout = { id: string; name: string; day: string; minutes: number | null; km: number | null };
export type RunWeekData = {
  weekStart: string;
  coachWeek: { runKm: number | null; runMinutes: number | null; runCount: number | null; hardSessions: number | null; z2Minutes: number | null; source: string | null; note: string | null } | null;
  runDays: string[]; // Berlin days with running_speed samples
  appleWorkouts: AppleWorkout[];
};

export async function runWeek(db: Db, weekStart: string): Promise<RunWeekData> {
  const from = berlinMidnight(weekStart);
  const to = berlinMidnight(addDays(weekStart, 7));
  const cw = await rows<Record<string, unknown>>(
    db,
    sql`SELECT run_km::float8 AS run_km, run_minutes, run_count, hard_sessions, z2_minutes, source, note
        FROM coach_weeks WHERE week_start = ${weekStart}::date`,
  );
  const rd = await rows<{ day: string }>(
    db,
    sql`SELECT DISTINCT to_char(date AT TIME ZONE 'Europe/Berlin', 'YYYY-MM-DD') AS day
        FROM metric_samples WHERE metric_name = 'running_speed' AND date >= ${from} AND date < ${to} ORDER BY 1`,
  );
  const aw = await rows<{ id: string; name: string | null; day: string; minutes: unknown; km: unknown }>(
    db,
    sql`SELECT id, name, to_char(start AT TIME ZONE 'Europe/Berlin', 'YYYY-MM-DD') AS day,
               (duration_s / 60)::float8 AS minutes,
               CASE WHEN distance_units ILIKE 'km' THEN distance::float8
                    WHEN distance_units ILIKE 'm' THEN distance::float8 / 1000
                    WHEN distance_units ILIKE 'mi%' THEN distance::float8 * 1.609344
                    ELSE distance::float8 END AS km
        FROM workouts WHERE start >= ${from} AND start < ${to} ORDER BY start`,
  );
  const c = cw[0];
  return {
    weekStart,
    coachWeek: c
      ? { runKm: n(c.run_km), runMinutes: n(c.run_minutes), runCount: n(c.run_count), hardSessions: n(c.hard_sessions), z2Minutes: n(c.z2_minutes), source: (c.source as string | null) ?? null, note: (c.note as string | null) ?? null }
      : null,
    runDays: rd.map((r) => r.day),
    appleWorkouts: aw.map((w) => ({
      id: w.id,
      name: w.name ?? "Workout",
      day: w.day,
      minutes: n(w.minutes) === null ? null : Math.round(n(w.minutes)!),
      km: n(w.km) === null ? null : round1(n(w.km)!),
    })),
  };
}

// ---------------------------------------------------------------------------
// 7. Weekly volume
// ---------------------------------------------------------------------------

export type WeeklyVolumeData = { weeks: { weekStart: string; sets: number; sessions: number }[] };

export async function weeklyVolume(db: Db, weeks = 12, now = new Date()): Promise<WeeklyVolumeData> {
  const thisWeek = weekStartOf(now);
  const firstWeek = addDays(thisWeek, -7 * (weeks - 1));
  const rs = await rows<{ day: string; sets: unknown; id: string }>(
    db,
    sql`SELECT w.id, to_char(w.start_time AT TIME ZONE 'Europe/Berlin', 'YYYY-MM-DD') AS day,
               (SELECT count(*) FROM hevy_sets s WHERE s.workout_id = w.id AND coalesce(s.set_type, 'normal') <> 'warmup')::int AS sets
        FROM hevy_workouts w WHERE w.start_time >= ${berlinMidnight(firstWeek)}`,
  );
  const acc = new Map<string, { sets: number; sessions: number }>();
  for (const r of rs) {
    const wk = addDays(r.day, -((diffDays(firstWeek, r.day) % 7 + 7) % 7));
    const cur = acc.get(wk) ?? { sets: 0, sessions: 0 };
    cur.sets += n(r.sets) ?? 0;
    cur.sessions += 1;
    acc.set(wk, cur);
  }
  const out: WeeklyVolumeData["weeks"] = [];
  for (let i = 0; i < weeks; i++) {
    const wk = addDays(firstWeek, 7 * i);
    out.push({ weekStart: wk, ...(acc.get(wk) ?? { sets: 0, sessions: 0 }) });
  }
  return { weeks: out };
}

// ---------------------------------------------------------------------------
// Shared loaders for slots, XP and baselines
// ---------------------------------------------------------------------------

// Strength sessions in [fromDay 00:00 Berlin, toInstant): working-set count and
// the routine key from the title (or raw.routine_id, should HEVY ever send it).
export type HevySession = { id: string; title: string; day: string; start: Date; minutes: number | null; sets: number; routineKey: RoutineKey | null };

export async function hevySessions(db: Db, fromDay: string, toInstant: Date): Promise<HevySession[]> {
  const rs = await rows<{ id: string; title: string | null; day: string; start: unknown; minutes: unknown; sets: unknown; routine_id: string | null }>(
    db,
    sql`SELECT w.id, w.title, w.start_time AS start, to_char(w.start_time AT TIME ZONE 'Europe/Berlin', 'YYYY-MM-DD') AS day,
               (extract(epoch FROM (w.end_time - w.start_time)) / 60)::float8 AS minutes,
               (SELECT count(*) FROM hevy_sets s WHERE s.workout_id = w.id AND coalesce(s.set_type, 'normal') <> 'warmup')::int AS sets,
               w.raw->>'routine_id' AS routine_id
        FROM hevy_workouts w WHERE w.start_time >= ${berlinMidnight(fromDay)} AND w.start_time < ${toInstant}
        ORDER BY w.start_time`,
  );
  return rs.map((w) => ({
    id: w.id, title: w.title ?? "Training", day: w.day, start: new Date(w.start as string),
    minutes: n(w.minutes) === null ? null : Math.round(n(w.minutes)!),
    sets: n(w.sets) ?? 0, routineKey: routineKeyOf(w.title, w.routine_id),
  }));
}

// Runs in [fromDay, toInstant): Apple Health workouts of a running type with at
// least RUN_MIN_MINUTES, plus days with running_speed samples spanning that long
// when no workout was recorded (id "speed:<day>").
export type RunSession = { id: string; name: string; day: string; start: Date; minutes: number; km: number | null };

export async function runSessions(db: Db, fromDay: string, toInstant: Date): Promise<RunSession[]> {
  const from = berlinMidnight(fromDay);
  const ws = await rows<{ id: string; name: string | null; day: string; start: unknown; minutes: unknown; km: unknown }>(
    db,
    sql`SELECT id, name, start, to_char(start AT TIME ZONE 'Europe/Berlin', 'YYYY-MM-DD') AS day,
               (duration_s / 60)::float8 AS minutes,
               CASE WHEN distance_units ILIKE 'km' THEN distance::float8
                    WHEN distance_units ILIKE 'm' THEN distance::float8 / 1000
                    WHEN distance_units ILIKE 'mi%' THEN distance::float8 * 1.609344
                    ELSE distance::float8 END AS km
        FROM workouts
        WHERE start >= ${from} AND start < ${toInstant} AND duration_s >= ${RUN_MIN_MINUTES * 60}
          AND (name ILIKE '%run%' OR name ILIKE '%lauf%' OR name ILIKE '%jog%' OR raw->>'type' ILIKE '%run%')
        ORDER BY start`,
  );
  const runs: RunSession[] = ws.map((w) => ({
    id: w.id, name: w.name ?? "Laufen", day: w.day, start: new Date(w.start as string),
    minutes: Math.round(n(w.minutes) ?? 0), km: n(w.km) === null ? null : round1(n(w.km)!),
  }));
  const have = new Set(runs.map((r) => r.day));
  const sp = await rows<{ day: string; first: unknown; minutes: unknown }>(
    db,
    sql`SELECT to_char(date AT TIME ZONE 'Europe/Berlin', 'YYYY-MM-DD') AS day, min(date) AS first,
               (extract(epoch FROM (max(date) - min(date))) / 60)::float8 AS minutes
        FROM metric_samples WHERE metric_name = 'running_speed' AND date >= ${from} AND date < ${toInstant}
        GROUP BY 1 HAVING extract(epoch FROM (max(date) - min(date))) >= ${RUN_MIN_MINUTES * 60} ORDER BY 1`,
  );
  for (const r of sp) {
    if (have.has(r.day)) continue;
    runs.push({ id: `speed:${r.day}`, name: "Laufen (Health-Samples)", day: r.day, start: new Date(r.first as string), minutes: Math.round(n(r.minutes) ?? 0), km: null });
  }
  return runs.sort((a, b) => a.start.getTime() - b.start.getTime());
}

// Every working set at a lead lift, oldest first (all history when `from` is
// omitted). Used for PR checks and baselines.

export async function leadSets(db: Db, from?: Date, to?: Date): Promise<LeadSetRow[]> {
  const ids = LEAD_LIFTS.flatMap((l) => l.templateIds);
  const rs = await rows<{ workout_id: string; template_id: string; day: string; start: unknown; weight: unknown; reps: unknown; exercise_index: number; set_index: number }>(
    db,
    sql`SELECT s.workout_id, s.template_id, s.exercise_index, s.set_index, w.start_time AS start,
               to_char(w.start_time AT TIME ZONE 'Europe/Berlin', 'YYYY-MM-DD') AS day,
               s.weight_kg::float8 AS weight, s.reps
        FROM hevy_sets s JOIN hevy_workouts w ON w.id = s.workout_id
        WHERE s.template_id IN ${ids} AND coalesce(s.set_type, 'normal') <> 'warmup' AND s.reps > 0
          AND w.start_time >= ${from ?? new Date(0)} AND w.start_time < ${to ?? new Date("2100-01-01T00:00:00Z")}
        ORDER BY w.start_time, s.exercise_index, s.set_index`,
  );
  return rs.map((r) => ({
    workoutId: r.workout_id, templateId: r.template_id, day: r.day, start: new Date(r.start as string),
    weightKg: n(r.weight) ?? 0, reps: n(r.reps) ?? 0, exerciseIndex: Number(r.exercise_index), setIndex: Number(r.set_index),
  }));
}

// ---------------------------------------------------------------------------
// 8. Week slots (Mo PUSH, Di LEGS, Mi LAUF, Do PULL, Fr frei, Sa CALI, So LAUF)
// ---------------------------------------------------------------------------

export const SLOT_LABEL: Record<SlotKey, string> = { PUSH: "PUSH", LEGS: "LEGS", PULL: "PULL", LAUF: "LAUF", CALI: "CALI" };

export type WeekSlotsData = {
  weekStart: string;
  slots: Slot[];
  filled: number; // 0..6
  weeksCounted: number; // weeks since the plan start with >= 1 filled slot (up to this week)
  weeksComplete: number; // weeks with 6/6
};

// Slots of the given week plus the two counters over every plan week up to it.
// Sessions fill slots on whatever day they happened; a strength session counts
// from SESSION_MIN_SETS working sets, a run from RUN_MIN_MINUTES.
export async function weekSlots(db: Db, weekStart: string): Promise<WeekSlotsData> {
  const firstWeek = weekStartOf(berlinMidnight(PLAN.start));
  const fromDay = weekStart < firstWeek ? weekStart : firstWeek;
  const to = berlinMidnight(addDays(weekStart, 7));
  const [sessions, runs] = await Promise.all([hevySessions(db, fromDay, to), runSessions(db, fromDay, to)]);
  const all = slotSessionsOf(sessions, runs);
  const inWeek = (wk: string) => all.filter((s) => s.day >= wk && s.day < addDays(wk, 7));
  const slots = fillSlots(weekStart, inWeek(weekStart));
  let weeksCounted = 0, weeksComplete = 0;
  for (let wk = firstWeek; wk <= weekStart; wk = addDays(wk, 7)) {
    const ss = fillSlots(wk, inWeek(wk));
    if (isCounted(ss)) weeksCounted++;
    if (isComplete(ss)) weeksComplete++;
  }
  return { weekStart, slots, filled: slots.filter((s) => s.filled).length, weeksCounted, weeksComplete };
}

// ---------------------------------------------------------------------------
// 9. Boss progress (baseline → boss target, 0–100 %)
// ---------------------------------------------------------------------------

export type BossRow = {
  key: BaselineKey;
  label: string;
  unit: "kg" | "Wdh" | "cm";
  baseline: number | null;
  baselineDay: string | null;
  provisional: boolean; // baseline not persisted yet (window still open)
  current: number | null;
  currentDay: string | null;
  target: number | null;
  pct: number | null; // clamped 0–100, null without baseline or current value
  decreasing: boolean; // waist, weight
};
export type BossProgressData = { rows: BossRow[]; windowEnd: string };

function pctOf(baseline: number | null, current: number | null, target: number | null): number | null {
  if (baseline === null || current === null || target === null) return null;
  const span = target - baseline;
  if (span === 0) return (target > 0 ? current >= target : current <= target) ? 100 : 0;
  return Math.max(0, Math.min(100, Math.round(((current - baseline) / span) * 100)));
}

export async function bossProgress(db: Db, now = new Date()): Promise<BossProgressData> {
  const windowEnd = baselineWindowEnd();
  const [have, lifts, weight, waistRows] = await Promise.all([
    readBaselines(db),
    leadLifts(db, 12, now),
    weightTrend(db, 1, now),
    rows<{ day: unknown; cm: unknown }>(
      db,
      sql`SELECT date::text AS day, waist_cm::float8 AS cm FROM hevy_measurements WHERE waist_cm IS NOT NULL ORDER BY date DESC`,
    ),
  ]);
  const bossLifts = LEAD_LIFTS.filter((l) => l.boss);
  const missing = bossLifts.filter((l) => !have.has(l.key as BaselineKey));
  const lead = missing.length ? await leadSets(db, undefined, berlinMidnight(windowEnd)) : [];

  const out: BossRow[] = [];
  for (const lift of bossLifts) {
    const key = lift.key as BaselineKey;
    const data = lifts.find((l) => l.key === lift.key)!;
    const b = have.get(key);
    const prov = b ? null : liftBaselineFrom(lift, lead);
    const baseline = b?.value ?? prov?.value ?? null;
    out.push({
      key, label: lift.short, unit: lift.mode === "reps" ? "Wdh" : "kg",
      baseline, baselineDay: b?.day ?? prov?.day ?? null, provisional: !b,
      current: data.latest?.value ?? null, currentDay: data.latest?.day ?? null,
      target: data.boss?.value ?? null, pct: pctOf(baseline, data.latest?.value ?? null, data.boss?.value ?? null), decreasing: false,
    });
  }
  // Waist: baseline persisted, else first in the window, else last before the start.
  const waist = waistRows.map((r) => ({ day: dayOf(r.day), cm: n(r.cm) })).filter((r): r is { day: string; cm: number } => r.cm !== null);
  const wb = have.get("waist");
  const wProv = wb ? null : ([...waist].reverse().find((r) => r.day >= PLAN.start && r.day < windowEnd) ?? waist.find((r) => r.day < PLAN.start) ?? null);
  const waistBase = wb?.value ?? wProv?.cm ?? null;
  const waistCur = waist[0] ?? null;
  out.push({
    key: "waist", label: "Taille", unit: "cm", baseline: waistBase, baselineDay: wb?.day ?? wProv?.day ?? null, provisional: !wb,
    current: waistCur?.cm ?? null, currentDay: waistCur?.day ?? null, target: waistBase === null ? null : round1(waistBase - 4),
    pct: pctOf(waistBase, waistCur?.cm ?? null, waistBase === null ? null : waistBase - 4), decreasing: true,
  });
  const gb = have.get("weight");
  const weightBase = gb?.value ?? WEIGHT_GOAL.startKg;
  out.push({
    key: "weight", label: "Gewicht", unit: "kg", baseline: weightBase, baselineDay: gb?.day ?? PLAN.start, provisional: !gb,
    current: weight.latestAvg7, currentDay: weight.latest?.day ?? null, target: WEIGHT_GOAL.bossMaxKg,
    pct: pctOf(weightBase, weight.latestAvg7, WEIGHT_GOAL.bossMaxKg), decreasing: true,
  });
  return { rows: out, windowEnd };
}

// ---------------------------------------------------------------------------
// 10. Today: slot, routine deep link, today's XP, hero mode
// ---------------------------------------------------------------------------

export type XpEventRow = { id: number; kind: string; source: string; sourceId: string; xp: number; weekStart: string; awardedAt: Date; meta: Record<string, unknown> | null };
export type HeroMode = { kind: "xp"; xp: number } | { kind: "slot"; label: string } | { kind: "pause" } | { kind: "stopp" };
export type TodayState = {
  today: string;
  weekday: number; // 0 = Monday
  planWeek: number; // 0 before, 1..12 inside, 13+ after
  slot: { key: SlotKey; label: string } | null; // null on Sunday and outside the plan
  routine: { key: RoutineKey; id: string; title: string; href: string } | null;
  done: SlotSession[]; // sessions of today that count
  events: XpEventRow[]; // awarded today (Berlin)
  todayXp: number;
  hero: HeroMode; // without the traffic light; the view re-applies heroMode() with it
};

// Reward first, brake second, then the plan: +N XP once something was awarded
// today, STOPP on a red light, PAUSE on a rest day, else the slot name.
export function heroMode(s: Pick<TodayState, "todayXp" | "slot">, ampel: Ampel): HeroMode {
  if (s.todayXp > 0) return { kind: "xp", xp: s.todayXp };
  if (ampel === "stopp") return { kind: "stopp" };
  if (!s.slot) return { kind: "pause" };
  return { kind: "slot", label: s.slot.label };
}

export async function todayState(db: Db, now = new Date()): Promise<TodayState> {
  const today = berlinDay(now);
  const weekday = weekdayIndex(today);
  const pw = planWeek(today);
  const inPlan = pw >= 1 && pw <= PLAN.weeks;
  const slotDef = inPlan ? WEEK_SLOTS.find((s) => s.weekday === weekday) ?? null : null;
  const slot = slotDef ? { key: slotDef.key, label: SLOT_LABEL[slotDef.key] } : null;
  const routine = slotDef && slotDef.key !== "LAUF"
    ? { key: slotDef.key, id: HEVY_ROUTINES[slotDef.key].id, title: HEVY_ROUTINES[slotDef.key].title, href: hevyRoutineLink(HEVY_ROUTINES[slotDef.key].id) }
    : null;
  const [sessions, runs, evs] = await Promise.all([
    hevySessions(db, today, berlinMidnight(addDays(today, 1))),
    runSessions(db, today, berlinMidnight(addDays(today, 1))),
    rows<{ id: unknown; kind: string; source: string; source_id: string; xp: unknown; week_start: unknown; awarded_at: unknown; meta: unknown }>(
      db,
      sql`SELECT id, kind, source, source_id, xp, week_start::text AS week_start, awarded_at, meta FROM coach_xp_events
          WHERE awarded_at >= ${berlinMidnight(today)} AND awarded_at < ${berlinMidnight(addDays(today, 1))} ORDER BY id`,
    ),
  ]);
  const events: XpEventRow[] = evs.map((r) => ({
    id: Number(r.id), kind: r.kind, source: r.source, sourceId: r.source_id, xp: n(r.xp) ?? 0, weekStart: String(r.week_start).slice(0, 10),
    awardedAt: new Date(r.awarded_at as string), meta: (typeof r.meta === "string" ? JSON.parse(r.meta) : r.meta) as Record<string, unknown> | null,
  }));
  const todayXp = events.reduce((a, e) => a + e.xp, 0);
  const state = { today, weekday, planWeek: pw, slot, routine, done: slotSessionsOf(sessions, runs), events, todayXp };
  return { ...state, hero: heroMode(state, "unbekannt") };
}

// ---------------------------------------------------------------------------
// Header: last HEVY sync
// ---------------------------------------------------------------------------

export async function lastHevySync(db: Db): Promise<Date | null> {
  const r = await rows<{ m: unknown }>(db, sql`SELECT max(synced_at) AS m FROM hevy_workouts`);
  const m = r[0]?.m;
  return m ? new Date(m as string) : null;
}
