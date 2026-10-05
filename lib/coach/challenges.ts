import { PLAN } from "@/lib/coach/plan-defaults";

// Weekly challenge: one per plan week, fixed rotation, no store yet. The
// dashboard shows the text; the coach checks it in the Sunday review.
// TODO(coach_challenges): read from a table once challenges get a result.

export type Challenge = { title: string; rule: string; check: string };

const ROTATION: Challenge[] = [
  { title: "Seitheben: +1 Wdh. in jedem Satz", rule: "Gleiches Gewicht wie letzte Woche.", check: "HEVY Seitheben Kabel" },
  { title: "Eiweiß: 5 Tage ≥ 150 g", rule: "Yazio-Tagessumme zählt.", check: "Yazio · Apple Health" },
  { title: "Klimmzug-Leiter 1-2-3-4-5", rule: "Am Samstag, Pause = Wiederholungen × 10 s.", check: "HEVY CALI" },
  { title: "Toter Hang 60 s am Stück", rule: "Nach dem letzten Satz, Griff schulterbreit.", check: "HEVY CALI" },
  { title: "Schlaf: 5 Nächte ≥ 7 h", rule: "Apple-Health-Schlaf zählt, nicht Bettzeit.", check: "Apple Health" },
  { title: "Schritte: 5 Tage ≥ 8.000", rule: "Laufeinheiten zählen mit.", check: "Apple Health" },
];

// Week 1 starts the rotation; the deload week (7) gets the sleep challenge.
export function challengeFor(planWeek: number): Challenge | null {
  if (planWeek < 1 || planWeek > PLAN.weeks) return null;
  if (planWeek === 7) return ROTATION[4];
  return ROTATION[(planWeek - 1) % ROTATION.length];
}
