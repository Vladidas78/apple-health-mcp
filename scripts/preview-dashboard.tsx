// Render the dashboard with invented fixture data to a static HTML file, so the
// design can be checked (and screenshotted) without a database or a login.
// Pure script, never a route:
//   npm run preview:dashboard [--empty | --after-push | --rest] [--stats] [out.html]
// --after-push: Monday evening after PUSH with a PR (hero "+180 XP", level 2).
// --rest: Sunday, no events, week 6/6. --stats: STATS section rendered open.
import { writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { Dashboard, type DashboardData } from "@/components/dashboard/Dashboard";
import type { BossProgressData, LeadLiftData, TodayState, WeekSlotsData, WeightTrendData } from "@/lib/dashboard/queries";
import { goalAt, heroMode } from "@/lib/dashboard/queries";
import { levelFor, type XpLedger } from "@/lib/coach/xp";
import { fillSlots, type SlotSession } from "@/lib/coach/slots";
import { LEAD_LIFTS, MUSCLE_GROUPS, BODYWEIGHT_KG, HEVY_ROUTINES, epley, hevyRoutineLink } from "@/lib/coach/plan-defaults";
import { addDays, berlinDay, weekStartOf } from "@/lib/dashboard/time";

const args = process.argv.slice(2);
const empty = args.includes("--empty");
const afterPush = args.includes("--after-push");
const rest = args.includes("--rest");
const statsOpen = args.includes("--stats");
const out = resolve(args.find((a) => !a.startsWith("--")) ?? "dashboard-preview.html");

// Default: Wednesday in plan week 2, 07:12 Berlin, before PULL.
// --after-push: Monday 12.10. 20:30 Berlin. --rest: Sunday 18.10. 10:00 Berlin.
const NOW = afterPush ? new Date("2026-10-12T18:30:00Z") : rest ? new Date("2026-10-18T08:00:00Z") : new Date("2026-10-14T05:12:00Z");
const TODAY = berlinDay(NOW);
const WEEK = weekStartOf(NOW);

// Deterministic pseudo-random so the preview is stable between runs.
let seed = 7;
const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);

function weightFixture(): WeightTrendData {
  const to = TODAY;
  const from = addDays(to, -55);
  const byDay = new Map<string, number>();
  let kg = 94.1;
  for (let d = from; d <= to; d = addDays(d, 1)) {
    kg -= 0.03 + (rnd() - 0.5) * 0.06;
    if (rnd() < 0.72) byDay.set(d, Math.round((kg + (rnd() - 0.5) * 0.8) * 10) / 10);
  }
  const avg7: WeightTrendData["avg7"] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const xs: number[] = [];
    for (let i = 0; i < 7; i++) { const v = byDay.get(addDays(d, -i)); if (v) xs.push(v); }
    avg7.push({ day: d, kg: xs.length >= 3 ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null });
  }
  const points = [...byDay].map(([day, v], i) => ({ day, kg: v, source: i % 3 === 0 ? ("health" as const) : ("hevy" as const) }));
  const latestAvg7 = [...avg7].reverse().find((a) => a.kg !== null)?.kg ?? null;
  return {
    from, to, points, avg7, latest: points[points.length - 1], latestAvg7,
    goal: { startDay: "2026-10-05", startKg: 92.6, endDay: "2026-12-27", endKg: 88 },
    goalToday: goalAt(to),
  };
}

function liftsFixture(): LeadLiftData[] {
  const firstWeek = addDays(WEEK, -77);
  const base: Record<string, { w: number; r: number; step: number }> = {
    bench: { w: 75, r: 6, step: 1.25 }, pullup_bw: { w: 0, r: 9, step: 0.4 }, pullup: { w: 2.5, r: 8, step: 0.6 },
    dip: { w: 7.5, r: 8, step: 0.8 }, squat: { w: 70, r: 8, step: 1.5 }, isobench: { w: 65, r: 8, step: 1 },
  };
  return LEAD_LIFTS.map((l) => {
    const b = base[l.key];
    const weeks = Array.from({ length: 12 }, (_, i) => {
      const weekStart = addDays(firstWeek, i * 7);
      if (rnd() < 0.2 || (l.key === "squat" && i > 3 && i < 9)) return { weekStart, best: null };
      const k = l.key === "bench" && i === 11 ? 9 : i; // bench: latest week below the best → "Bank fehlt 2,5 kg"
      const weightKg = l.mode === "reps" ? 0 : Math.round((b.w + k * b.step) / 2.5) * 2.5;
      const reps = l.mode === "reps" ? Math.round(b.r + k * b.step) : b.r;
      const systemLoad = l.mode === "e1rm" ? weightKg : weightKg + BODYWEIGHT_KG;
      const e1rm = Math.round(epley(systemLoad, reps) * 10) / 10;
      const value = l.mode === "e1rm" ? e1rm : l.mode === "reps" ? reps : weightKg;
      return { weekStart, best: { day: addDays(weekStart, 2), weightKg, reps, systemLoad, e1rm, value } };
    });
    const latest = [...weeks].reverse().find((w) => w.best)?.best ?? null;
    const boss = l.boss
      ? (() => {
          const sl = l.mode === "e1rm" ? l.boss.weightKg : l.boss.weightKg + BODYWEIGHT_KG;
          const e1rm = Math.round(epley(sl, l.boss.reps) * 10) / 10;
          return { weightKg: l.boss.weightKg, reps: l.boss.reps, e1rm, value: l.mode === "e1rm" ? e1rm : l.mode === "reps" ? l.boss.reps : l.boss.weightKg };
        })()
      : null;
    return { key: l.key, title: l.title, short: l.short, mode: l.mode, unit: l.mode === "reps" ? "Wdh" : "kg", boss, endBoss: l.endBoss, weeks, latest };
  });
}

