// Hard-coded defaults for the plan "Kraft & Figur Q4 2026" (scratchpad 23-plan-entwurf).
// TODO(coach_plans): once coach_plans rows exist, the dashboard reads sets_target,
// week_start and the lead lifts from there and these constants become the fallback.

export const PLAN = {
  name: "Kraft & Figur Q4 2026",
  title: "KRAFT & FIGUR Q4",
  start: "2026-10-05", // Monday, KW 41
  end: "2026-12-27", // Sunday, KW 52
  weeks: 12,
  bossWeekLabel: "KW 52",
  kcalTarget: 2300, // kcal/day
} as const;

// Weight goal: linear line from the start weight to the target, in kg.
export const WEIGHT_GOAL = {
  startDay: "2026-10-05",
  startKg: 92.6,
  endDay: "2026-12-27",
  endKg: 88.0,
  bossMaxKg: 88.5, // boss: <= 88.5 kg in the 7-day mean of KW 52
} as const;

// Body weight used as system load for weighted calisthenics (pull-up, dip).
// TODO(coach_goals): take the current 7-day mean once the goal store is live.
export const BODYWEIGHT_KG = 92.6;

// Muscle groups in display order with weekly set targets (full volume, weeks 3-11).
export type MuscleKey =
  | "brust"
  | "lat"
  | "oberer_ruecken"
  | "schultern"
  | "bizeps"
  | "trizeps"
  | "quads"
  | "hamstrings_glutes"
  | "waden"
  | "core";

export const MUSCLE_GROUPS: { key: MuscleKey; label: string; target: number }[] = [
  { key: "brust", label: "Brust", target: 15 },
  { key: "lat", label: "Lat", target: 12 },
  { key: "oberer_ruecken", label: "Oberer Rücken", target: 6 },
  { key: "schultern", label: "Schultern", target: 10 },
  { key: "bizeps", label: "Bizeps", target: 5 },
  { key: "trizeps", label: "Trizeps", target: 6 },
  { key: "quads", label: "Quads", target: 10 },
  { key: "hamstrings_glutes", label: "Hamstrings/Glutes", target: 12 },
  { key: "waden", label: "Waden", target: 4 },
  { key: "core", label: "Core", target: 6 },
];

export const SETS_TARGET: Record<MuscleKey, number> = Object.fromEntries(
  MUSCLE_GROUPS.map((g) => [g.key, g.target]),
) as Record<MuscleKey, number>;
export const SETS_TARGET_TOTAL = MUSCLE_GROUPS.reduce((a, g) => a + g.target, 0); // 86

// HEVY primary_muscle_group → plan muscle group. Unmapped groups (cardio, forearms,
// lower_back, ...) are reported under "sonstiges" and not compared to a target.
export const HEVY_MUSCLE_MAP: Record<string, MuscleKey> = {
  chest: "brust",
  lats: "lat",
  upper_back: "oberer_ruecken",
  traps: "oberer_ruecken",
  shoulders: "schultern",
  biceps: "bizeps",
  triceps: "trizeps",
  quadriceps: "quads",
  hamstrings: "hamstrings_glutes",
  glutes: "hamstrings_glutes",
  calves: "waden",
  abdominals: "core",
};

// Lead lifts with their HEVY template ids and the interim boss (KW 52).
// `mode` picks the main number: "e1rm" (Epley on the logged weight), "reps"
// (max reps in the LAST set of the exercise in a session, un-weighted
// calisthenics) or "added" (added weight × reps; e1RM is computed on the system
// load added weight + BODYWEIGHT_KG and shown as secondary).
export type LiftMode = "e1rm" | "reps" | "added";
export type LeadLift = {
  key: string;
  title: string;
  short: string;
  templateIds: string[];
  mode: LiftMode;
  boss: { weightKg: number; reps: number } | null; // interim boss KW 52
  endBoss: string | null; // final boss March 2027, display only
};

export const LEAD_LIFTS: LeadLift[] = [
  { key: "bench", title: "Langhantel-Bankdrücken", short: "Bank", templateIds: ["79D0BB3A"], mode: "e1rm", boss: { weightKg: 90, reps: 3 }, endBoss: "100 kg × 1 (Endmission März 2027)" },
  { key: "pullup_bw", title: "Klimmzug ohne Zusatz", short: "Klimmzüge", templateIds: ["1B2B1E7C"], mode: "reps", boss: { weightKg: 0, reps: 16 }, endBoss: "20 am Stück (Endmission März 2027)" },
  { key: "pullup", title: "Klimmzug gewichtet", short: "Klimmzug +kg", templateIds: ["729237D1"], mode: "added", boss: null, endBoss: null },
  { key: "dip", title: "Brust Dip gewichtet", short: "Dips", templateIds: ["29472BE1"], mode: "added", boss: { weightKg: 17.5, reps: 8 }, endBoss: null },
  { key: "squat", title: "Squat (Smith Machine)", short: "Squat", templateIds: ["DDCC3821"], mode: "e1rm", boss: { weightKg: 90, reps: 6 }, endBoss: null },
  { key: "isobench", title: "Iso-Lat Bankdrücken", short: "Iso-Bank", templateIds: ["24706DCD"], mode: "e1rm", boss: null, endBoss: null },
];

