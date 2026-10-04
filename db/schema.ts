import {
  pgTable,
  bigserial,
  text,
  timestamp,
  numeric,
  jsonb,
  integer,
  date,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

// Every quantitative HealthKit metric (150+ types) flows here generically.
// Branching columns cover the three HAE point shapes: scalar (qty),
// heart-rate-style (min/avg/max), and blood pressure (systolic/diastolic).
export const metricSamples = pgTable(
  "metric_samples",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    metricName: text("metric_name").notNull(),
    units: text("units"),
    date: timestamp("date", { withTimezone: true }).notNull(),
    qty: numeric("qty"),
    min: numeric("min"),
    avg: numeric("avg"),
    max: numeric("max"),
    systolic: numeric("systolic"),
    diastolic: numeric("diastolic"),
    source: text("source"),
    extra: jsonb("extra"),
  },
  (t) => [
    // Idempotency: HAE re-pushes overlapping windows. A sample is identified by
    // (metric, timestamp, source).
    uniqueIndex("metric_samples_uq").on(t.metricName, t.date, t.source),
    index("metric_samples_name_date_idx").on(t.metricName, t.date),
  ],
);

// Workout records. Known columns are promoted for querying; the full original
// object is kept in `raw` so nothing is ever lost.
export const workouts = pgTable("workouts", {
  id: text("id").primaryKey(), // HAE workout id → upsert key
  name: text("name"),
  start: timestamp("start", { withTimezone: true }),
  end: timestamp("end", { withTimezone: true }),
  durationS: numeric("duration_s"),
  activeEnergy: numeric("active_energy"),
  activeEnergyUnits: text("active_energy_units"),
  distance: numeric("distance"),
  distanceUnits: text("distance_units"),
  avgHr: numeric("avg_hr"),
  maxHr: numeric("max_hr"),
  stepCount: numeric("step_count"),
  route: jsonb("route"),
  raw: jsonb("raw").notNull(),
});

// Long-tail data types kept generic: ecg (incl. waveform samples), stateOfMind,
// symptoms, medications, cycleTracking, heartRateNotifications.
export const healthEvents = pgTable(
  "health_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    eventType: text("event_type").notNull(),
    date: timestamp("date", { withTimezone: true }).notNull(),
    source: text("source"),
    payload: jsonb("payload").notNull(),
  },
  (t) => [index("health_events_type_date_idx").on(t.eventType, t.date)],
);

// ---------------------------------------------------------------------------
// HEVY mirror (filled by lib/hevy/sync.ts, never written by hand). Natural keys
// from HEVY make every sync run idempotent: upsert by id, delete on "deleted".
// ---------------------------------------------------------------------------

export const hevyWorkouts = pgTable(
  "hevy_workouts",
  {
    id: text("id").primaryKey(), // HEVY workout id
    title: text("title"),
    startTime: timestamp("start_time", { withTimezone: true }),
    endTime: timestamp("end_time", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }), // HEVY's updated_at → events cursor
    raw: jsonb("raw").notNull(),
    syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("hevy_workouts_start_idx").on(t.startTime)],
);

// One row per set. On a workout update all its sets are deleted and re-inserted,
// so (workout_id, exercise_index, set_index) stays unique without diffing.
export const hevySets = pgTable(
  "hevy_sets",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    workoutId: text("workout_id")
      .notNull()
      .references(() => hevyWorkouts.id, { onDelete: "cascade" }),
    exerciseIndex: integer("exercise_index").notNull(),
    setIndex: integer("set_index").notNull(),
    templateId: text("template_id"),
    exerciseTitle: text("exercise_title"),
    setType: text("set_type"), // normal | warmup | dropset | failure
    weightKg: numeric("weight_kg"),
    reps: integer("reps"),
    rpe: numeric("rpe"),
  },
  (t) => [
    uniqueIndex("hevy_sets_uq").on(t.workoutId, t.exerciseIndex, t.setIndex),
    index("hevy_sets_template_idx").on(t.templateId),
  ],
);

// Muscle group hangs on the template, not on the set, so templates are mirrored.
export const hevyExerciseTemplates = pgTable("hevy_exercise_templates", {
  id: text("id").primaryKey(),
  title: text("title"),
  primaryMuscleGroup: text("primary_muscle_group"),
  raw: jsonb("raw").notNull(),
  syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
});

