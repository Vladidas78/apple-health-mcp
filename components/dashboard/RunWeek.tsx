import type { RunWeekData } from "@/lib/dashboard/queries";
import { WEEKDAYS_DE, fmtDay, weekdayIndex } from "@/lib/dashboard/time";
import { minutes, num } from "./format";
import { Block, fromLoader, type Loaded } from "./Block";

export function RunWeek({ data, fold }: { data: Loaded<RunWeekData>; fold?: boolean }) {
  return (
    <Block fold={fold} title="Laufen">
      {fromLoader(data, (r) => (
        <>
          {r.coachWeek ? (
            <div className="chips chips--stat" style={{ marginBottom: 10 }}>
              <span className="chip">{num(r.coachWeek.runKm)} km</span>
              <span className="chip">{minutes(r.coachWeek.runMinutes)}</span>
              <span className="chip">{r.coachWeek.runCount ?? "–"} Läufe</span>
              {r.coachWeek.hardSessions !== null ? <span className="chip">{r.coachWeek.hardSessions} hart</span> : null}
              <span className="chip chip--mute">{r.coachWeek.source ?? "coach"}</span>
            </div>
          ) : null}
          <div className="chips chips--stat">
            <span className="chip">
              Lauftage <b>{r.runDays.length}</b>
              {r.runDays.length ? <span className="mute"> · {r.runDays.map((d) => WEEKDAYS_DE[weekdayIndex(d)]).join(" ")}</span> : null}
            </span>
          </div>
          {r.appleWorkouts.length ? (
            <ul className="list" style={{ marginTop: 10 }}>
              {r.appleWorkouts.map((w) => (
                <li key={w.id}>
                  <span>{WEEKDAYS_DE[weekdayIndex(w.day)]} {fmtDay(w.day)} {w.name}</span>
                  <span className="mute">{minutes(w.minutes)}{w.km !== null ? ` · ${num(w.km)} km` : ""}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="note">Keine Apple-Health-Workouts diese Woche.</p>
          )}
        </>
      ))}
    </Block>
  );
}
