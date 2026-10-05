import type { TrainingWeekData, WeightTrendData } from "@/lib/dashboard/queries";
import { SETS_TARGET_TOTAL, WEIGHT_GOAL } from "@/lib/coach/plan-defaults";
import { num, signed } from "./format";
import type { Loaded } from "./Block";

// Two big numbers: 7-day weight against the goal, working sets of the week
// against the full-volume target.
export function Numbers({ weight, training }: { weight: Loaded<WeightTrendData>; training: Loaded<TrainingWeekData> }) {
  const w = weight.ok ? weight.data : null;
  const kg = w?.latestAvg7 ?? w?.latest?.kg ?? null;
  const t = training.ok ? training.data : null;
  return (
    <div className="row">
      <section className="card" aria-label="Gewicht">
        <h2 className="card__h">Gewicht Ø 7 Tage</h2>
        <div className="big">{num(kg)}<small>kg</small></div>
        <div className="big__s">
          {kg === null ? <span className="mute">kein Wert</span> : <>Ziel {num(WEIGHT_GOAL.bossMaxKg)} · <b className={kg > WEIGHT_GOAL.bossMaxKg ? "warm" : ""}>{signed(kg - WEIGHT_GOAL.bossMaxKg, 1)}</b></>}
        </div>
      </section>
      <section className="card" aria-label="Sätze der Woche">
        <h2 className="card__h">Sätze Woche</h2>
        <div className="big">{t ? t.totalSets : "–"}<small>/{SETS_TARGET_TOTAL}</small></div>
        <div className="big__s">{t ? `${t.sessions.length} ${t.sessions.length === 1 ? "Einheit" : "Einheiten"}` : <span className="mute">nicht geladen</span>}</div>
      </section>
    </div>
  );
}
