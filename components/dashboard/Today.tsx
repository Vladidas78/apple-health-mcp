import type { RecoveryData, TodayState, TrainingWeekData } from "@/lib/dashboard/queries";
import { heroMode } from "@/lib/dashboard/queries";
import type { XpLedger } from "@/lib/coach/xp";
import { PLAN } from "@/lib/coach/plan-defaults";
import { WEEKDAYS_DE, fmtDay } from "@/lib/dashboard/time";
import { num } from "./format";
import { fromLoader, type Loaded } from "./Block";
import { CoachLine } from "./CoachLine";
import { XpCount } from "./XpCount";

// HEUTE (Gina v2 §3): hero (what now / what did I get), evidence line, level
// bar, traffic-light line, coach block, HEVY button. Gold = reward only.

const AMPEL_WORD: Record<RecoveryData["ampel"], string> = { gruen: "GRÜN", gelb: "GELB", stopp: "STOPP", unbekannt: "UNBEKANNT" };

export function prLine(meta: Record<string, unknown> | null): string {
  if (!meta) return "BESTWERT";
  const nw = (meta.new ?? {}) as { weightKg?: number; reps?: number; value?: number };
  const short = String(meta.short ?? meta.lift ?? "").toUpperCase();
  if (meta.mode === "reps") return `BESTWERT ${short} ${nw.reps ?? "–"} WDH`;
  if (meta.mode === "added") return `BESTWERT ${short} +${num(nw.weightKg)} × ${nw.reps ?? "–"}`;
  return `BESTWERT ${short} ${num(nw.weightKg)} × ${nw.reps ?? "–"}`;
}

// Evidence line under a "+N XP" hero: one entry per awarded event, mono caps.
export function evidenceLines(events: TodayState["events"]): { text: string; gold: boolean }[] {
  const out: { text: string; gold: boolean }[] = [];
  for (const e of events) {
    const m = e.meta ?? {};
    const day = typeof m.day === "string" ? fmtDay(m.day) : "";
    if (e.kind === "session") out.push({ text: `${String(m.routine ?? "KRAFT")} GEWERTET · HEVY ${day} · ${m.sets ?? "–"} SÄTZE`, gold: false });
    else if (e.kind === "run") out.push({ text: `LAUF GEWERTET · HEALTH ${day} · ${m.minutes ?? "–"} MIN${m.km ? ` · ${num(m.km as number)} KM` : ""}`, gold: false });
    else if (e.kind === "pr") out.push({ text: prLine(e.meta), gold: true });
    else if (e.kind === "stop_day") out.push({ text: `STOPP RESPEKTIERT · ${fmtDay(e.sourceId)} · +${e.xp} XP`, gold: false });
    else if (e.kind === "sets_target") out.push({ text: `SOLL ${String(m.muscle ?? "").toUpperCase().replace("_", "/")} · ${m.sets ?? "–"} SÄTZE · +${e.xp} XP`, gold: false });
    else if (e.kind === "week_complete") out.push({ text: `WOCHE KOMPLETT · 6/6 · +${e.xp} XP`, gold: true });
  }
  return out;
}

// Anton runs about 0.45 em per glyph: scale the hero so the longest label
// ("+1.000 XP") still fits 390 px minus gutters, capped at 120 px.
export function heroStyle(text: string): { fontSize: string } {
  return { fontSize: `min(120px, ${Math.round(175 / Math.max(4, text.length))}vw)` };
}

export function Today({ today, recovery, training, xp, state }: {
  today: string;
  recovery: Loaded<RecoveryData>;
  training: Loaded<TrainingWeekData>;
  xp: Loaded<XpLedger>;
  state: Loaded<TodayState>;
}) {
  const rec = recovery.ok ? recovery.data : null;
  const ampel = rec?.ampel ?? "unbekannt";
  const st = state.ok ? state.data : null;
  const hero = st ? heroMode(st, ampel) : ({ kind: "pause" } as const);
  const wd = WEEKDAYS_DE[st?.weekday ?? 0].toUpperCase();

  return (
    <section className="block block--wide today" aria-label="Heute">
      <h2 className="block__h"><span>Heute</span><span>{wd} {fmtDay(today)}</span></h2>

      {hero.kind === "xp" ? (
        <div className="hero hero--xp" role="status" style={heroStyle(`+${hero.xp.toLocaleString("de-DE")} XP`)}><XpCount xp={hero.xp} /></div>
      ) : hero.kind === "stopp" ? (
        <div className="hero hero--stopp" role="status" style={heroStyle("STOPP")}>STOPP</div>
      ) : hero.kind === "pause" ? (
        <div className="hero hero--pause" role="status" style={heroStyle("PAUSE")}>PAUSE</div>
      ) : (
        <div className="hero hero--slot" role="status" style={heroStyle(hero.label)}>{hero.label}</div>
      )}

      <div className="beleg mono">
        {!state.ok ? (
          <div className="mute">Tageszustand nicht geladen.</div>
        ) : hero.kind === "xp" ? (
          evidenceLines(st!.events).map((l, i) => <div key={i} className={l.gold ? "gold" : ""}>{l.text}</div>)
        ) : hero.kind === "stopp" ? (
          <div>AMPEL STOPP · HEUTE KEIN TRAINING · MORGEN {st!.slot ? st!.slot.label : "WEITER"}</div>
        ) : st!.planWeek < 1 ? (
          <div>PLAN STARTET MO {fmtDay(PLAN.start)} · PUSH</div>
        ) : st!.planWeek > PLAN.weeks ? (
          <div>PLAN BEENDET · {PLAN.weeks} WOCHEN</div>
        ) : hero.kind === "pause" ? (
          <div>RUHETAG · WOCHE {st!.planWeek} / {PLAN.weeks}</div>
        ) : (
          <div>WOCHE {st!.planWeek} / {PLAN.weeks} · {st!.slot?.key === "LAUF" ? "LAUF ≥ 20 MIN" : `HEVY ${st!.routine?.key}`}{st!.done.length ? " · HEUTE SCHON GELOGGT" : ""}</div>
        )}
      </div>

      {fromLoader(xp, (l) => (
        <div className="level" aria-label={`Level ${l.level.level} ${l.level.name}, ${l.total} XP`}>
          <div className="level__track">
            <div className="level__fill" style={{ width: `${Math.round(l.level.progress * 100)}%` }} />
          </div>
          <div className="level__txt mono">
            <span>{l.level.name.toUpperCase()}</span>
            <span>{num(l.total, 0)} / {l.level.next === null ? "MAX" : num(l.level.next, 0)}</span>
          </div>
        </div>
      ))}

      <div className="ampel-line mono">
        <span className={`ampel-word ampel-word--${ampel}`}>{AMPEL_WORD[ampel]}</span>
        {rec && (rec.rhr.today !== null || rec.hrv.today !== null) ? (
          <>
            {rec.rhr.today !== null ? <span> · RHR {num(rec.rhr.today, 0)} / BASIS {num(rec.rhr.baseline28 ?? rec.rhr.mean7, 0)}</span> : null}
            {rec.hrv.today !== null ? <span> · HRV {num(rec.hrv.today, 0)} / 7D {num(rec.hrv.mean7, 0)}</span> : null}
          </>
        ) : (
          <span className="mute"> · KEINE FRISCHEN WERTE</span>
        )}
      </div>

      <CoachLine today={today} recovery={recovery} training={training} />

      {st && st.routine && hero.kind !== "xp" && hero.kind !== "stopp" ? (
        <a className="btn btn--big" href={st.routine.href} title={st.routine.title}>In HEVY öffnen</a>
      ) : null}
    </section>
  );
}
