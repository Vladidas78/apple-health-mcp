import { describe, it, expect } from "vitest";
import { sql } from "drizzle-orm";
import { makeTestDb, xpRows, type TestDb } from "./helpers/db";
import { appleRun, filler, hevyWorkout, sample, templates } from "./helpers/fixtures";
import { hevyMeasurements } from "@/db/schema";
import { LEVELS, XP, awardXp, levelFor, readBaselines, setBaselines, xpLedger } from "@/lib/coach/xp";
import { fillSlots } from "@/lib/coach/slots";
import { HEVY_ROUTINES, PLAN, routineKeyOf } from "@/lib/coach/plan-defaults";
import { addDays } from "@/lib/dashboard/time";

// Plan week 1 = Mo 05.10.–So 11.10.2026 (CEST, UTC+2). "Now" defaults to Sunday
// 11.10. 20:00 Berlin so every session of week 1 lies in the past.
const SUN = new Date("2026-10-11T18:00:00Z");
const W1 = "2026-10-05";
const PUSH = HEVY_ROUTINES.PUSH.title;

const kinds = (rs: { kind: string }[]) => rs.map((r) => r.kind).sort();

async function fullWeek(db: TestDb) {
  await hevyWorkout(db, "push1", PUSH, "2026-10-05T16:00:00Z", 55, [filler("79D0BB3A", 12, 80, 6)]);
  await hevyWorkout(db, "legs1", HEVY_ROUTINES.LEGS.title, "2026-10-06T16:00:00Z", 55, [filler("DDCC3821", 12, 70, 8)]);
  await hevyWorkout(db, "pull1", HEVY_ROUTINES.PULL.title, "2026-10-07T16:00:00Z", 55, [filler("1B2B1E7C", 12, 0, 8)]);
  await appleRun(db, "run1", "2026-10-08T05:30:00Z", 32);
  await hevyWorkout(db, "cali1", HEVY_ROUTINES.CALI.title, "2026-10-09T16:00:00Z", 55, [filler("29472BE1", 12, 5, 8)]);
  await appleRun(db, "run2", "2026-10-10T07:00:00Z", 45, "Outdoor Run", 8.2);
}

describe("levels", () => {
  it("eight thresholds, never decay, progress to the next one", () => {
    expect(LEVELS).toHaveLength(8);
    expect(levelFor(0)).toEqual({ level: 1, name: "Lehrling", min: 0, next: 500, progress: 0 });
    expect(levelFor(499).level).toBe(1);
    expect(levelFor(500)).toMatchObject({ level: 2, name: "Eisenfresser", next: 1500 });
    expect(levelFor(620).progress).toBeCloseTo(0.12, 5);
    expect(levelFor(1500).level).toBe(3);
    expect(levelFor(13999)).toMatchObject({ level: 7, name: "Kellermeister" });
    expect(levelFor(14000)).toEqual({ level: 8, name: "Eisenpapst", min: 14000, next: null, progress: 1 });
    expect(levelFor(40000).level).toBe(8);
  });
  it("a full week without a PR is 870 XP", () => {
    expect(4 * XP.session + 2 * XP.run + 10 * XP.sets_target + XP.week_complete).toBe(870);
  });
});

describe("routine mapping and slots", () => {
  it("maps routine titles, old titles and raw routine ids", () => {
    expect(routineKeyOf(PUSH)).toBe("PUSH");
    expect(routineKeyOf("legs (Di) · Kraft & Figur")).toBe("LEGS");
    expect(routineKeyOf(HEVY_ROUTINES.CALI.title)).toBe("CALI");
    expect(routineKeyOf("Push - A")).toBe("PUSH");
    expect(routineKeyOf("Lower A")).toBe("LEGS");
    expect(routineKeyOf("Pull - A")).toBe("PULL");
    expect(routineKeyOf("Upper (Calisthenics)")).toBe("CALI");
    expect(routineKeyOf("Upper D")).toBe("PUSH");
    expect(routineKeyOf("Mo Kraft Zirkel (HX Wochen)")).toBeNull();
    expect(routineKeyOf("Abend Workout", HEVY_ROUTINES.PULL.id)).toBe("PULL");
    expect(routineKeyOf(null)).toBeNull();
  });
  it("fills a slot on any day, one per session, two runs for two LAUF slots", () => {
    const s = (id: string, day: string, routineKey: "PUSH" | "LEGS" | "PULL" | "CALI" | null, kind: "hevy" | "run" = "hevy") =>
      ({ id, title: id, day, kind, routineKey, sets: 12, minutes: 50 });
    const slots = fillSlots(W1, [s("pull", "2026-10-08", "PULL"), s("push", "2026-10-06", "PUSH"), s("push2", "2026-10-10", "PUSH"), s("r1", "2026-10-07", null, "run"), s("r2", "2026-10-11", null, "run"), s("r3", "2026-10-11", null, "run")]);
    expect(slots.map((x) => [x.key, x.weekday, x.filled?.id ?? null])).toEqual([
      ["PUSH", 0, "push"], ["LEGS", 1, null], ["LAUF", 2, "r1"], ["PULL", 3, "pull"], ["CALI", 5, null], ["LAUF", 6, "r2"],
    ]);
    expect(slots[0].day).toBe("2026-10-05");
  });
});