// Body measurements from HEVY, one row per calendar day (latest wins).
export const hevyMeasurements = pgTable("hevy_measurements", {
  date: date("date").primaryKey(),
  weightKg: numeric("weight_kg"),
  waistCm: numeric("waist_cm"),
  chestCm: numeric("chest_cm"),
  bicepCm: numeric("bicep_cm"),
  raw: jsonb("raw").notNull(),
  syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Coach state (written by the coach MCP tools, read by the dashboard). Every
// table has a natural primary key so each write tool is an upsert, never a
// duplicate on retry.
// ---------------------------------------------------------------------------

export const coachGoals = pgTable("coach_goals", {
  key: text("key").primaryKey(), // e.g. "weight-2026-12-27"
  kind: text("kind").notNull(), // weight | e1rm | run | boss
  metric: text("metric"),
  baseline: numeric("baseline"),
  baselineDate: date("baseline_date"),
  target: numeric("target"),
  due: date("due"),
  status: text("status").notNull().default("active"), // active | done | dropped
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Weekly targets, written BEFORE the week; changes after week_start need a reason.
export const coachPlans = pgTable("coach_plans", {
  weekStart: date("week_start").primaryKey(), // Monday, Europe/Berlin
  split: jsonb("split"),
  setsTarget: jsonb("sets_target"), // { [muscleGroup]: sets }
  runMinutesTarget: integer("run_minutes_target"),
  hardSessionsTarget: integer("hard_sessions_target"),
  source: text("source").notNull(), // coach | brake | user
  reason: text("reason"),
  hevyRoutineIds: jsonb("hevy_routine_ids"), // { push, pull, legs, calisthenics }
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// One assessment per week (upsert), so Monday routine + manual run = one row.
export const coachAssessments = pgTable("coach_assessments", {
  weekStart: date("week_start").primaryKey(),
  scoreVersion: integer("score_version").notNull(),
  score: numeric("score"),
  ampel: text("ampel"), // gruen | gelb | rot
  flags: jsonb("flags"),
  metrics: jsonb("metrics"),
  text: text("text"),
  inputHash: text("input_hash"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Running aggregates per week (Strava stays in the Claude context; only
// aggregates are written here). Upsert by week_start so mid-week updates work.
export const coachWeeks = pgTable("coach_weeks", {
  weekStart: date("week_start").primaryKey(),
  runKm: numeric("run_km"),
  runMinutes: integer("run_minutes"),
  runCount: integer("run_count"),
  hardSessions: integer("hard_sessions"),
  z2Minutes: integer("z2_minutes"),
  source: text("source"), // strava | manual
  note: text("note"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// XP ledger (written by lib/coach/xp.ts, read by the dashboard). Append-only:
// the sync runs many times, workouts get edited or deleted, history gets
// re-imported, and the level must never fall back. (source, source_id, kind) is
// the natural key, every award is INSERT … ON CONFLICT DO NOTHING.
// ---------------------------------------------------------------------------

export const coachXpEvents = pgTable(
  "coach_xp_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    kind: text("kind").notNull(), // session | run | sets_target | pr | stop_day | week_complete
    source: text("source").notNull(), // hevy_workout | health_workout | week | lift | day
    sourceId: text("source_id").notNull(), // workout id, weekStart, weekStart:muscleKey, liftKey:workoutId, day
    xp: integer("xp").notNull(),
    weekStart: date("week_start").notNull(), // Monday, Europe/Berlin
    awardedAt: timestamp("awarded_at", { withTimezone: true }).notNull().defaultNow(),
    meta: jsonb("meta"),
  },
  (t) => [
    uniqueIndex("coach_xp_events_uq").on(t.source, t.sourceId, t.kind),
    index("coach_xp_events_week_idx").on(t.weekStart),
  ],
);

// Boss baselines: 0 % of each boss bar. Set once (best value of the first 14
// plan days, else the last value before the plan start) and never overwritten,
// otherwise the percentage would drift.
export const coachLiftBaselines = pgTable("coach_lift_baselines", {
  liftKey: text("lift_key").primaryKey(), // bench | pullup_bw | dip | squat | waist | weight
  value: numeric("value").notNull(),
  day: date("day").notNull(),
  mode: text("mode").notNull(), // e1rm | reps | added | cm | kg
});
