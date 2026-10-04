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
  { key: "bench", title: "Langhantel-Bankdrücken", short: "Bank", templateIds: ["79D0BB3A"], mode: "e1rm", boss: { weightKg: 90, reps: 3 }, endBoss: "100 kg × 1 (März 2027)" },
  { key: "pullup_bw", title: "Klimmzug ohne Zusatz", short: "Klimmzüge", templateIds: ["1B2B1E7C"], mode: "reps", boss: { weightKg: 0, reps: 16 }, endBoss: "20 am Stück (März 2027)" },
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

// Epley estimate of the one-rep max. Returns the load itself for a single rep.
export function epley(load: number, reps: number): number {
  if (reps <= 1) return load;
  return load * (1 + reps / 30);
}
