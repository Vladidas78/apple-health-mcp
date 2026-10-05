import type { RecoveryData, TodayState, TrainingWeekData } from "@/lib/dashboard/queries";
import { heroMode } from "@/lib/dashboard/queries";
import { PLAN } from "@/lib/coach/plan-defaults";
import { fmtDay } from "@/lib/dashboard/time";
import { num } from "./format";
import type { Loaded } from "./Block";
import { coachText } from "./CoachLine";

// What happened today and what is next: logged sessions and bests as short
// lines, the coach's two sentences, and one button into HEVY.

export function todayLines(st: TodayState): string[] {
  const out: string[] = [];
  for (const e of st.events) {
    const m = e.meta ?? {};
    if (e.kind === "session") out.push(`${String(m.routine ?? "Kraft")} gewertet · ${m.sets ?? "–"} Sätze`);
    else if (e.kind === "run") out.push(`Lauf gewertet · ${m.minutes ?? "–"} min${m.km ? ` · ${num(m.km as number)} km` : ""}`);
    else if (e.kind === "pr") {
      const nw = (m.new ?? {}) as { weightKg?: number; reps?: number };
      const v = m.mode === "reps" ? `${nw.reps ?? "–"} Wdh` : m.mode === "added" ? `+${num(nw.weightKg)} × ${nw.reps ?? "–"}` : `${num(nw.weightKg)} × ${nw.reps ?? "–"}`;
      out.push(`Bestwert ${String(m.short ?? m.lift ?? "")} ${v}`);
    } else if (e.kind === "stop_day") out.push("Stopp respektiert, kein Training");
    else if (e.kind === "sets_target") out.push(`Soll ${String(m.muscle ?? "")} erreicht · ${m.sets ?? "–"} Sätze`);
    else if (e.kind === "week_complete") out.push("Woche komplett");
  }
  return out;
}

export function NextUp({ today, state, recovery, training }: {
  today: string;
  state: Loaded<TodayState>;
  recovery: Loaded<RecoveryData>;
  training: Loaded<TrainingWeekData>;
}) {
  const st = state.ok ? state.data : null;
  const ampel = recovery.ok ? recovery.data.ampel : "unbekannt";
  const hero = st ? heroMode(st, ampel) : ({ kind: "pause" } as const);
  const { lines } = coachText(today, recovery.ok ? recovery.data : null, training.ok ? training.data : null);
  const done = st ? todayLines(st) : [];

  let head: string;
  let sub: string | null = null;
  if (!st) { head = "Heute"; sub = "Tageszustand nicht geladen."; }
  else if (hero.kind === "stopp") { head = "Heute: Stopp"; sub = `Ampel rot, kein Training. Morgen ${st.slot ? st.slot.label : "weiter"}.`; }
  else if (st.planWeek < 1) { head = "Plan startet"; sub = `Mo ${fmtDay(PLAN.start)} · PUSH`; }
  else if (st.planWeek > PLAN.weeks) { head = "Plan beendet"; sub = `${PLAN.weeks} Wochen geschafft.`; }
  else if (hero.kind === "xp") { head = "Heute erledigt"; }
  else if (hero.kind === "pause") { head = "Heute: Ruhetag"; }
  else { head = `Heute: ${hero.label}`; sub = st.slot?.key === "LAUF" ? "Lauf ≥ 20 min" : st.routine?.title ?? null; }

  const button = st && st.routine && hero.kind !== "xp" && hero.kind !== "stopp"
    ? { href: st.routine.href, label: `${st.routine.key} in HEVY öffnen`, title: st.routine.title }
    : null;

  return (
    <section className="card card--today" aria-label="Heute">
      <h2 className="card__h">Heute</h2>
      <p className="today__h">{head}</p>
      {sub ? <p className="today__s">{sub}</p> : null}
      {done.length ? (
        <ul className="done">
          {done.map((l, i) => <li key={i}>{l}</li>)}
        </ul>
      ) : null}
      <div className="coach">
        {lines.map((l, i) => <p key={i}>{l}</p>)}
      </div>
      {button ? <a className="cta" href={button.href} title={button.title}>{button.label}</a> : null}
    </section>
  );
}
