import { describe, it, expect } from "vitest";
import { makeTestDb } from "./helpers/db";
import { appleRun, filler, hevyWorkout, sample, templates } from "./helpers/fixtures";
import { coachLiftBaselines, hevyMeasurements } from "@/db/schema";
import { bossProgress, heroMode, todayState, weekSlots } from "@/lib/dashboard/queries";
import { awardXp } from "@/lib/coach/xp";
import { HEVY_ROUTINES } from "@/lib/coach/plan-defaults";

const W1 = "2026-10-05";
const W2 = "2026-10-12";
const PUSH = HEVY_ROUTINES.PUSH.title;

describe("weekSlots", () => {
  it("fills slots from routine titles and runs on any day, counts weeks since the plan start", async () => {
    const db = await makeTestDb();
    await templates(db);
    // Week 1: PUSH Mo, PULL on Thursday, two runs, a 5-set LEGS that does not count.
    await hevyWorkout(db, "push1", PUSH, "2026-10-05T16:00:00Z", 55, [filler("79D0BB3A", 12, 80, 6)]);
    await hevyWorkout(db, "pull1", "Pull - A", "2026-10-08T16:00:00Z", 55, [filler("1B2B1E7C", 12, 0, 8)]);
    await hevyWorkout(db, "legs-short", HEVY_ROUTINES.LEGS.title, "2026-10-06T16:00:00Z", 15, [filler("DDCC3821", 5, 70, 8)]);
    await appleRun(db, "r1", "2026-10-07T05:30:00Z", 30);
    await appleRun(db, "r2", "2026-10-11T07:00:00Z", 50);
    // Week 2: everything, PULL and LEGS swapped.
    await hevyWorkout(db, "push2", PUSH, "2026-10-12T16:00:00Z", 55, [filler("79D0BB3A", 12, 80, 6)]);
    await hevyWorkout(db, "pull2", HEVY_ROUTINES.PULL.title, "2026-10-13T16:00:00Z", 55, [filler("1B2B1E7C", 12, 0, 8)]);
    await hevyWorkout(db, "legs2", HEVY_ROUTINES.LEGS.title, "2026-10-14T16:00:00Z", 55, [filler("DDCC3821", 12, 70, 8)]);
    await appleRun(db, "r3", "2026-10-15T05:30:00Z", 30);
    await hevyWorkout(db, "cali2", HEVY_ROUTINES.CALI.title, "2026-10-16T16:00:00Z", 55, [filler("29472BE1", 12, 5, 8)]);
    await appleRun(db, "r4", "2026-10-17T07:00:00Z", 50);

    const w1 = await weekSlots(db, W1);
    expect(w1.slots.map((s) => [s.key, s.filled?.id ?? null])).toEqual([["PUSH", "push1"], ["LEGS", null], ["LAUF", "r1"], ["PULL", "pull1"], ["CALI", null], ["LAUF", "r2"]]);
    expect(w1.filled).toBe(4);
    expect(w1.weeksCounted).toBe(1);
    expect(w1.weeksComplete).toBe(0);
    expect(w1.slots[3].filled).toMatchObject({ day: "2026-10-08", kind: "hevy", sets: 12, minutes: 55 });

    const w2 = await weekSlots(db, W2);
    expect(w2.filled).toBe(6);
    expect(w2.slots.map((s) => s.filled?.id)).toEqual(["push2", "legs2", "r3", "pull2", "cali2", "r4"]);
    expect(w2.weeksCounted).toBe(2);
    expect(w2.weeksComplete).toBe(1);

    const w3 = await weekSlots(db, "2026-10-19");
    expect(w3.filled).toBe(0);
    expect(w3.weeksCounted).toBe(2);
    expect(w3.weeksComplete).toBe(1);
  });
  it("a week before the plan start is empty and counts nothing", async () => {
    const db = await makeTestDb();
    const w = await weekSlots(db, "2026-09-28");
    expect(w.filled).toBe(0);
    expect(w.slots).toHaveLength(6);
    expect(w).toMatchObject({ weeksCounted: 0, weeksComplete: 0 });
  });
});

