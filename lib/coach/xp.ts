import { sql } from "drizzle-orm";
import {
  HEVY_MUSCLE_MAP,
  LEAD_LIFTS,
  PLAN,
  SESSION_MIN_SETS,
  SETS_TARGET,
  WEIGHT_GOAL,
  type MuscleKey,
} from "@/lib/coach/plan-defaults";
import { fillSlots, isComplete, type SlotSession } from "@/lib/coach/slots";
import { addDays, berlinDay, berlinMidnight, weekStartOf, weekdayIndex } from "@/lib/dashboard/time";
import {
  bestOf, betterThan, hevySessions, leadSets, recovery, runSessions, weightTrend,
  type Db, type HevySession, type LeadSetRow, type RunSession,
} from "@/lib/dashboard/queries";

// XP ledger (Gina, 25-gina-dashboard-v2 §1 and §5). Fixed XP per event, no
// multipliers, no decay. Every award is idempotent through
// UNIQUE(source, source_id, kind) + ON CONFLICT DO NOTHING, so the sync may run
// as often as it likes and an edited or deleted workout never takes XP away.

export const XP = {
  session: 100, // strength session with >= SESSION_MIN_SETS working sets
  run: 60, // run >= RUN_MIN_MINUTES
  sets_target: 15, // weekly set target of one muscle group reached (max 10 per week)
  pr: 80, // new best at a lead lift, mode-aware, against all history before the session
  stop_day: 40, // traffic light STOPP respected: no training that day
  week_complete: 200, // all six slots of a week filled
} as const;
export type XpKind = keyof typeof XP;
export const SETS_TARGET_MAX_PER_WEEK = 10;

export const LEVELS = [
  { level: 1, name: "Lehrling", min: 0 },
  { level: 2, name: "Eisenfresser", min: 500 },
  { level: 3, name: "Plattenschlepper", min: 1500 },
  { level: 4, name: "Hausmeister der Hantelbank", min: 3000 },
  { level: 5, name: "Rack-Besetzer", min: 5000 },
  { level: 6, name: "Gold's-Veteran", min: 7500 },
  { level: 7, name: "Kellermeister", min: 10500 },
  { level: 8, name: "Eisenpapst", min: 14000 },
] as const;

export type Level = { level: number; name: string; min: number; next: number | null; progress: number };

export function levelFor(total: number): Level {
  let cur: (typeof LEVELS)[number] = LEVELS[0];
  for (const l of LEVELS) if (total >= l.min) cur = l;
  const next = LEVELS.find((l) => l.level === cur.level + 1)?.min ?? null;
  const progress = next === null ? 1 : Math.max(0, Math.min(1, (total - cur.min) / (next - cur.min)));
  return { level: cur.level, name: cur.name, min: cur.min, next, progress };
}

export type XpEvent = {
  id: number;
  kind: XpKind;
  source: string;
  sourceId: string;
  xp: number;
  weekStart: string;
  awardedAt: Date;
  meta: Record<string, unknown> | null;
};

type Candidate = Omit<XpEvent, "id" | "awardedAt">;

async function rows<T>(db: Db, q: ReturnType<typeof sql>): Promise<T[]> {
  const r = await db.execute(q);
  return (r.rows ?? r) as T[];
}
const n = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
};
const weekOf = (day: string) => addDays(day, -weekdayIndex(day));
const endOfDay = (day: string) => new Date(berlinMidnight(addDays(day, 1)).getTime() - 1000);

const zero = (): Record<XpKind, number> => ({ session: 0, run: 0, sets_target: 0, pr: 0, stop_day: 0, week_complete: 0 });

// Sessions that count for a slot: strength with enough working sets, or a run.
export function slotSessionsOf(sessions: HevySession[], runs: RunSession[]): SlotSession[] {
  const out: SlotSession[] = [];
  for (const s of sessions) {
    if (s.sets < SESSION_MIN_SETS) continue;
    out.push({ id: s.id, title: s.title, day: s.day, kind: "hevy", routineKey: s.routineKey, sets: s.sets, minutes: s.minutes });
  }
  for (const r of runs) out.push({ id: r.id, title: r.name, day: r.day, kind: "run", routineKey: null, sets: 0, minutes: r.minutes });
  return out;
}

