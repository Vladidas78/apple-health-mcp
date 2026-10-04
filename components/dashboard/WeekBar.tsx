import type { TrainingWeekData, WeekSlotsData } from "@/lib/dashboard/queries";
import { SLOT_LABEL } from "@/lib/dashboard/queries";
import type { XpLedger } from "@/lib/coach/xp";
import { SETS_TARGET_TOTAL } from "@/lib/coach/plan-defaults";
import { WEEKDAYS_DE, addDays, fmtDay } from "@/lib/dashboard/time";
import { num } from "./format";
import { fromLoader, type Loaded } from "./Block";

// DIESE WOCHE: six slots that fill gold on any day, XP and sets of the week,
// and the two counters that only ever go up.
export function WeekBar({ slots, xp, training, today }: {
  slots: Loaded<WeekSlotsData>;
  xp: Loaded<XpLedger>;
  training: Loaded<TrainingWeekData>;
  today: string;
}) {
  return (
    <section className="block block--wide" aria-label="Diese Woche">
      <h2 className="block__h">
        <span>Diese Woche</span>
        {fromLoader(slots, (s) => <span>{fmtDay(s.weekStart)}–{fmtDay(addDays(s.weekStart, 6))}</span>)}
      </h2>
      {fromLoader(slots, (s) => (
        <>
          <div className="slots" role="list" aria-label="Plan-Slots der Woche">
            {s.slots.map((sl, i) => (
              <div
                key={i}
                role="listitem"
                className={["slot", sl.filled ? "slot--done" : "", sl.day === today ? "slot--today" : ""].join(" ").trim()}
                title={sl.filled ? `${sl.filled.title} · ${fmtDay(sl.filled.day)}` : `${SLOT_LABEL[sl.key]} offen`}
              >
                <span className="slot__d">{WEEKDAYS_DE[sl.weekday]}</span>
                <span className="slot__k">{SLOT_LABEL[sl.key]}</span>
              </div>
            ))}
          </div>
          <div className="wk-line mono">
            XP DIESE WOCHE {xp.ok ? num(xp.data.week, 0) : "–"} · SÄTZE {training.ok ? training.data.totalSets : "–"} / {SETS_TARGET_TOTAL}
          </div>
          <div className="wk-line mono mute">WOCHEN GEWERTET {s.weeksCounted} · KOMPLETT {s.weeksComplete}</div>
        </>
      ))}
    </section>
  );
}
