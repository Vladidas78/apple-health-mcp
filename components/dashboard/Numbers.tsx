import type { NutritionData, WeightTrendData } from "@/lib/dashboard/queries";
import { KCAL_RANGE, PROTEIN_MIN_G, PROTEIN_TARGET_G } from "@/lib/dashboard/queries";
import { WEIGHT_GOAL } from "@/lib/coach/plan-defaults";
import { num, signed } from "./format";
import type { Loaded } from "./Block";

// Two big numbers: 7-day weight against the goal, today's protein against the
// target and how many of the last 7 days reached the minimum. Protein is the
// rule, calories are a range.
export function Numbers({ weight, nutrition }: { weight: Loaded<WeightTrendData>; nutrition: Loaded<NutritionData> }) {
  const w = weight.ok ? weight.data : null;
  const kg = w?.latestAvg7 ?? w?.latest?.kg ?? null;
  const f = nutrition.ok ? nutrition.data : null;
  const p = f?.today.proteinG ?? null;
  const kcal = f?.today.kcal ?? null;
  const kcalTone = kcal === null ? "" : kcal > KCAL_RANGE.hi ? "warm" : "";
  return (
    <div className="row">
      <section className="card" aria-label="Gewicht">
        <h2 className="card__h">Gewicht Ø 7 Tage</h2>
        <div className="big">{num(kg)}<small>kg</small></div>
        <div className="big__s">
          {kg === null ? <span className="mute">kein Wert</span> : <>Ziel {num(WEIGHT_GOAL.bossMaxKg)} · <b className={kg > WEIGHT_GOAL.bossMaxKg ? "warm" : ""}>{signed(kg - WEIGHT_GOAL.bossMaxKg, 1)}</b></>}
        </div>
      </section>
      <section className="card" aria-label="Eiweiß heute">
        <h2 className="card__h">Eiweiß heute</h2>
        <div className="big">{p === null ? "–" : p}<small>g</small></div>
        <div className="big__s">
          {!f ? (
            <span className="mute">nicht geladen</span>
          ) : p === null ? (
            <span className="mute">noch nichts in Yazio</span>
          ) : p >= PROTEIN_TARGET_G ? (
            <>Ziel {PROTEIN_TARGET_G} erreicht</>
          ) : p >= PROTEIN_MIN_G ? (
            <>Minimum drin · noch {PROTEIN_TARGET_G - p} bis {PROTEIN_TARGET_G}</>
          ) : (
            <b className="warm">noch {PROTEIN_MIN_G - p} bis {PROTEIN_MIN_G}</b>
          )}
          {f ? (
            <span className="big__m">
              {kcal !== null ? <span className={kcalTone}>{num(kcal, 0)} kcal</span> : null}
              {kcal !== null ? " · " : ""}
              {f.proteinDaysHit}/7 Tage ok
            </span>
          ) : null}
        </div>
      </section>
    </div>
  );
}