// Award every XP event the data supports, up to `now`. Returns the number of
// NEW rows per kind (repeat calls return zeros). Sessions only from the plan
// start; stop days only for the last `stopLookbackDays` days (the traffic light
// is re-computed for each of those days, three queries each).
export async function awardXp(db: Db, now = new Date(), opts: { stopLookbackDays?: number } = {}): Promise<Record<XpKind, number>> {
  const today = berlinDay(now);
  const counts = zero();
  if (today < PLAN.start) return counts;
  const lookback = opts.stopLookbackDays ?? 3;
  const thisWeek = weekStartOf(now);

  const [sessions, runs, lead, setRows] = await Promise.all([
    hevySessions(db, PLAN.start, now),
    runSessions(db, PLAN.start, now),
    leadSets(db, undefined, now),
    rows<{ day: string; grp: string | null; sets: unknown }>(
      db,
      sql`SELECT to_char(w.start_time AT TIME ZONE 'Europe/Berlin', 'YYYY-MM-DD') AS day, t.primary_muscle_group AS grp, count(*)::int AS sets
          FROM hevy_sets s JOIN hevy_workouts w ON w.id = s.workout_id
          LEFT JOIN hevy_exercise_templates t ON t.id = s.template_id
          WHERE w.start_time >= ${berlinMidnight(PLAN.start)} AND w.start_time < ${now} AND coalesce(s.set_type, 'normal') <> 'warmup'
          GROUP BY 1, 2`,
    ),
  ]);
  const cands: Candidate[] = [];

  // 1. Strength sessions.
  for (const s of sessions) {
    if (s.sets < SESSION_MIN_SETS) continue;
    cands.push({ kind: "session", source: "hevy_workout", sourceId: s.id, xp: XP.session, weekStart: weekOf(s.day), meta: { title: s.title, day: s.day, sets: s.sets, routine: s.routineKey } });
  }
  // 2. Runs.
  for (const r of runs) {
    cands.push({ kind: "run", source: "health_workout", sourceId: r.id, xp: XP.run, weekStart: weekOf(r.day), meta: { name: r.name, day: r.day, minutes: r.minutes, km: r.km } });
  }
  // 3. Weekly set targets per muscle group.
  const perWeek = new Map<string, Map<MuscleKey, number>>();
  for (const r of setRows) {
    const key = r.grp ? HEVY_MUSCLE_MAP[r.grp] : undefined;
    if (!key) continue;
    const wk = weekOf(r.day);
    const m = perWeek.get(wk) ?? new Map<MuscleKey, number>();
    m.set(key, (m.get(key) ?? 0) + (n(r.sets) ?? 0));
    perWeek.set(wk, m);
  }
  for (const [wk, m] of perWeek) {
    const hit = [...m].filter(([key, sets]) => sets >= SETS_TARGET[key]).slice(0, SETS_TARGET_MAX_PER_WEEK);
    for (const [key, sets] of hit) {
      cands.push({ kind: "sets_target", source: "week", sourceId: `${wk}:${key}`, xp: XP.sets_target, weekStart: wk, meta: { muscle: key, sets, target: SETS_TARGET[key] } });
    }
  }
  // 4. PRs: best of the session vs best of everything before it (all history).
  const byWorkout = new Map<string, LeadSetRow[]>();
  for (const r of lead) {
    const list = byWorkout.get(r.workoutId) ?? [];
    list.push(r);
    byWorkout.set(r.workoutId, list);
  }
  for (const s of sessions) {
    const own = byWorkout.get(s.id);
    if (!own) continue;
    const before = lead.filter((r) => r.start < s.start);
    for (const lift of LEAD_LIFTS) {
      const cur = bestOf(lift, own);
      if (!cur) continue;
      const prev = bestOf(lift, before);
      if (!prev || !betterThan(cur, prev)) continue; // a first value is a baseline, not a record
      cands.push({
        kind: "pr", source: "lift", sourceId: `${lift.key}:${s.id}`, xp: XP.pr, weekStart: weekOf(s.day),
        meta: { lift: lift.key, short: lift.short, mode: lift.mode, day: s.day, old: { weightKg: prev.weightKg, reps: prev.reps, value: prev.value, e1rm: prev.e1rm }, new: { weightKg: cur.weightKg, reps: cur.reps, value: cur.value, e1rm: cur.e1rm } },
      });
    }
  }
  // 5. Stop days respected (checked the day after, for a few days back).
  const firstCheck = addDays(today, -lookback);
  const trainedDays = new Set(sessions.map((s) => s.day));
  const other = await rows<{ day: string }>(
    db,
    sql`SELECT DISTINCT to_char(start AT TIME ZONE 'Europe/Berlin', 'YYYY-MM-DD') AS day FROM workouts
        WHERE start >= ${berlinMidnight(firstCheck)} AND start < ${berlinMidnight(today)}
          AND NOT (coalesce(name, '') ILIKE '%walk%' OR coalesce(name, '') ILIKE '%geh%' OR coalesce(name, '') ILIKE '%spazier%')`,
  );
  for (const r of other) trainedDays.add(r.day);
  for (let i = 1; i <= lookback; i++) {
    const d = addDays(today, -i);
    if (d < PLAN.start) break;
    if (trainedDays.has(d)) continue;
    const rec = await recovery(db, endOfDay(d));
    if (rec.ampel !== "stopp") continue;
    cands.push({ kind: "stop_day", source: "day", sourceId: d, xp: XP.stop_day, weekStart: weekOf(d), meta: { rhr: rec.rhr.today, rhr7: rec.rhr.mean7, hrv: rec.hrv.today, hrv7: rec.hrv.mean7 } });
  }
  // 6. Complete weeks (6/6 slots), plan start up to this week.
  const slotSessions = slotSessionsOf(sessions, runs);
  for (let wk = weekOf(PLAN.start); wk <= thisWeek; wk = addDays(wk, 7)) {
    const end = addDays(wk, 7);
    const slots = fillSlots(wk, slotSessions.filter((s) => s.day >= wk && s.day < end));
    if (!isComplete(slots)) continue;
    cands.push({ kind: "week_complete", source: "week", sourceId: wk, xp: XP.week_complete, weekStart: wk, meta: { slots: slots.map((s) => ({ key: s.key, id: s.filled!.id, day: s.filled!.day })) } });
  }

  if (!cands.length) return counts;
  const values = sql.join(
    cands.map((c) => sql`(${c.kind}, ${c.source}, ${c.sourceId}, ${c.xp}, ${c.weekStart}::date, ${now}, ${JSON.stringify(c.meta)}::jsonb)`),
    sql`, `,
  );
  const inserted = await rows<{ kind: XpKind }>(
    db,
    sql`INSERT INTO coach_xp_events (kind, source, source_id, xp, week_start, awarded_at, meta) VALUES ${values}
        ON CONFLICT (source, source_id, kind) DO NOTHING RETURNING kind`,
  );
  for (const r of inserted) counts[r.kind] += 1;
  return counts;
}