describe("awardXp", () => {
  it("awards sessions (>= 10 working sets) and runs (>= 20 min) from the plan start, never twice", async () => {
    const db = await makeTestDb();
    await templates(db);
    await hevyWorkout(db, "old", "Push - A", "2026-09-30T16:00:00Z", 60, [filler("79D0BB3A", 15, 80, 6)]); // before the plan
    await hevyWorkout(db, "push1", PUSH, "2026-10-05T16:00:00Z", 55, [filler("79D0BB3A", 12, 80, 6)]);
    await hevyWorkout(db, "short", "LEGS (Di) · Kraft & Figur", "2026-10-06T16:00:00Z", 20, [filler("DDCC3821", 8, 70, 8)]); // 8 sets
    await appleRun(db, "run1", "2026-10-08T05:30:00Z", 25);
    await appleRun(db, "walkish", "2026-10-09T05:30:00Z", 15); // too short
    await appleRun(db, "yoga", "2026-10-09T18:00:00Z", 40, "Yoga", null); // not a run
    const first = await awardXp(db, SUN);
    expect(first).toEqual({ session: 1, run: 1, sets_target: 0, pr: 0, stop_day: 0, week_complete: 0 });
    const again = await awardXp(db, SUN);
    expect(again).toEqual({ session: 0, run: 0, sets_target: 0, pr: 0, stop_day: 0, week_complete: 0 });
    const rs = await xpRows(db);
    expect(rs).toHaveLength(2);
    expect(rs.map((r) => [r.kind, r.source, r.source_id, r.xp, r.week_start])).toEqual([
      ["session", "hevy_workout", "push1", 100, W1], ["run", "health_workout", "run1", 60, W1],
    ]);
  });

  it("counts a run from running_speed samples when no workout was recorded", async () => {
    const db = await makeTestDb();
    for (let m = 0; m <= 24; m += 2) await sample(db, "running_speed", `2026-10-08T05:${String(m).padStart(2, "0")}:00Z`, { qty: 10 });
    for (let m = 0; m <= 10; m += 2) await sample(db, "running_speed", `2026-10-10T05:${String(m).padStart(2, "0")}:00Z`, { qty: 10 }); // 10 min only
    await awardXp(db, SUN);
    const rs = await xpRows(db);
    expect(rs.map((r) => [r.kind, r.source_id])).toEqual([["run", "speed:2026-10-08"]]);
  });

  it("nothing before the plan start", async () => {
    const db = await makeTestDb();
    await templates(db);
    await hevyWorkout(db, "a", PUSH, "2026-09-28T16:00:00Z", 55, [filler("79D0BB3A", 12, 80, 6)]);
    expect(await awardXp(db, new Date("2026-10-04T10:00:00Z"))).toMatchObject({ session: 0 });
    expect(await xpRows(db)).toEqual([]);
  });

  it("PR per mode: e1RM strictly better, reps on the last set, added weight with e1RM tie-break; first value is no PR", async () => {
    const db = await makeTestDb();
    await templates(db);
    // History before the plan: bench 80×6 (e1RM 96), pull-ups last set 10, weighted dip +5×8.
    await hevyWorkout(db, "h1", "Push - A", "2026-09-23T16:00:00Z", 60, [
      { template: "79D0BB3A", sets: [{ kg: 80, reps: 6 }, { kg: 85, reps: 3 }] },
      { template: "1B2B1E7C", sets: [{ reps: 12 }, { reps: 10 }] },
      { template: "29472BE1", sets: [{ kg: 5, reps: 8 }] },
    ]);
    // Plan session 1: bench 82.5×5 (96.3) = PR; pull-ups [14, 11] last 11 > 10 = PR; dip +5×8 = equal, no PR; squat first ever = no PR.
    await hevyWorkout(db, "p1", PUSH, "2026-10-05T16:00:00Z", 60, [
      { template: "79D0BB3A", sets: [{ kg: 60, reps: 10, type: "warmup" }, { kg: 82.5, reps: 5 }] },
      { template: "1B2B1E7C", sets: [{ reps: 14 }, { reps: 11 }] },
      { template: "29472BE1", sets: [{ kg: 5, reps: 8 }] },
      { template: "DDCC3821", sets: [{ kg: 100, reps: 10 }] },
    ]);
    // Plan session 2: bench 80×6 (96 < 96.3) no; pull-ups [15, 9] last 9 no; dip +5×10 = same added kg, higher e1RM → PR.
    await hevyWorkout(db, "p2", PUSH, "2026-10-08T16:00:00Z", 60, [
      { template: "79D0BB3A", sets: [{ kg: 80, reps: 6 }] },
      { template: "1B2B1E7C", sets: [{ reps: 15 }, { reps: 9 }] },
      { template: "29472BE1", sets: [{ kg: 5, reps: 10 }] },
      { template: "DDCC3821", sets: [{ kg: 102.5, reps: 10 }] }, // second squat value beats the first → PR
    ]);
    const c = await awardXp(db, SUN);
    expect(c.pr).toBe(4);
    const prs = (await xpRows(db)).filter((r) => r.kind === "pr").map((r) => r.source_id).sort();
    expect(prs).toEqual(["bench:p1", "dip:p2", "pullup_bw:p1", "squat:p2"]);
    const meta = await db.execute(sql`SELECT meta FROM coach_xp_events WHERE source_id = 'bench:p1'`);
    expect((meta.rows[0] as { meta: { old: { value: number }; new: { value: number } } }).meta).toMatchObject({ lift: "bench", old: { value: 96 }, new: { value: 96.3 } });
    expect((await awardXp(db, SUN)).pr).toBe(0);
  });

  it("set targets per muscle group and week, and a complete week (6/6 slots)", async () => {
    const db = await makeTestDb();
    await templates(db);
    await fullWeek(db);
    // Chest 12 bench + 12 dips = 24 >= 15, lats 12 = 12, quads 12 >= 10; hamstrings 0 < 12.
    await hevyWorkout(db, "extra", "PUSH (Mo) · Kraft & Figur", "2026-10-11T10:00:00Z", 30, [filler("79D0BB3A", 3, 60, 10)]); // 3 sets: no session XP, no second PUSH slot
    const c = await awardXp(db, SUN);
    expect(c).toEqual({ session: 4, run: 2, sets_target: 3, pr: 0, stop_day: 0, week_complete: 1 });
    const rs = await xpRows(db);
    expect(rs.filter((r) => r.kind === "sets_target").map((r) => r.source_id).sort()).toEqual([`${W1}:brust`, `${W1}:lat`, `${W1}:quads`]);
    expect(rs.find((r) => r.kind === "week_complete")).toMatchObject({ source: "week", source_id: W1, xp: 200, week_start: W1 });
    expect(rs.reduce((a, r) => a + r.xp, 0)).toBe(4 * 100 + 2 * 60 + 3 * 15 + 200);
    expect(await awardXp(db, SUN)).toMatchObject({ week_complete: 0, sets_target: 0 });
  });

  it("an incomplete week (PULL missing) earns no week bonus even with a second PUSH", async () => {
    const db = await makeTestDb();
    await templates(db);
    await fullWeek(db);
    await db.execute(sql`DELETE FROM hevy_workouts WHERE id = 'pull1'`);
    await hevyWorkout(db, "push2", PUSH, "2026-10-07T16:00:00Z", 55, [filler("79D0BB3A", 12, 80, 6)]);
    const c = await awardXp(db, SUN);
    expect(c.session).toBe(4);
    expect(c.week_complete).toBe(0);
  });

  it("stop day: STOPP traffic light and no training the day before → 40 XP, trained → nothing", async () => {
    const stopDay = "2026-10-06";
    const now = new Date("2026-10-07T06:00:00Z"); // Wednesday morning
    const seed = async (db: TestDb) => {
      for (let i = 1; i <= 40; i++) {
        const d = addDays(stopDay, -i);
        await sample(db, "resting_heart_rate", `${d}T07:00:00Z`, { qty: 55 });
        await sample(db, "heart_rate_variability", `${d}T02:00:00Z`, { avg: 68 });
      }
      await sample(db, "resting_heart_rate", `${stopDay}T06:00:00Z`, { qty: 70 }); // +12.9 over 7d mean
      await sample(db, "heart_rate_variability", `${stopDay}T02:00:00Z`, { avg: 40 }); // 62 % of 7d mean
    };
    const a = await makeTestDb();
    await seed(a);
    const c = await awardXp(a, now);
    expect(c.stop_day).toBe(1);
    expect((await xpRows(a)).map((r) => [r.kind, r.source, r.source_id, r.xp, r.week_start])).toEqual([["stop_day", "day", stopDay, 40, W1]]);
    expect((await awardXp(a, now)).stop_day).toBe(0);

    const b = await makeTestDb();
    await templates(b);
    await seed(b);
    await hevyWorkout(b, "x", PUSH, "2026-10-06T16:00:00Z", 55, [filler("79D0BB3A", 12, 80, 6)]);
    const cb = await awardXp(b, now);
    expect(cb.stop_day).toBe(0);
    expect(cb.session).toBe(1);

    const c2 = await makeTestDb();
    await seed(c2);
    await appleRun(c2, "walk", "2026-10-06T10:00:00Z", 40, "Walking", 3); // a walk is not training
    expect((await awardXp(c2, now)).stop_day).toBe(1);
    const c3 = await makeTestDb();
    await seed(c3);
    await appleRun(c3, "r", "2026-10-06T10:00:00Z", 25);
    expect((await awardXp(c3, now)).stop_day).toBe(0);
  });
});

