import type { TrainingWeekData } from "@/lib/dashboard/queries";
import { WEEKDAYS_DE, addDays, fmtDay } from "@/lib/dashboard/time";
import { Block, fromLoader, type Loaded } from "./Block";

// Mo–So tiles plus sets per muscle group against the plan target.
export function TrainingWeek({ data, today, fold }: { data: Loaded<TrainingWeekData>; today: string; fold?: boolean }) {
  return (
    <Block fold={fold} title="Trainingswoche" wide right={fromLoader(data, (t) => `${fmtDay(t.weekStart)}–${fmtDay(addDays(t.weekStart, 6))}`)}>
      {fromLoader(data, (t) => (
        <>
          <div className="week" role="list" aria-label="Einheiten der Woche">
            {t.days.map((sessions, i) => {
              const day = addDays(t.weekStart, i);
              const s = sessions[0];
              return (
                <div className={["day", day === today ? "day--today" : "", s ? "" : "day--rest"].join(" ").trim()} key={day} role="listitem">
                  <div className="day__n">{WEEKDAYS_DE[i]} {fmtDay(day).slice(0, 3)}</div>
                  <div className="day__t" title={s?.title}>{s ? s.title : "—"}</div>
                  {s ? <div className="day__m">{s.minutes ?? "–"}′ · {s.sets} S{sessions.length > 1 ? ` +${sessions.length - 1}` : ""}</div> : null}
                </div>
              );
            })}
          </div>
          <div className="bars" aria-label="Sätze je Muskelgruppe">
            {t.muscles.map((m) => {
              const target = m.target ?? 0;
              const pct = target ? Math.min(100, (m.sets / target) * 100) : 0;
              return (
                <div className="bar" key={m.key} title={`${m.label}: ${m.sets} von ${m.target ?? "–"} Sätzen`}>
                  <span className="bar__l">{m.label}</span>
                  <span className="bar__track">
                    <span className={["bar__fill", m.target && m.sets >= m.target ? "bar__fill--full" : ""].join(" ").trim()} style={{ width: `${pct}%`, display: "block" }} />
                  </span>
                  <span className="bar__v">{m.sets}<span>/{m.target ?? "–"}</span></span>
                </div>
              );
            })}
          </div>
          <p className="note">{t.sessions.length} Einheiten · {t.totalSets} Sätze ohne Aufwärmsätze · Soll = Vollvolumen Woche 3–11</p>
        </>
      ))}
    </Block>
  );
}