// ---------------------------------------------------------------------------
// Ledger for the page
// ---------------------------------------------------------------------------

export type XpLedger = {
  total: number;
  week: number; // XP with week_start = this week
  weekStart: string;
  level: Level;
  today: XpEvent[]; // awarded today (Berlin) → hero
  todayXp: number;
  prsThisWeek: XpEvent[]; // kind = pr with week_start = this week → feed
};

type EventRow = { id: unknown; kind: XpKind; source: string; source_id: string; xp: unknown; week_start: unknown; awarded_at: unknown; meta: unknown };
const toEvent = (r: EventRow): XpEvent => ({
  id: Number(r.id), kind: r.kind, source: r.source, sourceId: r.source_id, xp: n(r.xp) ?? 0,
  weekStart: String(r.week_start).slice(0, 10), awardedAt: new Date(r.awarded_at as string),
  meta: (typeof r.meta === "string" ? JSON.parse(r.meta) : r.meta) as Record<string, unknown> | null,
});

export async function xpLedger(db: Db, now = new Date()): Promise<XpLedger> {
  const today = berlinDay(now);
  const weekStart = weekStartOf(now);
  const [agg, evs] = await Promise.all([
    rows<{ total: unknown; week: unknown }>(
      db,
      sql`SELECT coalesce(sum(xp), 0)::int AS total, coalesce(sum(xp) FILTER (WHERE week_start = ${weekStart}::date), 0)::int AS week FROM coach_xp_events`,
    ),
    rows<EventRow>(
      db,
      sql`SELECT id, kind, source, source_id, xp, week_start::text AS week_start, awarded_at, meta FROM coach_xp_events
          WHERE to_char(awarded_at AT TIME ZONE 'Europe/Berlin', 'YYYY-MM-DD') = ${today} OR (kind = 'pr' AND week_start = ${weekStart}::date)
          ORDER BY id`,
    ),
  ]);
  const all = evs.map(toEvent);
  const todayEvents = all.filter((e) => berlinDay(e.awardedAt) === today);
  const total = n(agg[0]?.total) ?? 0;
  return {
    total, week: n(agg[0]?.week) ?? 0, weekStart, level: levelFor(total),
    today: todayEvents, todayXp: todayEvents.reduce((a, e) => a + e.xp, 0),
    prsThisWeek: all.filter((e) => e.kind === "pr" && e.weekStart === weekStart),
  };
}

