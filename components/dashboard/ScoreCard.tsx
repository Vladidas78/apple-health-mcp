import { PLAN } from "@/lib/coach/plan-defaults";
import { diffDays, fmtDay } from "@/lib/dashboard/time";
import { Block } from "./Block";

// Week of the plan for a day: 0 before the start, 1..12 inside, 13+ after.
export function planWeek(day: string): number {
  const d = diffDays(PLAN.start, day);
  if (d < 0) return 0;
  return Math.floor(d / 7) + 1;
}

// TODO(coach_assessments): once a row for the current week exists, this card
// shows its score as the hero number with the delta to the previous week.
// Until then the plan week is the hero and the score is announced for week 3.
export function ScoreCard({ today }: { today: string }) {
  const w = planWeek(today);
  return (
    <Block title="Wochen-Score">
      {w < 1 ? (
        <>
          <div className="mono small mute">PLAN STARTET</div>
          <div className="hero hero--sm">Mo {fmtDay(PLAN.start)}</div>
          <div className="hero__sub">Woche 1 von {PLAN.weeks} · Score ab Woche 3</div>
        </>
      ) : w > PLAN.weeks ? (
        <>
          <div className="mono small mute">PLAN</div>
          <div className="hero hero--sm">Ende</div>
          <div className="hero__sub">{PLAN.weeks} Wochen abgeschlossen</div>
        </>
      ) : (
        <>
          <div className="mono small mute">WOCHE</div>
          <div className="hero">
            {w}
            <span style={{ fontSize: "0.4em", color: "var(--mute)" }}> /{PLAN.weeks}</span>
          </div>
          <div className="hero__sub">Score ab Woche 3</div>
        </>
      )}
    </Block>
  );
}