describe("bossProgress", () => {
  it("percent from baseline to target per boss, decreasing for waist and weight, clamped 0–100", async () => {
    const db = await makeTestDb();
    await templates(db);
    await db.insert(coachLiftBaselines).values([
      { liftKey: "bench", value: "90", day: "2026-10-06", mode: "e1rm" }, // target 99 → 9 kg span
      { liftKey: "pullup_bw", value: "12", day: "2026-10-07", mode: "reps" }, // target 16
      { liftKey: "dip", value: "10", day: "2026-10-09", mode: "added" }, // target 17.5
      { liftKey: "squat", value: "100", day: "2026-10-06", mode: "e1rm" }, // target 108
      { liftKey: "waist", value: "98", day: "2026-10-05", mode: "cm" }, // target 94
      { liftKey: "weight", value: "92.6", day: "2026-10-05", mode: "kg" }, // target 88.5
    ]);
    const now = new Date("2026-11-10T10:00:00Z");
    await hevyWorkout(db, "p", PUSH, "2026-11-09T16:00:00Z", 60, [
      { template: "79D0BB3A", sets: [{ kg: 82.5, reps: 5 }] }, // e1RM 96.3 → 70 %
      { template: "1B2B1E7C", sets: [{ reps: 15 }, { reps: 14 }] }, // 14 → 50 %
      { template: "29472BE1", sets: [{ kg: 20, reps: 8 }] }, // 20 > 17.5 → 100 %
      { template: "DDCC3821", sets: [{ kg: 70, reps: 8 }] }, // 88.7 < baseline → 0 %
    ]);
    await db.insert(hevyMeasurements).values([{ date: "2026-11-08", waistCm: "96", raw: {} }, { date: "2026-10-20", waistCm: "97.5", raw: {} }]);
    for (let i = 0; i < 5; i++) await sample(db, "weight_body_mass", `2026-11-0${5 + i}T05:00:00Z`, { qty: 90.55 }); // 7d mean 90.6 → 49 %
    const b = await bossProgress(db, now);
    expect(b.rows.map((r) => [r.key, r.pct, r.provisional])).toEqual([
      ["bench", 70, false], ["pullup_bw", 50, false], ["dip", 100, false], ["squat", 0, false], ["waist", 50, false], ["weight", 49, false],
    ]);
    expect(b.rows[0]).toMatchObject({ label: "Bank", unit: "kg", baseline: 90, current: 96.3, target: 99, decreasing: false });
    expect(b.rows[4]).toMatchObject({ label: "Taille", baseline: 98, current: 96, currentDay: "2026-11-08", target: 94, decreasing: true });
    expect(b.rows[5]).toMatchObject({ label: "Gewicht", target: 88.5, current: 90.6 });
  });
  it("without persisted baselines: provisional from the window or the last value before the start, null without data", async () => {
    const db = await makeTestDb();
    await templates(db);
    await hevyWorkout(db, "h", "Push - A", "2026-09-30T16:00:00Z", 60, [{ template: "1B2B1E7C", sets: [{ reps: 12 }, { reps: 10 }] }, { template: "DDCC3821", sets: [{ kg: 70, reps: 8 }] }]);
    await hevyWorkout(db, "p", PUSH, "2026-10-06T16:00:00Z", 60, [{ template: "79D0BB3A", sets: [{ kg: 80, reps: 6 }] }]);
    await hevyWorkout(db, "p2", PUSH, "2026-10-08T16:00:00Z", 60, [{ template: "79D0BB3A", sets: [{ kg: 80, reps: 8 }] }, { template: "1B2B1E7C", sets: [{ reps: 12 }] }]);
    const b = await bossProgress(db, new Date("2026-10-09T10:00:00Z"));
    const by = Object.fromEntries(b.rows.map((r) => [r.key, r]));
    expect(by.bench).toMatchObject({ baseline: 101.3, baselineDay: "2026-10-08", current: 101.3, pct: 0, provisional: true }); // best so far in the window
    expect(by.pullup_bw).toMatchObject({ baseline: 12, baselineDay: "2026-10-08", current: 12, target: 16, pct: 0, provisional: true }); // window value wins
    expect(by.squat).toMatchObject({ baseline: 88.7, baselineDay: "2026-09-30", current: 88.7, target: 108, pct: 0, provisional: true }); // last session before the start
    expect(by.dip).toMatchObject({ baseline: null, current: null, pct: null });
    expect(by.waist).toMatchObject({ baseline: null, target: null, pct: null });
    expect(by.weight).toMatchObject({ baseline: 92.6, current: null, pct: null, provisional: true });
    expect(b.windowEnd).toBe("2026-10-19");
  });
});

