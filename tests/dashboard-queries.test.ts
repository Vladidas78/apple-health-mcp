import { describe, it, expect } from "vitest";
import { sql } from "drizzle-orm";
import { makeTestDb, type TestDb } from "./helpers/db";
import { metricSamples, workouts, hevyWorkouts, hevySets, hevyExerciseTemplates, hevyMeasurements, coachWeeks } from "@/db/schema";
import {
  weightTrend, goalAt, recovery, ampelFrom, trainingWeek, leadLifts, measurements, runWeek, weeklyVolume, lastHevySync,
  type RecoveryMetric,
} from "@/lib/dashboard/queries";
import { addDays, berlinDay, berlinMidnight, weekStartOf, isoWeek, weekdayIndex } from "@/lib/dashboard/time";

// Fixed "now": Sunday 2026-10-04 12:00 Berlin (CEST = UTC+2). Week starts Mon 28.09.
const NOW = new Date("2026-10-04T10:00:00Z");
const TODAY = "2026-10-04";
const WEEK = "2026-09-28";

async function sample(db: TestDb, metric: string, iso: string, v: Partial<{ qty: number; avg: number; extra: object }>) {
  await db.insert(metricSamples).values({
    metricName: metric, date: new Date(iso), source: "watch",
    qty: v.qty !== undefined ? String(v.qty) : null, avg: v.avg !== undefined ? String(v.avg) : null, extra: v.extra ?? null,
  });
}

async function hevyWorkout(db: TestDb, id: string, title: string, startIso: string, minutes: number,
  exercises: { template: string; title?: string; sets: { kg?: number | null; reps: number; type?: string }[] }[]) {
  const start = new Date(startIso);
  await db.insert(hevyWorkouts).values({ id, title, startTime: start, endTime: new Date(start.getTime() + minutes * 60_000), updatedAt: start, raw: {}, syncedAt: new Date("2026-10-04T02:00:00Z") });
  const rows: (typeof hevySets.$inferInsert)[] = [];
  exercises.forEach((ex, ei) => ex.sets.forEach((s, si) => rows.push({
    workoutId: id, exerciseIndex: ei, setIndex: si, templateId: ex.template, exerciseTitle: ex.title ?? ex.template,
    setType: s.type ?? "normal", weightKg: s.kg === undefined || s.kg === null ? null : String(s.kg), reps: s.reps,
  })));
  if (rows.length) await db.insert(hevySets).values(rows);
}

async function templates(db: TestDb) {
  await db.insert(hevyExerciseTemplates).values([
    { id: "79D0BB3A", title: "Bankdrücken (LH)", primaryMuscleGroup: "chest", raw: {} },
    { id: "1B2B1E7C", title: "Klimmzug", primaryMuscleGroup: "lats", raw: {} },
    { id: "729237D1", title: "Klimmzug (gewichtet)", primaryMuscleGroup: "lats", raw: {} },
    { id: "29472BE1", title: "Brust Dip (gewichtet)", primaryMuscleGroup: "chest", raw: {} },
    { id: "DDCC3821", title: "Squat (Smith)", primaryMuscleGroup: "quadriceps", raw: {} },
    { id: "24706DCD", title: "Iso-Lat Bankdrücken", primaryMuscleGroup: "chest", raw: {} },
    { id: "B8127AD1", title: "Beinbeugen", primaryMuscleGroup: "hamstrings", raw: {} },
    { id: "0222DB42", title: "Rudermaschine", primaryMuscleGroup: "cardio", raw: {} },
  ]);
}

describe("time helpers (Europe/Berlin)", () => {
  it("buckets days and weeks in Berlin time", () => {
    expect(berlinDay(new Date("2026-10-03T22:30:00Z"))).toBe("2026-10-04"); // 00:30 CEST
    expect(berlinMidnight("2026-10-04").toISOString()).toBe("2026-10-03T22:00:00.000Z");
    expect(berlinMidnight("2026-12-01").toISOString()).toBe("2026-11-30T23:00:00.000Z"); // CET
    expect(weekStartOf(NOW)).toBe(WEEK);
    expect(weekdayIndex("2026-10-05")).toBe(0);
    expect(isoWeek("2026-10-05")).toBe(41);
    expect(isoWeek("2026-12-27")).toBe(52);
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
  });
});

