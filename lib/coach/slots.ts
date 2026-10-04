import { WEEK_SLOTS, type RoutineKey, type SlotKey } from "@/lib/coach/plan-defaults";
import { addDays } from "@/lib/dashboard/time";

// Pure slot filling: a session fills the first open slot of its kind, on
// whatever day it happened (PULL on Thursday fills the PULL slot). A second
// PUSH in the same week fills nothing; the two LAUF slots take the first two runs.

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
