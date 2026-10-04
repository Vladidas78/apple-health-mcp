import type { RecoveryData } from "@/lib/dashboard/queries";
import { num } from "./format";
import { Block, Empty, fromLoader, type Loaded } from "./Block";

const WORD: Record<RecoveryData["ampel"], string> = { gruen: "Grün", gelb: "Gelb", stopp: "Stopp", unbekannt: "Unbekannt" };

export function RecoveryLight({ data }: { data: Loaded<RecoveryData> }) {
  return (
    <Block title="Erholung">
      {fromLoader(data, (r) => {
        const noData = r.rhr.mean7 === null && r.hrv.mean7 === null && r.sleep.hours === null;
        return (
          <>
            <div className={`ampel ampel--${r.ampel}`} role="status" aria-label={`Erholungsampel ${WORD[r.ampel]}`}>
              {WORD[r.ampel]}
            </div>
            {noData ? (
              <Empty>Keine Ruhepuls- oder HRV-Werte der letzten 36 Stunden. Watch tragen, Health Auto Export prüfen.</Empty>
            ) : (
              <div className="chips">
                <span className="chip">
                  RHR <b>{num(r.rhr.today, 0)}</b> / 7d {num(r.rhr.mean7, 0)} / Basis {num(r.rhr.baseline28, 0)}
                </span>
                <span className="chip">
                  HRV <b>{num(r.hrv.today, 0)}</b> / 7d {num(r.hrv.mean7, 0)}
                </span>
                <span className="chip">Schlaf <b>{num(r.sleep.hours, 1)} h</b></span>
              </div>
            )}
            {r.reasons.length ? <p className="reasons">{r.reasons.join(" · ")}</p> : null}
          </>
        );
      })}
    </Block>
  );
}