describe("weightTrend", () => {
  it("mixes HEVY and Apple Health per day, HEVY wins, 7-day mean needs 3 values", async () => {
    const db = await makeTestDb();
    // Apple Health on 01.10. (will be overridden by HEVY) and 03.10.
    await sample(db, "weight_body_mass", "2026-10-01T05:00:00Z", { qty: 93.4 });
    await sample(db, "weight_body_mass", "2026-10-03T05:00:00Z", { qty: 92.9 });
    await db.insert(hevyMeasurements).values([
      { date: "2026-10-01", weightKg: "93.0", raw: {} },
      { date: "2026-09-29", weightKg: "93.6", raw: {} },
      { date: "2026-10-04", weightKg: "92.6", raw: {} },
    ]);
    const t = await weightTrend(db, 8, NOW);
    expect(t.from).toBe("2026-08-10");
    expect(t.to).toBe(TODAY);
    expect(t.points.map((p) => [p.day, p.kg, p.source])).toEqual([
      ["2026-09-29", 93.6, "hevy"], ["2026-10-01", 93, "hevy"], ["2026-10-03", 92.9, "health"], ["2026-10-04", 92.6, "hevy"],
    ]);
    expect(t.avg7).toHaveLength(56);
    const at = (d: string) => t.avg7.find((a) => a.day === d)!.kg;
    expect(at("2026-09-30")).toBeNull(); // only 1 value in the window
    expect(at("2026-10-01")).toBeNull(); // 2 values
    expect(at("2026-10-03")).toBe(93.2); // 93.6, 93.0, 92.9
    expect(at(TODAY)).toBe(93.0); // 93.6, 93.0, 92.9, 92.6 → 93.025 → 93.0
    expect(t.latestAvg7).toBe(93.0);
    expect(t.latest).toEqual({ day: TODAY, kg: 92.6, source: "hevy" });
    expect(t.goalToday).toBeNull(); // plan starts 05.10.
  });

  it("goal line is linear from 92.6 to 88.0", () => {
    expect(goalAt("2026-10-04")).toBeNull();
    expect(goalAt("2026-10-05")).toBe(92.6);
    expect(goalAt("2026-12-27")).toBe(88);
    expect(goalAt("2026-11-15")).toBeCloseTo(92.6 - 4.6 * (41 / 83), 1);
  });

  it("is empty without data", async () => {
    const db = await makeTestDb();
    const t = await weightTrend(db, 8, NOW);
    expect(t.points).toEqual([]);
    expect(t.latestAvg7).toBeNull();
    expect(t.avg7.every((a) => a.kg === null)).toBe(true);
  });
});

describe("recovery", () => {
  const m = (today: number | null, mean7: number | null, baselineDays = 28): RecoveryMetric => ({ today, todayDay: today === null ? null : TODAY, mean7, baseline28: mean7, baselineDays });

  it("ampel rule: gruen / gelb (one signal) / stopp (both hard) / unbekannt", () => {
    expect(ampelFrom(m(56, 55), m(70, 68)).ampel).toBe("gruen");
    expect(ampelFrom(m(62, 55), m(70, 68)).ampel).toBe("gelb"); // RHR +7
    expect(ampelFrom(m(56, 55), m(50, 68)).ampel).toBe("gelb"); // HRV 74 %
    expect(ampelFrom(m(67, 55), m(70, 68)).ampel).toBe("gelb"); // RHR +12 alone is only one signal
    expect(ampelFrom(m(67, 55), m(44, 64)).ampel).toBe("stopp"); // RHR +12 AND HRV 69 %
    expect(ampelFrom(m(null, 55), m(null, 68)).ampel).toBe("unbekannt");
    expect(ampelFrom(m(null, 55), m(70, 68)).ampel).toBe("gruen"); // one metric missing is neutral
  });

  it("caps stopp to gelb until the 28-day baseline is complete", () => {
    const r = ampelFrom(m(67, 55, 10), m(44, 64, 10));
    expect(r.ampel).toBe("gelb");
    expect(r.baselineComplete).toBe(false);
    expect(r.reasons.join()).toMatch(/Baseline 10\/28/);
  });

  it("loads RHR, night HRV, sleep and a 36 h gap rule from the samples", async () => {
    const db = await makeTestDb();
    // RHR for the last 40 days: 55, today 62.
    for (let i = 1; i <= 40; i++) await sample(db, "resting_heart_rate", `${addDays(TODAY, -i)}T07:00:00Z`, { qty: 55 });
    await sample(db, "resting_heart_rate", `${TODAY}T06:00:00Z`, { qty: 62 });
    // HRV: night samples (02:00 and 04:00 UTC = 04:00/06:00 CEST) at 68, a day sample at 08:00 UTC (10:00 CEST) at 120 must be ignored.
    for (let i = 0; i <= 10; i++) {
      const d = addDays(TODAY, -i);
      await sample(db, "heart_rate_variability", `${d}T02:00:00Z`, { avg: i === 0 ? 60 : 68 });
      await sample(db, "heart_rate_variability", `${d}T04:00:00Z`, { avg: i === 0 ? 60 : 68 });
      await sample(db, "heart_rate_variability", `${d}T08:00:00Z`, { avg: 120 });
    }
    await sample(db, "sleep_analysis", `${TODAY}T05:30:00Z`, { extra: { totalSleep: 6.8 } });
    const r = await recovery(db, NOW);
    expect(r.rhr.today).toBe(62);
    expect(r.rhr.mean7).toBe(56); // 62 + 6×55 = 392 / 7
    expect(r.rhr.baseline28).toBe(55);
    expect(r.rhr.baselineDays).toBe(28);
    expect(r.hrv.today).toBe(60);
    expect(r.hrv.mean7).toBe(66.9); // (60 + 6×68)/7 = 66.86
    expect(r.hrv.baselineDays).toBe(4); // days -7 … -10 only
    expect(r.sleep).toEqual({ hours: 6.8, day: TODAY });
    expect(r.ampel).toBe("gelb"); // RHR +6 → one signal
    expect(r.baselineComplete).toBe(false);
  });

  it("stale values (older than 36 h) are unknown", async () => {
    const db = await makeTestDb();
    for (let i = 2; i <= 10; i++) await sample(db, "resting_heart_rate", `${addDays(TODAY, -i)}T07:00:00Z`, { qty: 55 });
    await sample(db, "sleep_analysis", `${addDays(TODAY, -3)}T05:30:00Z`, { extra: { totalSleep: 7.1 } });
    const r = await recovery(db, NOW);
    expect(r.rhr.today).toBeNull();
    expect(r.rhr.mean7).toBe(55);
    expect(r.sleep.hours).toBeNull();
    expect(r.ampel).toBe("unbekannt");
  });

  it("is unknown on an empty database", async () => {
    const db = await makeTestDb();
    const r = await recovery(db, NOW);
    expect(r.ampel).toBe("unbekannt");
    expect(r.rhr.mean7).toBeNull();
    expect(r.sleep.hours).toBeNull();
  });
});

