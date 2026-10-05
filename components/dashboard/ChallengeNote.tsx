import { challengeFor } from "@/lib/coach/challenges";
import { planWeek } from "@/lib/coach/plan-defaults";

// The week's challenge as a pinned note. Nothing to show outside the plan.
export function ChallengeNote({ today }: { today: string }) {
  const c = challengeFor(planWeek(today));
  if (!c) return null;
  return (
    <aside className="pin" aria-label="Challenge der Woche">
      <div className="pin__h">Challenge der Woche</div>
      <div className="pin__t">{c.title}</div>
      <div className="pin__p">{c.rule} <span className="mute">Prüfung: {c.check}</span></div>
    </aside>
  );
}
