// Render the dashboard with invented fixture data to a static HTML file, so the
// design can be checked (and screenshotted) without a database or a login.
// Pure script, never a route: `npm run preview:dashboard [--empty] [out.html]`.
import { writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { Dashboard, type DashboardData } from "@/components/dashboard/Dashboard";
import type { LeadLiftData, WeightTrendData } from "@/lib/dashboard/queries";
import { goalAt } from "@/lib/dashboard/queries";
import { LEAD_LIFTS, MUSCLE_GROUPS, BODYWEIGHT_KG, epley } from "@/lib/coach/plan-defaults";
import { addDays, berlinDay, weekStartOf } from "@/lib/dashboard/time";

const args = process.argv.slice(2);
const empty = args.includes("--empty");
const out = resolve(args.find((a) => !a.startsWith("--")) ?? "dashboard-preview.html");

// Wednesday in plan week 2, 07:12 Berlin.
const NOW = new Date("2026-10-14T05:12:00Z");
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
      const weightKg = l.mode === "reps" ? 0 : Math.round((b.w + i * b.step) / 2.5) * 2.5;
      const reps = l.mode === "reps" ? Math.round(b.r + i * b.step) : b.r;
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

const rhr = { today: 58, todayDay: TODAY, mean7: 55, baseline28: 53, baselineDays: 19 };
const hrv = { today: 61, todayDay: TODAY, mean7: 66, baseline28: 64, baselineDays: 19 };

const full: DashboardData = {
  now: NOW,
  hevySync: new Date("2026-10-14T02:00:00Z"),
  weight: { ok: true, data: weightFixture() },
  recovery: { ok: true, data: { ampel: "gelb", reasons: ["Ruhepuls +3 über 7d-Mittel", "HRV 92 % des 7d-Mittels", "Baseline 19/28 Tage, Stopp noch gesperrt"], baselineComplete: false, rhr, hrv, sleep: { hours: 6.8, day: TODAY } } },
  training: {
    ok: true,
    data: (() => {
      const sessions = [
        { id: "a", title: "Push - A", day: WEEK, weekday: 0, minutes: 52, sets: 15 },
        { id: "b", title: "Lower A", day: addDays(WEEK, 1), weekday: 1, minutes: 58, sets: 16 },
        { id: "c", title: "Pull - A", day: addDays(WEEK, 2), weekday: 2, minutes: 49, sets: 16 },
      ];
      const days = Array.from({ length: 7 }, (_, i) => sessions.filter((s) => s.weekday === i));
      const have: Record<string, number> = { brust: 8, lat: 7, oberer_ruecken: 4, schultern: 5, bizeps: 4, trizeps: 4, quads: 6, hamstrings_glutes: 6, waden: 2, core: 1 };
      return {
        weekStart: WEEK, days, sessions, totalSets: 47,
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
      weekStart: WEEK, coachWeek: null, runDays: [addDays(WEEK, 3)],
      appleWorkouts: [{ id: "r1", name: "Laufen", day: addDays(WEEK, 3), minutes: 28, km: 5.4 }],
    },
  },
  volume: {
    ok: true,
    data: { weeks: Array.from({ length: 12 }, (_, i) => ({ weekStart: addDays(WEEK, (i - 11) * 7), sets: i === 11 ? 47 : i === 9 ? 0 : 50 + Math.round(rnd() * 30), sessions: 4 })) },
  },
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
};

const data = empty ? none : full;
const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../app/globals.css"), "utf8");
const body = renderToStaticMarkup(<Dashboard data={data} refreshAction={async () => {}} logoutAction={async () => {}} status={empty ? null : "ok"} />);
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
console.log(`${empty ? "empty" : "full"} preview → ${out} (${html.length} bytes)`);