describe("trainingWeek", () => {
  it("lists sessions Mo–So and counts sets per muscle group against the plan target", async () => {
    const db = await makeTestDb();
    await templates(db);
    await hevyWorkout(db, "w1", "Push", "2026-09-28T04:00:00Z", 55, [
      { template: "79D0BB3A", sets: [{ kg: 60, reps: 8, type: "warmup" }, { kg: 80, reps: 6 }, { kg: 80, reps: 6 }, { kg: 80, reps: 5 }] },
      { template: "29472BE1", sets: [{ kg: 10, reps: 8 }, { kg: 10, reps: 8 }] },
      { template: "0222DB42", sets: [{ kg: null, reps: 0 }] },
    ]);
    await hevyWorkout(db, "w2", "Legs", "2026-09-30T04:00:00Z", 60, [
      { template: "DDCC3821", sets: [{ kg: 70, reps: 8 }, { kg: 70, reps: 8 }] },
      { template: "B8127AD1", sets: [{ kg: 70, reps: 10 }] },
      { template: "UNKNOWN", sets: [{ kg: 20, reps: 10 }] },
    ]);
    // Sunday 04.10. 23:30 CEST = 21:30Z still belongs to this week; Monday 05.10. 00:30 CEST does not.
    await hevyWorkout(db, "w3", "Pull", "2026-10-04T21:30:00Z", 40, [{ template: "1B2B1E7C", sets: [{ reps: 10 }] }]);
    await hevyWorkout(db, "w4", "Next", "2026-10-04T22:30:00Z", 40, [{ template: "1B2B1E7C", sets: [{ reps: 10 }] }]);
    const t = await trainingWeek(db, WEEK);
    expect(t.sessions.map((s) => [s.title, s.weekday, s.minutes, s.sets])).toEqual([["Push", 0, 55, 6], ["Legs", 2, 60, 4], ["Pull", 6, 40, 1]]);
    expect(t.days[0][0].title).toBe("Push");
    expect(t.days[1]).toEqual([]);
    expect(t.totalSets).toBe(11);
    const by = Object.fromEntries(t.muscles.map((m) => [m.key, m.sets]));
    expect(by.brust).toBe(5); // 3 bench + 2 dips, warmup excluded
    expect(by.quads).toBe(2);
    expect(by.hamstrings_glutes).toBe(1);
    expect(by.lat).toBe(1);
    expect(by.sonstiges).toBe(2); // cardio + unknown template
    expect(t.muscles.find((m) => m.key === "brust")!.target).toBe(15);
    expect(t.muscles.find((m) => m.key === "sonstiges")!.target).toBeNull();
  });

  it("is empty for a week without workouts", async () => {
    const db = await makeTestDb();
    const t = await trainingWeek(db, WEEK);
    expect(t.sessions).toEqual([]);
    expect(t.days.every((d) => d.length === 0)).toBe(true);
    expect(t.muscles).toHaveLength(10);
    expect(t.muscles.every((m) => m.sets === 0)).toBe(true);
  });
});