const rhr = rest ? { today: 54, todayDay: TODAY, mean7: 55, baseline28: 53, baselineDays: 23 } : { today: 58, todayDay: TODAY, mean7: 55, baseline28: 53, baselineDays: 19 };
const hrv = rest ? { today: 68, todayDay: TODAY, mean7: 66, baseline28: 64, baselineDays: 23 } : { today: 61, todayDay: TODAY, mean7: 66, baseline28: 64, baselineDays: 19 };
const ampelFx = rest ? { ampel: "gruen" as const, reasons: [] as string[] } : { ampel: "gelb" as const, reasons: ["Ruhepuls +3 über 7d-Mittel", "HRV 92 % des 7d-Mittels", "Baseline 19/28 Tage, Stopp noch gesperrt"] };

// ---- v2: XP ledger, slots, boss bars, today ---------------------------------

const ses = (id: string, title: string, day: string, routineKey: SlotSession["routineKey"], kind: "hevy" | "run" = "hevy", sets = 16, minutes = 52): SlotSession =>
  ({ id, title, day, kind, routineKey, sets, minutes });

function slotsFixture(): WeekSlotsData {
  const sessions = afterPush
    ? [ses("a", HEVY_ROUTINES.PUSH.title, WEEK, "PUSH", "hevy", 18)]
    : rest
      ? [ses("a", HEVY_ROUTINES.PUSH.title, WEEK, "PUSH"), ses("b", HEVY_ROUTINES.LEGS.title, addDays(WEEK, 1), "LEGS"), ses("c", HEVY_ROUTINES.PULL.title, addDays(WEEK, 3), "PULL"),
         ses("r1", "Laufen", addDays(WEEK, 2), null, "run", 0, 32), ses("d", HEVY_ROUTINES.CALI.title, addDays(WEEK, 4), "CALI"), ses("r2", "Laufen", addDays(WEEK, 5), null, "run", 0, 48)]
      : [ses("a", "Push - A", WEEK, "PUSH"), ses("b", "Lower A", addDays(WEEK, 1), "LEGS")];
  const slots = fillSlots(WEEK, sessions);
  return { weekStart: WEEK, slots, filled: slots.filter((x) => x.filled).length, weeksCounted: 2, weeksComplete: rest ? 1 : 0 };
}

const PR_META = { lift: "bench", short: "Bank", mode: "e1rm", day: TODAY, old: { weightKg: 80, reps: 5, value: 93.3, e1rm: 93.3 }, new: { weightKg: 82.5, reps: 5, value: 96.3, e1rm: 96.3 } };
function xpFixture(): XpLedger {
  const at = (h: number) => new Date(`${TODAY}T${String(h).padStart(2, "0")}:00:00Z`);
  const today = afterPush
    ? [
        { id: 11, kind: "session" as const, source: "hevy_workout", sourceId: "a", xp: 100, weekStart: WEEK, awardedAt: at(18), meta: { title: HEVY_ROUTINES.PUSH.title, routine: "PUSH", day: TODAY, sets: 18 } },
        { id: 12, kind: "pr" as const, source: "lift", sourceId: "bench:a", xp: 80, weekStart: WEEK, awardedAt: at(18), meta: PR_META },
      ]
    : [];
  const total = afterPush ? 620 : rest ? 1310 : 440;
  return {
    total, week: afterPush ? 180 : rest ? 870 : 200, weekStart: WEEK, level: levelFor(total),
    today, todayXp: today.reduce((a, e) => a + e.xp, 0),
    prsThisWeek: afterPush ? [today[1]] : [],
  };
}