describe("xpLedger", () => {
  it("sums total and week, picks the level, lists today's events and this week's PRs", async () => {
    const db = await makeTestDb();
    await templates(db);
    await hevyWorkout(db, "h1", "Push - A", "2026-09-23T16:00:00Z", 60, [{ template: "79D0BB3A", sets: [{ kg: 80, reps: 6 }] }]);
    await fullWeek(db); // push1 has bench 80×6 = no PR
    await hevyWorkout(db, "push2", PUSH, "2026-10-12T16:00:00Z", 55, [{ template: "79D0BB3A", sets: [{ kg: 82.5, reps: 6 }, ...filler("79D0BB3A", 11, 60, 8).sets] }]);
    const sunday = await awardXp(db, SUN);
    expect(sunday.week_complete).toBe(1);
    const monday = new Date("2026-10-12T18:30:00Z");
    expect(await awardXp(db, monday)).toMatchObject({ session: 1, pr: 1 });
    const l = await xpLedger(db, monday);
    expect(l.total).toBe(4 * 100 + 2 * 60 + 3 * 15 + 200 + 100 + 80); // week 1 (765) + Monday session and PR
    expect(l.week).toBe(180);
    expect(l.weekStart).toBe("2026-10-12");
    expect(l.level).toMatchObject({ level: 2, name: "Eisenfresser", next: 1500 });
    expect(l.today.map((e) => e.kind).sort()).toEqual(["pr", "session"]);
    expect(l.todayXp).toBe(180);
    expect(l.prsThisWeek).toHaveLength(1);
    expect(l.prsThisWeek[0].meta).toMatchObject({ short: "Bank", old: { weightKg: 80, reps: 6 }, new: { weightKg: 82.5, reps: 6 } });
    const tue = await xpLedger(db, new Date("2026-10-13T08:00:00Z"));
    expect(tue.today).toEqual([]);
    expect(tue.prsThisWeek).toHaveLength(1);
    expect(tue.total).toBe(l.total);
  });
  it("is empty on an empty database", async () => {
    const db = await makeTestDb();
    const l = await xpLedger(db, SUN);
    expect(l).toMatchObject({ total: 0, week: 0, todayXp: 0, today: [], prsThisWeek: [] });
    expect(l.level.name).toBe("Lehrling");
  });
});

