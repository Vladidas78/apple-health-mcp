import type { RecoveryData, TrainingWeekData } from "@/lib/dashboard/queries";
import { PLAN } from "@/lib/coach/plan-defaults";
import { fmtDay, isoWeek, weekdayIndex } from "@/lib/dashboard/time";
import { num } from "./format";
import type { Loaded } from "./Block";
import { planWeek } from "./ScoreCard";

// TODO(coach_assessments): the text of this block must come from
// coach_assessments.text (first two sentences) plus its evidence chips. Until
// the coach writes assessments, a fixed rule produces it: plan week × weekday
// × traffic light. Every sentence here carries a number, nothing else.

const WEEK1 = ["PUSH 50 %, 12 Sätze, RPE ≤ 7", "PULL 50 %, 2 Sätze je Übung, RPE ≤ 7", "LEGS 50 %, Squat 2 × 8 mit 60 kg, ohne Hip Thrust", "frei", "CALI 50 % ohne Zusatzgewicht, RPE ≤ 7", "30 min locker, Z1/Z2", "frei"];
const STANDARD = ["PUSH, 20 Sätze, RIR 2", "LEGS, 21 Sätze, RIR 2", "PULL, 22 Sätze, RIR 2", "Intervall 5–6 × 3 min im 5k-Tempo", "CALI + Beine light, 21 Sätze", "Z2-Lauf 40–50 min", "frei, Check-in unter 5 min"];
const WEEK2 = ["PUSH 75 %, 15 Sätze, RPE 8", "LEGS 75 %, 16 Sätze, RPE 8", "PULL 75 %, 16 Sätze, RPE 8", "Intervall-Einstieg 4 × 3 min im 10k-Tempo", "CALI 75 %, 15 Sätze", "Z2-Lauf 40 min", "frei"];
const DELOAD = ["PUSH Deload, 2 Sätze je Übung, RIR 3–4", "LEGS Deload, 2 Sätze je Übung", "PULL Deload, 2 Sätze je Übung", "kurz 4 × 2 min", "CALI Deload, 2 Sätze je Übung", "Z2-Lauf 40 min", "frei"];

export function coachText(today: string, recovery: RecoveryData | null, training: TrainingWeekData | null): { lines: string[]; chips: string[] } {
  const w = planWeek(today);
  const wd = weekdayIndex(today);
  const lines: string[] = [];
  const chips: string[] = [];

  if (w < 1) {
    lines.push(`Morgen Mo ${fmtDay(PLAN.start)} Start: PUSH 50 %, 12 Sätze, RPE ≤ 7, kein Satz ans Limit.`);
  } else if (w > PLAN.weeks) {
    lines.push("Plan abgeschlossen. Nächster Block wird im Chat geplant.");
  } else {
    const row = w === 1 ? WEEK1 : w === 2 ? WEEK2 : w === 7 ? DELOAD : STANDARD;
    const unit = row[wd];
    const isRest = unit.startsWith("frei");
    const ampel = recovery?.ampel ?? "unbekannt";
    if (ampel === "stopp" && !isRest) {
      lines.push(`Heute Stopp-Tag: ${unit.split(",")[0]} wird verschoben, nicht nachgeholt, ohne Malus.`);
    } else if (ampel === "gelb" && !isRest) {
      lines.push(`Heute ${unit}; Ampel gelb, letzte Sätze 1 RIR mehr, Intervall wird Z2.`);
    } else {
      lines.push(`Heute ${unit}.`);
    }
    if (training) {
      const n = training.sessions.length;
      const done = wd + 1;
      lines.push(`Woche ${w}: ${n} ${n === 1 ? "Einheit" : "Einheiten"}, ${training.totalSets} Sätze bis ${["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"][wd]} (Tag ${done} von 7).`);
    }
  }

  if (recovery && recovery.rhr.today !== null) chips.push(`HEALTH RHR ${num(recovery.rhr.today, 0)} / 7d ${num(recovery.rhr.mean7, 0)}`);
  else if (recovery && recovery.hrv.today !== null) chips.push(`HEALTH HRV ${num(recovery.hrv.today, 0)} / 7d ${num(recovery.hrv.mean7, 0)}`);
  else chips.push("HEALTH keine frischen Werte");
  if (training) chips.push(`HEVY KW ${isoWeek(today)} · ${training.sessions.length} Sessions · ${training.totalSets} Sätze`);
  return { lines, chips };
}

export function CoachLine({ today, recovery, training }: { today: string; recovery: Loaded<RecoveryData>; training: Loaded<TrainingWeekData> }) {
  const { lines, chips } = coachText(today, recovery.ok ? recovery.data : null, training.ok ? training.data : null);
  return (
    <section className="block block--wide" style={{ padding: 0 }}>
      <div className="coach">
        <div className="coach__prefix">&gt; COACH</div>
        {lines.map((l, i) => (
          <p className="coach__line" key={i}>{l}</p>
        ))}
        <div className="chips coach__chips">
          {chips.map((c) => (
            <span className="chip" key={c}>{c}</span>
          ))}
        </div>
      </div>
    </section>
  );
}