describe("leadLifts", () => {
  it("best set per week per mode: e1RM, last-set reps, added weight with system load", async () => {
    const db = await makeTestDb();
    await templates(db);
    await hevyWorkout(db, "a", "Push", "2026-09-21T04:00:00Z", 60, [
      { template: "79D0BB3A", sets: [{ kg: 80, reps: 6 }, { kg: 85, reps: 3 }] },
      { template: "1B2B1E7C", sets: [{ reps: 12 }, { reps: 10 }, { reps: 8 }] },
      { template: "729237D1", sets: [{ kg: 5, reps: 8 }, { kg: 7.5, reps: 6 }] },
    ]);
    await hevyWorkout(db, "b", "Push", "2026-09-29T04:00:00Z", 60, [
      { template: "79D0BB3A", sets: [{ kg: 60, reps: 10, type: "warmup" }, { kg: 82.5, reps: 5 }] },
      { template: "1B2B1E7C", sets: [{ reps: 14 }, { reps: 11 }] },
    ]);
    const lifts = await leadLifts(db, 12, NOW);
    expect(lifts.map((l) => l.key)).toEqual(["bench", "pullup_bw", "pullup", "dip", "squat", "isobench"]);
    expect(lifts[0].weeks).toHaveLength(12);
    expect(lifts[0].weeks[0].weekStart).toBe("2026-07-13");
    expect(lifts[0].weeks[11].weekStart).toBe(WEEK);

    const bench = lifts[0];
    expect(bench.mode).toBe("e1rm");
    const wA = bench.weeks.find((w) => w.weekStart === "2026-09-21")!.best!;
    expect(wA).toMatchObject({ weightKg: 80, reps: 6, e1rm: 96, value: 96 }); // 80×1.2 = 96 > 85×1.1 = 93.5
    expect(bench.latest).toMatchObject({ weightKg: 82.5, reps: 5, e1rm: 96.3 });
    expect(bench.boss).toEqual({ weightKg: 90, reps: 3, e1rm: 99, value: 99 });
    expect(bench.endBoss).toMatch(/100 kg/);

    const pu = lifts[1];
    expect(pu.mode).toBe("reps");
    expect(pu.unit).toBe("Wdh");
    expect(pu.weeks.find((w) => w.weekStart === "2026-09-21")!.best!.value).toBe(8); // last set, not the max set
    expect(pu.latest!.value).toBe(11);
    expect(pu.boss!.value).toBe(16);

    const wpu = lifts[2];
    expect(wpu.mode).toBe("added");
    const best = wpu.weeks.find((w) => w.weekStart === "2026-09-21")!.best!;
    expect(best.value).toBe(7.5); // added weight is the main number
    expect(best.systemLoad).toBe(100.1); // 7.5 + 92.6
    expect(best.e1rm).toBe(120.1); // 100.1 × 1.2
    expect(wpu.boss).toBeNull();
    expect(wpu.weeks.filter((w) => w.best).length).toBe(1);

    expect(lifts[3].boss).toMatchObject({ weightKg: 17.5, reps: 8 });
    expect(lifts[4].latest).toBeNull();
  });

  it("returns 12 empty weeks per lift without data", async () => {
    const db = await makeTestDb();
    const lifts = await leadLifts(db, 12, NOW);
    expect(lifts).toHaveLength(6);
    expect(lifts.every((l) => l.latest === null && l.weeks.length === 12)).toBe(true);
  });
});

describe("measurements", () => {
  it("returns the last three rows with deltas against the oldest", async () => {
    const db = await makeTestDb();
    await db.insert(hevyMeasurements).values([
      { date: "2026-09-01", weightKg: "94.0", waistCm: "96", raw: {} },
      { date: "2026-09-15", weightKg: "93.5", waistCm: "95.5", chestCm: "108", raw: {} },
      { date: "2026-10-01", weightKg: "93.0", waistCm: "95", raw: {} },
      { date: "2026-10-04", weightKg: "92.6", raw: {} },
    ]);
    const m = await measurements(db);
    expect(m.rows.map((r) => r.day)).toEqual(["2026-10-04", "2026-10-01", "2026-09-15"]);
    expect(m.deltas).toEqual({ weightKg: -0.9, waistCm: null, chestCm: null, bicepCm: null });
    expect(m.hasCircumference).toBe(true);
  });
  it("flags missing circumferences and handles one or zero rows", async () => {
    const db = await makeTestDb();
    expect(await measurements(db)).toEqual({ rows: [], deltas: null, hasCircumference: false });
    await db.insert(hevyMeasurements).values({ date: "2026-10-04", weightKg: "92.6", raw: {} });
    const m = await measurements(db);
    expect(m.rows).toHaveLength(1);
    expect(m.deltas).toBeNull();
    expect(m.hasCircumference).toBe(false);
  });
});