function bossFixture(): BossProgressData {
  const row = (key: BossProgressData["rows"][number]["key"], label: string, unit: "kg" | "Wdh" | "cm", baseline: number, current: number | null, target: number, decreasing = false) => {
    const pct = current === null ? null : Math.max(0, Math.min(100, Math.round(((current - baseline) / (target - baseline)) * 100)));
    return { key, label, unit, baseline, baselineDay: "2026-10-06", provisional: !rest, current, currentDay: TODAY, target, pct, decreasing };
  };
  return {
    windowEnd: "2026-10-19",
    rows: [
      row("bench", "Bank", "kg", 88, afterPush ? 96.3 : 93.3, 99), // targets as the loader computes them from plan-defaults
      row("pullup_bw", "Klimmzüge", "Wdh", 11, 12, 16),
      row("dip", "Dips", "kg", 7.5, 10, 17.5),
      row("squat", "Squat", "kg", 84, 88.7, 108),
      row("waist", "Taille", "cm", 96.5, 95.5, 92.5, true),
      row("weight", "Gewicht", "kg", 92.6, 92.1, 88.5, true),
    ],
  };
}

function todayFixture(): TodayState {
  const xp = xpFixture();
  const weekday = (new Date(`${TODAY}T12:00:00Z`).getUTCDay() + 6) % 7;
  const key = afterPush ? "PUSH" : rest ? null : "PULL";
  const slot = key ? { key: key as "PUSH" | "PULL", label: key } : null;
  const routine = key ? { key: key as "PUSH" | "PULL", id: HEVY_ROUTINES[key as "PUSH" | "PULL"].id, title: HEVY_ROUTINES[key as "PUSH" | "PULL"].title, href: hevyRoutineLink(HEVY_ROUTINES[key as "PUSH" | "PULL"].id) } : null;
  const base = {
    today: TODAY, weekday, planWeek: 2, slot, routine,
    done: afterPush ? [ses("a", HEVY_ROUTINES.PUSH.title, TODAY, "PUSH", "hevy", 18)] : [],
    events: xp.today, todayXp: xp.todayXp,
  };
  return { ...base, hero: heroMode(base, "unbekannt") };
}

const full: DashboardData = {
  now: NOW,
  hevySync: new Date(NOW.getTime() - (rest ? 26 * 3_600_000 : 28 * 60_000)),
  weight: { ok: true, data: weightFixture() },
  recovery: { ok: true, data: { ...ampelFx, baselineComplete: false, rhr, hrv, sleep: { hours: rest ? 7.6 : 6.8, day: TODAY } } },
  training: {
    ok: true,
    data: (() => {
      const sessions = afterPush
        ? [{ id: "a", title: HEVY_ROUTINES.PUSH.title, day: WEEK, weekday: 0, minutes: 61, sets: 18 }]
        : [
            { id: "a", title: "Push - A", day: WEEK, weekday: 0, minutes: 52, sets: 15 },
            { id: "b", title: "Lower A", day: addDays(WEEK, 1), weekday: 1, minutes: 58, sets: 16 },
            ...(rest ? [{ id: "c", title: "Pull - A", day: addDays(WEEK, 3), weekday: 3, minutes: 49, sets: 16 }, { id: "d", title: HEVY_ROUTINES.CALI.title, day: addDays(WEEK, 4), weekday: 4, minutes: 50, sets: 21 }] : []),
          ];
      const days = Array.from({ length: 7 }, (_, i) => sessions.filter((s) => s.weekday === i));
      const have: Record<string, number> = afterPush
        ? { brust: 9, schultern: 5, trizeps: 4 }
        : rest
          ? { brust: 15, lat: 12, oberer_ruecken: 6, schultern: 10, bizeps: 5, trizeps: 6, quads: 10, hamstrings_glutes: 12, waden: 4, core: 6 }
          : { brust: 8, lat: 7, oberer_ruecken: 4, schultern: 5, bizeps: 4, trizeps: 4, quads: 6, hamstrings_glutes: 6, waden: 2, core: 1 };
      return {
        weekStart: WEEK, days, sessions, totalSets: afterPush ? 18 : rest ? 86 : 31,
        muscles: MUSCLE_GROUPS.map((g) => ({ key: g.key, label: g.label, sets: have[g.key] ?? 0, target: g.target })),
      };
    })(),
  },
  lifts: { ok: true, data: liftsFixture() },
  measurements: {
    ok: true,
    data: {
      rows: [
        { day: "2026-10-12", weightKg: 92.1, waistCm: 95.5, chestCm: 108, bicepCm: 39.5 },
        { day: "2026-10-05", weightKg: 92.6, waistCm: 96.5, chestCm: 108, bicepCm: 39.5 },
        { day: "2026-09-07", weightKg: 93.8, waistCm: 97, chestCm: 107.5, bicepCm: 39 },
      ],
      deltas: { weightKg: -1.7, waistCm: -1.5, chestCm: 0.5, bicepCm: 0.5 },
      hasCircumference: true,
    },
  },
  run: {
    ok: true,
    data: {
      weekStart: WEEK, coachWeek: null, runDays: afterPush ? [] : rest ? [addDays(WEEK, 2), addDays(WEEK, 5)] : [addDays(WEEK, 1)],
      appleWorkouts: afterPush ? [] : rest
        ? [{ id: "r1", name: "Laufen", day: addDays(WEEK, 2), minutes: 32, km: 6.1 }, { id: "r2", name: "Laufen", day: addDays(WEEK, 5), minutes: 48, km: 8.7 }]
        : [{ id: "r1", name: "Laufen", day: addDays(WEEK, 1), minutes: 28, km: 5.4 }],
    },
  },
  volume: {
    ok: true,
    data: { weeks: Array.from({ length: 12 }, (_, i) => ({ weekStart: addDays(WEEK, (i - 11) * 7), sets: i === 11 ? (afterPush ? 18 : rest ? 86 : 31) : i === 9 ? 0 : 50 + Math.round(rnd() * 30), sessions: 4 })) },
  },
  xp: { ok: true, data: xpFixture() },
  slots: { ok: true, data: slotsFixture() },
  boss: { ok: true, data: bossFixture() },
  today: { ok: true, data: todayFixture() },
};

