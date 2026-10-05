import type { WeekSlotsData } from "@/lib/dashboard/queries";
import { SLOT_LABEL } from "@/lib/dashboard/queries";
import { WEEKDAYS_DE, addDays, fmtDay } from "@/lib/dashboard/time";
import { fromLoader, type Loaded } from "./Block";

// Seven round chips, Monday to Sunday: filled when the slot's session is
// logged, dashed on rest days, outlined in accent for today.
export function WeekChips({ slots, today }: { slots: Loaded<WeekSlotsData>; today: string }) {
  return (
    <section className="card" aria-label="Wochenplan">
      <h2 className="card__h">Wochenplan {fromLoader(slots, (s) => <span className="card__r">{fmtDay(s.weekStart)}–{fmtDay(addDays(s.weekStart, 6))}</span>)}</h2>
      {fromLoader(slots, (s) => (
        <div className="chips" role="list">
          {WEEKDAYS_DE.map((d, i) => {
            const day = addDays(s.weekStart, i);
            const slot = s.slots.find((x) => x.weekday === i);
            const cls = ["chip", slot ? "" : "chip--rest", slot?.filled ? "chip--done" : "", day === today ? "chip--today" : ""].join(" ").trim();
            const title = slot ? (slot.filled ? `${slot.filled.title} · ${fmtDay(slot.filled.day)}` : `${SLOT_LABEL[slot.key]} offen`) : "frei";
            return (
              <div key={day} role="listitem" className={cls} title={title}>
                {d}
                <span>{slot ? SLOT_LABEL[slot.key] : "FREI"}</span>
              </div>
            );
          })}
        </div>
      ))}
    </section>
  );
}
