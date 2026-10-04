import { sql } from "drizzle-orm";
import { PLAN, type LeadLift } from "@/lib/coach/plan-defaults";
import { bestOf, type LeadSetRow } from "@/lib/coach/lifts";
import { addDays } from "@/lib/dashboard/time";
import type { Db } from "@/lib/dashboard/queries";

// Boss baselines (0 % of each boss bar). Reading and the pure derivation live
// here; writing (once, never overwrite) is setBaselines() in lib/coach/xp.ts.

export type BaselineKey = "bench" | "pullup_bw" | "dip" | "squat" | "waist" | "weight";
export type Baseline = { key: BaselineKey; value: number; day: string; mode: string };
export const BASELINE_WINDOW_DAYS = 14;
export const baselineWindowEnd = (): string => addDays(PLAN.start, BASELINE_WINDOW_DAYS);

const n = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
};

export async function readBaselines(db: Db): Promise<Map<BaselineKey, Baseline>> {
  const r = await db.execute(sql`SELECT lift_key, value::float8 AS value, day::text AS day, mode FROM coach_lift_baselines`);
  const rs = (r.rows ?? r) as { lift_key: BaselineKey; value: unknown; day: unknown; mode: string }[];
  return new Map(rs.map((x) => [x.lift_key, { key: x.lift_key, value: n(x.value) ?? 0, day: String(x.day).slice(0, 10), mode: x.mode }]));
}

// Lift baseline from rows up to the end of the window: best of the first 14 plan
// days, else the best set of the last session before the plan start.
export function liftBaselineFrom(lift: LeadLift, lead: LeadSetRow[]): { value: number; day: string } | null {
  const windowEnd = baselineWindowEnd();
  const inWindow = bestOf(lift, lead.filter((r) => r.day >= PLAN.start && r.day < windowEnd));
  if (inWindow) return { value: inWindow.value, day: inWindow.day };
  const before = lead.filter((r) => r.day < PLAN.start && lift.templateIds.includes(r.templateId));
  if (!before.length) return null;
  const lastId = before[before.length - 1].workoutId;
  const last = bestOf(lift, before.filter((r) => r.workoutId === lastId));
  return last ? { value: last.value, day: last.day } : null;
}
