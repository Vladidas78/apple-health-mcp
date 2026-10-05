import { SESSION_MIN_SETS, WEEK_SLOTS, type RoutineKey, type SlotKey } from "@/lib/coach/plan-defaults";
import { addDays } from "@/lib/dashboard/time";
import type { HevySession, RunSession } from "@/lib/dashboard/queries";

// Pure slot filling: a session fills the first open slot of its kind, on
// whatever day it happened (PULL on Thursday fills the Tuesday PULL slot). A second
// PUSH in the same week fills nothing; the two LAUF slots (Mi, So) take the first two runs.

export type SlotSession = {
  id: string;
  title: string;
  day: string; // Berlin day
  kind: "hevy" | "run";
  routineKey: RoutineKey | null; // null for runs and unmapped strength sessions
  sets: number; // working sets (hevy) or 0
  minutes: number | null;
};

export type Slot = {
  key: SlotKey;
  weekday: number; // 0 = Monday
  day: string;
  filled: SlotSession | null;
};

export function fillSlots(weekStart: string, sessions: SlotSession[]): Slot[] {
  const slots: Slot[] = WEEK_SLOTS.map((s) => ({ key: s.key, weekday: s.weekday, day: addDays(weekStart, s.weekday), filled: null }));
  const sorted = [...sessions].sort((a, b) => a.day.localeCompare(b.day) || a.id.localeCompare(b.id));
  for (const s of sorted) {
    const key: SlotKey | null = s.kind === "run" ? "LAUF" : s.routineKey;
    if (!key) continue;
    const slot = slots.find((x) => x.key === key && !x.filled);
    if (slot) slot.filled = s;
  }
  return slots;
}

export const isComplete = (slots: Slot[]): boolean => slots.every((s) => s.filled);
export const isCounted = (slots: Slot[]): boolean => slots.some((s) => s.filled);

// Sessions that count for a slot: strength with enough working sets, or a run.
export function slotSessionsOf(sessions: HevySession[], runs: RunSession[]): SlotSession[] {
  const out: SlotSession[] = [];
  for (const s of sessions) {
    if (s.sets < SESSION_MIN_SETS) continue;
    out.push({ id: s.id, title: s.title, day: s.day, kind: "hevy", routineKey: s.routineKey, sets: s.sets, minutes: s.minutes });
  }
  for (const r of runs) out.push({ id: r.id, title: r.name, day: r.day, kind: "run", routineKey: null, sets: 0, minutes: r.minutes });
  return out;
}
