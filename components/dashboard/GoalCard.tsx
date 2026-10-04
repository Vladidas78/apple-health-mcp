import type { LeadLiftData, MeasurementsData, WeightTrendData } from "@/lib/dashboard/queries";
import { END_BOSS, PLAN } from "@/lib/coach/plan-defaults";
import { fmtDay } from "@/lib/dashboard/time";
import { num, signed } from "./format";
import { Block, fromLoader, type Loaded } from "./Block";

// Boss card: weight meter 92.6 → 88.0 plus the interim bosses of KW 52 with
// Ist/Soll from the lead lifts. Halftone texture lives only here.

function bossSoll(l: LeadLiftData): string {
  if (!l.boss) return "–";
  if (l.mode === "reps") return `${l.boss.reps} Wdh`;
  if (l.mode === "added") return `+${num(l.boss.weightKg)} × ${l.boss.reps}`;
  return `${num(l.boss.weightKg)} × ${l.boss.reps} · e1RM ${num(l.boss.e1rm, 0)}`;
}
function bossIst(l: LeadLiftData): string {
  const b = l.latest;
  if (!b) return "–";
  if (l.mode === "reps") return `${b.reps} Wdh`;
  if (l.mode === "added") return `+${num(b.weightKg)} × ${b.reps}`;
  return `${num(b.weightKg)} × ${b.reps} · e1RM ${num(b.e1rm, 0)}`;
}

export function GoalCard({ weight, lifts, measurements }: {
  weight: Loaded<WeightTrendData>;
  lifts: Loaded<LeadLiftData[]>;
  measurements: Loaded<MeasurementsData>;
}) {
  return (
    <Block title="Boss" wide className="boss">
      <h3 className="head boss__title">
        BOSS · <em>{PLAN.bossWeekLabel}</em>
      </h3>
      <div className="boss__sub">Prüfungswoche {fmtDay("2026-12-21")}–{fmtDay(PLAN.end)} · {PLAN.kcalTarget.toLocaleString("de-DE")} kcal/Tag</div>

      {fromLoader(weight, (w) => {
        const { startKg, endKg } = w.goal;
        const cur = w.latestAvg7;
        const pos = (x: number) => Math.max(0, Math.min(1, (startKg - x) / (startKg - endKg)));
        return (
          <div className="meter">
            <div className="meter__labels">
              <span>{num(startKg)} kg · {fmtDay(w.goal.startDay)}</span>
              <span>{num(endKg)} kg · {fmtDay(w.goal.endDay)}</span>
            </div>
            <div className="meter__track" role="img" aria-label={`Gewicht ${num(cur)} kg, Ziel ${num(endKg)} kg`}>
              {cur !== null ? <div className="meter__fill" style={{ width: `${pos(cur) * 100}%` }} /> : null}
              {w.goalToday !== null ? <div className="meter__goal" style={{ left: `calc(${pos(w.goalToday) * 100}% - 1px)` }} title={`Soll heute ${num(w.goalToday)} kg`} /> : null}
            </div>
            <div className="meter__now">
              Ist 7d-Mittel <b>{cur !== null ? `${num(cur)} kg` : "–"}</b>
              {w.goalToday !== null ? <span className="mute"> · Soll heute {num(w.goalToday)} kg</span> : <span className="mute"> · Ziel-Linie ab {fmtDay(w.goal.startDay)}</span>}
              {cur !== null && w.goalToday !== null ? <span className="mute"> · {signed(cur - w.goalToday, 1, " kg")}</span> : null}
            </div>
          </div>
        );
      })}

      <ul className="boss__list">
        {fromLoader(lifts, (ls) =>
          ls.filter((l) => l.boss).map((l) => (
            <li className="boss__row" key={l.key}>
              <span>{l.short}</span>
              <span className="is">{bossIst(l)}</span>
              <span className="soll">Soll {bossSoll(l)}</span>
            </li>
          )),
        )}
        <li className="boss__row">
          <span>Taille</span>
          <span className="is">
            {fromLoader(measurements, (m) => (m.deltas?.waistCm !== null && m.deltas?.waistCm !== undefined ? `${signed(m.deltas.waistCm, 1, " cm")}` : "Nullmessung KW 41"))}
          </span>
          <span className="soll">Soll −4 cm</span>
        </li>
        <li className="boss__row">
          <span>Gewicht</span>
          <span className="is">{fromLoader(weight, (w) => (w.latestAvg7 !== null ? `${num(w.latestAvg7)} kg` : "–"))}</span>
          <span className="soll">Soll ≤ 88,5 kg</span>
        </li>
      </ul>
      <div className="boss__end">ENDBOSS MÄRZ 2027 · {END_BOSS.map((b) => `${b.label} ${b.target}`).join(" · ")}</div>
    </Block>
  );
}
