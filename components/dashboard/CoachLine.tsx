import type { RecoveryData, TrainingWeekData } from "@/lib/dashboard/queries";
import { PLAN, planWeek } from "@/lib/coach/plan-defaults";
import { fmtDay, isoWeek, weekdayIndex } from "@/lib/dashboard/time";
import { num } from "./format";
import type { Loaded } from "./Block";

// TODO(coach_assessments): the text of this block must come from
// coach_assessments.text (first two sentences) plus its evidence chip. Until
// the coach writes assessments, a fixed rule produces it: plan week × weekday
// × traffic light. Two sentences, one chip (Gina v2), every sentence a number.

// Index = weekday (0 = Mo): PUSH, PULL, Lauf, frei, LEGS + Finisher, CALI, Lauf nach Ampel.
const WEEK1 = ["PUSH 50 %, 12 Sätze, RPE ≤ 7", "PULL 50 %, 2 Sätze je Übung, Klimmzug ohne Zusatz, RPE ≤ 7", "30 min locker mit Kollege, Z1/Z2", "frei", "LEGS 50 %, Squat 2 × 8 mit 60 kg, ohne Finisher", "CALI 50 % ohne Zusatzgewicht, RPE ≤ 7", "frei"];
const STANDARD = ["PUSH, 20 Sätze, RIR 2, 60 min", "PULL, 22 Sätze, RIR 2, 60 min", "Lauf mit Kollege, locker Z2, 40–50 min", "frei", "LEGS, 3–4 Sätze je Übung, 40 min, dann Finisher 6 × 1 min Rudern oder Ski", "CALI, 20 Sätze, Max-Test Klimmzüge", "Lauf locker 30–40 min, nur bei grüner Ampel"];
const WEEK2 = ["PUSH 75 %, 15 Sätze, RPE 8, Baseline Bank", "PULL 75 %, 16 Sätze, RPE 8", "Lauf mit Kollege, locker Z2, 40 min", "frei", "LEGS 75 %, 16 Sätze, RPE 8, Finisher 4 × 1 min", "CALI 75 %, erster Max-Test Klimmzüge", "Lauf locker 30 min, nur bei grüner Ampel"];
const DELOAD = ["PUSH Deload, 2 Sätze je Übung, RIR 3–4", "PULL Deload, 2 Sätze je Übung", "Lauf mit Kollege, locker Z2, 40 min", "frei", "LEGS Deload, 2 Sätze je Übung, ohne Finisher", "CALI Deload, 2 Sätze je Übung", "Spaziergang oder frei"];

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

  // One evidence chip: the traffic light's when it changed the advice, else HEVY.
  const ampel = recovery?.ampel ?? "unbekannt";
  const healthChip = recovery && recovery.rhr.today !== null
    ? `HEALTH RHR ${num(recovery.rhr.today, 0)} / 7d ${num(recovery.rhr.mean7, 0)}`
    : recovery && recovery.hrv.today !== null
      ? `HEALTH HRV ${num(recovery.hrv.today, 0)} / 7d ${num(recovery.hrv.mean7, 0)}`
      : "HEALTH keine frischen Werte";
  const hevyChip = training ? `HEVY KW ${isoWeek(today)} · ${training.sessions.length} Sessions · ${training.totalSets} Sätze` : null;
  chips.push(ampel === "gelb" || ampel === "stopp" || !hevyChip ? healthChip : hevyChip);
  return { lines: lines.slice(0, 2), chips: chips.slice(0, 1) };
}

export function CoachLine({ today, recovery, training }: { today: string; recovery: Loaded<RecoveryData>; training: Loaded<TrainingWeekData> }) {
  const { lines, chips } = coachText(today, recovery.ok ? recovery.data : null, training.ok ? training.data : null);
  return (
    <div className="coach">
      <div className="coach__prefix">&gt; COACH</div>
      {lines.map((l, i) => (
        <p className="coach__line" key={i}>{l}</p>
      ))}
      <div className="chips chips--stat">
        {chips.map((c) => (
          <span className="chip" key={c}>{c}</span>
        ))}
      </div>
    </div>
  );
}