// Empty state: fresh deploy with an empty database and one loader that failed.
const none: DashboardData = {
  now: new Date("2026-10-04T10:00:00Z"),
  hevySync: null,
  weight: { ok: true, data: { from: "2026-08-10", to: "2026-10-04", points: [], avg7: [], latest: null, latestAvg7: null, goal: full.weight.ok ? full.weight.data.goal : { startDay: "", startKg: 0, endDay: "", endKg: 0 }, goalToday: null } },
  recovery: { ok: true, data: { ampel: "unbekannt", reasons: ["keine frischen Werte"], baselineComplete: false, rhr: { today: null, todayDay: null, mean7: null, baseline28: null, baselineDays: 0 }, hrv: { today: null, todayDay: null, mean7: null, baseline28: null, baselineDays: 0 }, sleep: { hours: null, day: null } } },
  training: { ok: true, data: { weekStart: "2026-09-28", days: Array.from({ length: 7 }, () => []), sessions: [], totalSets: 0, muscles: MUSCLE_GROUPS.map((g) => ({ key: g.key, label: g.label, sets: 0, target: g.target })) } },
  lifts: { ok: false, error: "connection refused" },
  measurements: { ok: true, data: { rows: [{ day: "2026-10-03", weightKg: 92.6, waistCm: null, chestCm: null, bicepCm: null }], deltas: null, hasCircumference: false } },
  run: { ok: true, data: { weekStart: "2026-09-28", coachWeek: null, runDays: [], appleWorkouts: [] } },
  volume: { ok: true, data: { weeks: [] } },
  xp: { ok: true, data: { total: 0, week: 0, weekStart: "2026-09-28", level: levelFor(0), today: [], todayXp: 0, prsThisWeek: [] } },
  slots: { ok: true, data: { weekStart: "2026-09-28", slots: fillSlots("2026-09-28", []), filled: 0, weeksCounted: 0, weeksComplete: 0 } },
  boss: { ok: false, error: "connection refused" },
  today: { ok: true, data: { today: "2026-10-04", weekday: 6, planWeek: 0, slot: null, routine: null, done: [], events: [], todayXp: 0, hero: { kind: "pause" } } },
};

const data = empty ? none : full;
const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../app/globals.css"), "utf8");
let body = renderToStaticMarkup(<Dashboard data={data} refreshAction={async () => {}} logoutAction={async () => {}} status={empty ? null : "ok"} statsOpen={statsOpen} />);
// --stats: also unfold every block inside STATS so the screenshot shows them.
if (statsOpen) body = body.replaceAll('<details class="block block--fold', '<details open="" class="block block--fold');
const html = `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<meta name="color-scheme" content="dark" />
<title>Coach – Vorschau (Fixture)</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Anton&family=Barlow:wght@400;600&family=JetBrains+Mono:wght@400;600&display=swap" />
<style>${css}</style>
</head>
<body>${body}</body>
</html>
`;
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, html);
console.log(`${empty ? "empty" : afterPush ? "after-push" : rest ? "rest" : "full"}${statsOpen ? "+stats" : ""} preview → ${out} (${html.length} bytes)`);
