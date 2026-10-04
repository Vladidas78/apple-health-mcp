import { BODYWEIGHT_KG, epley, type LeadLift } from "@/lib/coach/plan-defaults";

// Pure lead-lift arithmetic shared by the dashboard loaders, the XP ledger and
// the baselines. No database access here.

const round1 = (x: number) => Math.round(x * 10) / 10;

// `value` is the main number of the lift's mode: e1RM (kg), reps, or added kg.
export type BestSet = { day: string; weightKg: number; reps: number; systemLoad: number; e1rm: number; value: number };

// One working set at a lead lift with its workout's instant, as leadSets() loads it.
export type LeadSetRow = { workoutId: string; templateId: string; day: string; start: Date; weightKg: number; reps: number; exerciseIndex: number; setIndex: number };

export function valueOf(lift: LeadLift, weightKg: number, reps: number): { systemLoad: number; e1rm: number; value: number } {
  const calisthenics = lift.mode !== "e1rm";
  const systemLoad = calisthenics ? weightKg + BODYWEIGHT_KG : weightKg;
  const e1rm = round1(epley(systemLoad, reps));
  const value = lift.mode === "e1rm" ? e1rm : lift.mode === "reps" ? reps : weightKg;
  return { systemLoad, e1rm, value };
}

export const betterThan = (a: BestSet, b: BestSet | null): boolean => !b || a.value > b.value || (a.value === b.value && a.e1rm > b.e1rm);

// Best set of a lift over the given rows, mode-aware like leadLifts(): e1RM →
// best Epley, reps → last set of the exercise per workout, added → most added
// weight (ties broken by e1RM). Rows must be ordered as leadSets() returns them.
export function bestOf(lift: LeadLift, all: LeadSetRow[]): BestSet | null {
  const own = new Set(lift.templateIds);
  let mine = all.filter((r) => own.has(r.templateId) && r.reps > 0);
  if (lift.mode === "reps") {
    const last = new Map<string, LeadSetRow>();
    for (const r of mine) last.set(r.workoutId, r);
    mine = [...last.values()];
  }
  let best: BestSet | null = null;
  for (const r of mine) {
    const b: BestSet = { day: r.day, weightKg: r.weightKg, reps: r.reps, ...valueOf(lift, r.weightKg, r.reps) };
    if (betterThan(b, best)) best = b;
  }
  return best;
}