describe("setBaselines", () => {
  it("weight and first waist at once, lifts only after the 14-day window, never overwritten", async () => {
    const db = await makeTestDb();
    await templates(db);
    await db.insert(hevyMeasurements).values([
      { date: "2026-09-20", weightKg: "93.5", waistCm: "98", raw: {} },
      { date: "2026-10-04", weightKg: "92.8", raw: {} },
      { date: "2026-10-05", weightKg: "92.6", raw: {} },
      { date: "2026-10-03", weightKg: "92.4", raw: {} },
    ]);
    await hevyWorkout(db, "h1", "Push - A", "2026-09-23T16:00:00Z", 60, [{ template: "1B2B1E7C", sets: [{ reps: 12 }, { reps: 9 }] }, { template: "DDCC3821", sets: [{ kg: 70, reps: 8 }] }]);
    await hevyWorkout(db, "h2", "Push - A", "2026-09-30T16:00:00Z", 60, [{ template: "1B2B1E7C", sets: [{ reps: 13 }, { reps: 10 }] }]);
    await hevyWorkout(db, "p1", PUSH, "2026-10-06T16:00:00Z", 60, [{ template: "79D0BB3A", sets: [{ kg: 80, reps: 6 }] }]);
    await hevyWorkout(db, "p2", PUSH, "2026-10-13T16:00:00Z", 60, [{ template: "79D0BB3A", sets: [{ kg: 82.5, reps: 6 }] }, { template: "29472BE1", sets: [{ kg: 7.5, reps: 8 }] }]);
    await hevyWorkout(db, "late", PUSH, "2026-10-20T16:00:00Z", 60, [{ template: "79D0BB3A", sets: [{ kg: 90, reps: 6 }] }]); // after the window

    expect(await setBaselines(db, new Date("2026-10-04T10:00:00Z"))).toEqual([]); // before the plan
    expect((await setBaselines(db, new Date("2026-10-07T10:00:00Z"))).sort()).toEqual(["weight"]); // window open: no lifts, no waist yet
    let b = await readBaselines(db);
    expect(b.get("weight")).toMatchObject({ value: 92.6, day: PLAN.start, mode: "kg" }); // mean of 92.4, 92.8, 92.6 on 05.10.
    await db.insert(hevyMeasurements).values({ date: "2026-10-12", waistCm: "96.5", raw: {} });
    expect(await setBaselines(db, new Date("2026-10-12T10:00:00Z"))).toEqual(["waist"]);
    const set = await setBaselines(db, new Date("2026-10-19T10:00:00Z")); // window closed
    expect(set.sort()).toEqual(["bench", "dip", "pullup_bw", "squat"]);
    b = await readBaselines(db);
    expect(b.get("bench")).toMatchObject({ value: 99, day: "2026-10-13", mode: "e1rm" }); // best of the window, not 90×6 from 20.10.
    expect(b.get("dip")).toMatchObject({ value: 7.5, mode: "added" });
    expect(b.get("pullup_bw")).toMatchObject({ value: 10, day: "2026-09-30", mode: "reps" }); // last session before the start, last set
    expect(b.get("squat")).toMatchObject({ value: 88.7, day: "2026-09-23" });
    expect(b.get("waist")).toMatchObject({ value: 96.5, day: "2026-10-12", mode: "cm" });
    expect(await setBaselines(db, new Date("2026-11-01T10:00:00Z"))).toEqual([]);
    expect((await readBaselines(db)).get("bench")!.value).toBe(99);
  });
  it("waist falls back to the last value before the start once the window closed; weight to the plan constant", async () => {
    const db = await makeTestDb();
    await db.insert(hevyMeasurements).values({ date: "2026-09-20", waistCm: "98", raw: {} });
    expect((await setBaselines(db, new Date("2026-10-19T10:00:00Z"))).sort()).toEqual(["waist", "weight"]);
    const b = await readBaselines(db);
    expect(b.get("waist")).toMatchObject({ value: 98, day: "2026-09-20" });
    expect(b.get("weight")).toMatchObject({ value: 92.6 });
  });
});
