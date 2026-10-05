import type { XpLedger } from "@/lib/coach/xp";
import { PLAN, planWeek } from "@/lib/coach/plan-defaults";
import { WEEKDAYS_DE, fmtDay, weekdayIndex } from "@/lib/dashboard/time";
import type { Loaded } from "./Block";

export type SyncStatus = "ok" | "throttled" | "error" | "nokey" | null;

export const SYNC_MSG: Record<Exclude<SyncStatus, null>, string> = {
  ok: "HEVY aktualisiert.",
  throttled: "Zuletzt vor unter 10 min synchronisiert.",
  error: "HEVY-Sync fehlgeschlagen, alte Daten.",
  nokey: "HEVY_API_KEY fehlt.",
};

// Greeting, date with plan week, and the rank as a pixel label. The rank is
// the only trace of the XP ledger on the page: no bar, no counter.
export function Header({ today, xp }: { today: string; xp: Loaded<XpLedger> }) {
  const w = planWeek(today);
  const week = w < 1 ? `Start Mo ${fmtDay(PLAN.start)}` : w > PLAN.weeks ? "Plan beendet" : `Woche ${w}/${PLAN.weeks}`;
  return (
    <header className="top">
      <div>
        <h1 className="top__h">Hey Vladi</h1>
        <p className="top__sub">{WEEKDAYS_DE[weekdayIndex(today)]}, {fmtDay(today)} · {week}</p>
      </div>
      {xp.ok ? <span className="tag tag--blue" title={`Rang ${xp.data.level.level} · ${xp.data.total} XP`}>{xp.data.level.name}</span> : null}
    </header>
  );
}