// Final bosses (March 2027), display only.
export const END_BOSS = [
  { label: "Bankdrücken", target: "100 kg × 1" },
  { label: "Klimmzüge", target: "20 am Stück" },
] as const;

// Boss goals that are not lifts (shown on the boss card as text).
export const BOSS_OTHER = [
  { label: "Taille", target: "−4 cm" },
  { label: "Gewicht", target: "≤ 88,5 kg" },
] as const;

// Week of the plan for a day: 0 before the start, 1..12 inside, 13+ after.
export function planWeek(day: string): number {
  const [y, m, d] = day.split("-").map(Number);
  const [sy, sm, sd] = PLAN.start.split("-").map(Number);
  const diff = Math.round((Date.UTC(y, m - 1, d) - Date.UTC(sy, sm - 1, sd)) / 86_400_000);
  if (diff < 0) return 0;
  return Math.floor(diff / 7) + 1;
}

// ---------------------------------------------------------------------------
// Week slots and HEVY routines
// ---------------------------------------------------------------------------

export type RoutineKey = "PUSH" | "LEGS" | "PULL" | "CALI";
export type SlotKey = RoutineKey | "LAUF";

// HEVY routine ids of the plan. The Sunday progression routine rewrites the
// title suffix ("n/12 Wochen") every week, so only the prefix is relied on
// (routineKeyOf); the titles here are display labels.
export const HEVY_ROUTINES: Record<RoutineKey, { id: string; title: string }> = {
  PUSH: { id: "b6c5be28-a608-4374-9a35-35a28d79ed19", title: "PUSH (Mo) · Kraft & Figur" },
  PULL: { id: "61a8acd6-9385-4688-b066-09392d19332c", title: "PULL (Di) · Kraft & Figur" },
  LEGS: { id: "ff21bce4-2630-4a29-951d-0b080406445e", title: "LEGS + Finisher (Fr) · Kraft & Figur" },
  CALI: { id: "082aba2c-f143-492c-8b6a-3adaafbbb20b", title: "CALISTHENICS-OK (Sa) · Kraft & Figur" },
};

// [ANNAHME] HEVY deep link scheme. Rendered as a plain <a>, so a phone without
// the app (or a different scheme) only gets a dead tap, never a broken page.
export function hevyRoutineLink(id: string): string {
  return `hevy://routine/${id}`;
}

// The six plan slots of a week: Mo PUSH, Di PULL, Mi LAUF (locker, mit Kollege),
// Do frei, Fr LEGS + Hyrox-Finisher, Sa CALI, So LAUF (locker, nur bei grüner
// Ampel). Thursday is the weekday rest day; legs are trained once a week.
export const WEEK_SLOTS: { key: SlotKey; weekday: number }[] = [
  { key: "PUSH", weekday: 0 },
  { key: "PULL", weekday: 1 },
  { key: "LAUF", weekday: 2 },
  { key: "LEGS", weekday: 4 },
  { key: "CALI", weekday: 5 },
  { key: "LAUF", weekday: 6 },
];

// A strength session counts (XP, slot) from this many working sets; a run from
// this many minutes.
export const SESSION_MIN_SETS = 10;
export const RUN_MIN_MINUTES = 20;

const ROUTINE_ID_TO_KEY: Record<string, RoutineKey> = Object.fromEntries(
  (Object.keys(HEVY_ROUTINES) as RoutineKey[]).map((k) => [HEVY_ROUTINES[k].id, k]),
);

// HEVY workout → routine key. routine_id (if HEVY ever sends it in `raw`) wins,
// then the title prefix (workouts started from a routine carry its title), then
// keywords for the older titles ("Push - A", "Lower A", "Upper (Calisthenics)").
// [ANNAHME] "Upper" is mapped to PUSH; the old upper-body sessions have no slot of
// their own.
export function routineKeyOf(title: string | null | undefined, routineId?: string | null): RoutineKey | null {
  if (routineId && ROUTINE_ID_TO_KEY[routineId]) return ROUTINE_ID_TO_KEY[routineId];
  const t = (title ?? "").trim().toLowerCase();
  if (!t) return null;
  for (const k of ["push", "legs", "pull", "cali"] as const) {
    if (t.startsWith(k)) return k === "cali" ? "CALI" : (k.toUpperCase() as RoutineKey);
  }
  if (t.includes("calisthenics")) return "CALI";
  if (t.includes("push")) return "PUSH";
  if (t.includes("lower") || t.includes("legs") || t.includes("beine")) return "LEGS";
  if (t.includes("pull")) return "PULL";
  if (t.includes("upper")) return "PUSH";
  return null;
}

// Epley estimate of the one-rep max. Returns the load itself for a single rep.
export function epley(load: number, reps: number): number {
  if (reps <= 1) return load;
  return load * (1 + reps / 30);
}