describe("runWeek", () => {
  it("cross-checks running days from samples with Apple Health workouts; coach_weeks empty", async () => {
    const db = await makeTestDb();
    await sample(db, "running_speed", "2026-10-01T05:00:00Z", { qty: 10 });
    await sample(db, "running_speed", "2026-10-01T05:05:00Z", { qty: 11 });
    await sample(db, "running_speed", "2026-10-03T05:00:00Z", { qty: 10 });
    await sample(db, "running_speed", "2026-09-27T05:00:00Z", { qty: 10 }); // previous week
    await db.insert(workouts).values([
      { id: "r1", name: "Running", start: new Date("2026-10-01T05:00:00Z"), end: new Date("2026-10-01T05:30:00Z"), durationS: "1800", distance: "5.2", distanceUnits: "km", raw: {} },
      { id: "r2", name: "Running", start: new Date("2026-10-03T05:00:00Z"), end: new Date("2026-10-03T05:45:00Z"), durationS: "2700", distance: "8000", distanceUnits: "m", raw: {} },
    ]);
    const r = await runWeek(db, WEEK);
    expect(r.coachWeek).toBeNull();
    expect(r.runDays).toEqual(["2026-10-01", "2026-10-03"]);
    expect(r.appleWorkouts.map((w) => [w.name, w.day, w.minutes, w.km])).toEqual([["Running", "2026-10-01", 30, 5.2], ["Running", "2026-10-03", 45, 8]]);
  });
  it("reads coach_weeks when present", async () => {
    const db = await makeTestDb();
    await db.insert(coachWeeks).values({ weekStart: WEEK, runKm: "12.5", runMinutes: 70, runCount: 2, source: "strava" });
    const r = await runWeek(db, WEEK);
    expect(r.coachWeek).toMatchObject({ runKm: 12.5, runMinutes: 70, runCount: 2, source: "strava" });
  });
});

describe("weeklyVolume + lastHevySync", () => {
  it("sums non-warmup sets per week over 12 weeks, zero-filled", async () => {
    const db = await makeTestDb();
    expect(await lastHevySync(db)).toBeNull();
    await hevyWorkout(db, "a", "A", "2026-09-21T04:00:00Z", 60, [{ template: "x", sets: [{ kg: 1, reps: 1 }, { kg: 1, reps: 1, type: "warmup" }] }]);
    await hevyWorkout(db, "b", "B", "2026-09-23T04:00:00Z", 60, [{ template: "x", sets: [{ kg: 1, reps: 1 }, { kg: 1, reps: 1 }] }]);
    await hevyWorkout(db, "c", "C", "2026-10-04T04:00:00Z", 60, [{ template: "x", sets: [{ kg: 1, reps: 1 }] }]);
    await hevyWorkout(db, "old", "Old", "2026-07-01T04:00:00Z", 60, [{ template: "x", sets: [{ kg: 1, reps: 1 }] }]);
    const v = await weeklyVolume(db, 12, NOW);
    expect(v.weeks).toHaveLength(12);
    expect(v.weeks[0].weekStart).toBe("2026-07-13");
    expect(v.weeks.find((w) => w.weekStart === "2026-09-21")).toEqual({ weekStart: "2026-09-21", sets: 3, sessions: 2 });
    expect(v.weeks[11]).toEqual({ weekStart: WEEK, sets: 1, sessions: 1 });
    expect(v.weeks.reduce((a, w) => a + w.sets, 0)).toBe(4);
    expect((await lastHevySync(db))?.toISOString()).toBe("2026-10-04T02:00:00.000Z");
  });
});

// Guard: the raw SQL must not depend on the driver returning Date objects.
describe("driver neutrality", () => {
  it("to_char day keys are strings in PGlite", async () => {
    const db = await makeTestDb();
    const r = await db.execute(sql`SELECT to_char(now() AT TIME ZONE 'Europe/Berlin', 'YYYY-MM-DD') AS day`);
    expect(typeof (r.rows[0] as { day: unknown }).day).toBe("string");
  });
});