// ---------------------------------------------------------------------------
// Baselines: 0 % of each boss bar, set once
// ---------------------------------------------------------------------------

export type BaselineKey = "bench" | "pullup_bw" | "dip" | "squat" | "waist" | "weight";
export type Baseline = { key: BaselineKey; value: number; day: string; mode: string };
export const BASELINE_WINDOW_DAYS = 14;

export async function readBaselines(db: Db): Promise<Map<BaselineKey, Baseline>> {
  const rs = await rows<{ lift_key: BaselineKey; value: unknown; day: unknown; mode: string }>(db, sql`SELECT lift_key, value::float8 AS value, day::text AS day, mode FROM coach_lift_baselines`);
  return new Map(rs.map((r) => [r.lift_key, { key: r.lift_key, value: n(r.value) ?? 0, day: String(r.day).slice(0, 10), mode: r.mode }]));
}

// Lift baseline from rows up to the end of the window: best of the first 14 plan
// days, else the best set of the last session before the plan start. Null while
// the window is still open and nothing can be final yet is the caller's call.
export function liftBaselineFrom(lift: (typeof LEAD_LIFTS)[number], lead: LeadSetRow[]): { value: number; day: string } | null {
  const windowEnd = addDays(PLAN.start, BASELINE_WINDOW_DAYS);
  const inWindow = bestOf(lift, lead.filter((r) => r.day >= PLAN.start && r.day < windowEnd));
  if (inWindow) return { value: inWindow.value, day: inWindow.day };
  const before = lead.filter((r) => r.day < PLAN.start && lift.templateIds.includes(r.templateId));
  if (!before.length) return null;
  const lastId = before[before.length - 1].workoutId;
  const last = bestOf(lift, before.filter((r) => r.workoutId === lastId));
  return last ? { value: last.value, day: last.day } : null;
}

// Persist the baselines that can be final now; never overwrite. Lifts wait for
// the 14-day window to close, waist takes the first measurement of the window
// (else the last before the start, once the window closed), weight is the
// 7-day mean on the plan start (else the plan constant). Returns the keys written.
export async function setBaselines(db: Db, now = new Date()): Promise<BaselineKey[]> {
  const today = berlinDay(now);
  if (today < PLAN.start) return [];
  const have = await readBaselines(db);
  const windowEnd = addDays(PLAN.start, BASELINE_WINDOW_DAYS);
  const closed = today >= windowEnd;
  const out: Baseline[] = [];

  const lifts = LEAD_LIFTS.filter((l) => l.boss && !have.has(l.key as BaselineKey));
  if (lifts.length && closed) {
    const lead = await leadSets(db, undefined, berlinMidnight(windowEnd));
    for (const lift of lifts) {
      const b = liftBaselineFrom(lift, lead);
      if (b) out.push({ key: lift.key as BaselineKey, value: b.value, day: b.day, mode: lift.mode });
    }
  }
  if (!have.has("waist")) {
    const first = await rows<{ day: unknown; cm: unknown }>(
      db,
      sql`SELECT date::text AS day, waist_cm::float8 AS cm FROM hevy_measurements
          WHERE waist_cm IS NOT NULL AND date >= ${PLAN.start}::date AND date < ${windowEnd}::date ORDER BY date LIMIT 1`,
    );
    let pick = first[0];
    if (!pick && closed) {
      const before = await rows<{ day: unknown; cm: unknown }>(
        db,
        sql`SELECT date::text AS day, waist_cm::float8 AS cm FROM hevy_measurements WHERE waist_cm IS NOT NULL AND date < ${PLAN.start}::date ORDER BY date DESC LIMIT 1`,
      );
      pick = before[0];
    }
    if (pick && n(pick.cm) !== null) out.push({ key: "waist", value: n(pick.cm)!, day: String(pick.day).slice(0, 10), mode: "cm" });
  }
  if (!have.has("weight")) {
    const wt = await weightTrend(db, 1, endOfDay(PLAN.start));
    out.push({ key: "weight", value: wt.latestAvg7 ?? WEIGHT_GOAL.startKg, day: PLAN.start, mode: "kg" });
  }
  if (!out.length) return [];
  const values = sql.join(out.map((b) => sql`(${b.key}, ${String(b.value)}::numeric, ${b.day}::date, ${b.mode})`), sql`, `);
  const ins = await rows<{ lift_key: BaselineKey }>(
    db,
    sql`INSERT INTO coach_lift_baselines (lift_key, value, day, mode) VALUES ${values} ON CONFLICT (lift_key) DO NOTHING RETURNING lift_key`,
  );
  return ins.map((r) => r.lift_key);
}