describe("todayState + heroMode", () => {
  it("Monday in the plan: PUSH slot with routine deep link, today's events after the award", async () => {
    const db = await makeTestDb();
    await templates(db);
    const now = new Date("2026-10-12T18:30:00Z"); // Monday 20:30 Berlin
    await hevyWorkout(db, "h", "Push - A", "2026-09-30T16:00:00Z", 60, [{ template: "79D0BB3A", sets: [{ kg: 80, reps: 6 }] }]);
    await hevyWorkout(db, "push2", PUSH, "2026-10-12T16:00:00Z", 55, [{ template: "79D0BB3A", sets: [{ kg: 82.5, reps: 6 }, ...filler("79D0BB3A", 11, 60, 8).sets] }]);
    const before = await todayState(db, now);
    expect(before).toMatchObject({ today: "2026-10-12", weekday: 0, planWeek: 2, slot: { key: "PUSH", label: "PUSH" }, todayXp: 0, events: [] });
    expect(before.routine).toEqual({ key: "PUSH", id: HEVY_ROUTINES.PUSH.id, title: HEVY_ROUTINES.PUSH.title, href: `hevy://routine/${HEVY_ROUTINES.PUSH.id}` });
    expect(before.done.map((d) => d.id)).toEqual(["push2"]);
    expect(before.hero).toEqual({ kind: "slot", label: "PUSH" });
    expect(heroMode(before, "stopp")).toEqual({ kind: "stopp" });

    await awardXp(db, now);
    const after = await todayState(db, now);
    expect(after.todayXp).toBe(180);
    expect(after.events.map((e) => e.kind).sort()).toEqual(["pr", "session"]);
    expect(after.hero).toEqual({ kind: "xp", xp: 180 });
    expect(heroMode(after, "stopp")).toEqual({ kind: "xp", xp: 180 }); // reward beats the brake in the hero
    // Still there late in the evening, gone the next morning.
    expect((await todayState(db, new Date("2026-10-12T21:55:00Z"))).todayXp).toBe(180);
    const tue = await todayState(db, new Date("2026-10-13T06:00:00Z"));
    expect(tue).toMatchObject({ todayXp: 0, slot: { key: "LEGS" }, hero: { kind: "slot", label: "LEGS" } });
    expect(tue.routine?.id).toBe(HEVY_ROUTINES.LEGS.id);
  });
  it("run day has no routine, Friday and days outside the plan are PAUSE", async () => {
    const db = await makeTestDb();
    const wed = await todayState(db, new Date("2026-10-14T10:00:00Z"));
    expect(wed.slot).toEqual({ key: "LAUF", label: "LAUF" });
    expect(wed.routine).toBeNull();
    const sun = await todayState(db, new Date("2026-10-18T10:00:00Z"));
    expect(sun.slot).toEqual({ key: "LAUF", label: "LAUF" });
    const fri = await todayState(db, new Date("2026-10-16T10:00:00Z"));
    expect(fri.slot).toBeNull();
    expect(fri.hero).toEqual({ kind: "pause" });
    const pre = await todayState(db, new Date("2026-10-04T10:00:00Z"));
    expect(pre).toMatchObject({ planWeek: 0, slot: null, routine: null, hero: { kind: "pause" } });
    const post = await todayState(db, new Date("2027-01-04T10:00:00Z"));
    expect(post).toMatchObject({ planWeek: 14, slot: null });
    expect(heroMode(fri, "gelb")).toEqual({ kind: "pause" });
    expect(heroMode(sun, "gelb")).toEqual({ kind: "slot", label: "LAUF" });
    expect(heroMode(fri, "stopp")).toEqual({ kind: "stopp" });
  });
});
