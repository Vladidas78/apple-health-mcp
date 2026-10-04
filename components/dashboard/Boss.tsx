import type { BossProgressData, LeadLiftData } from "@/lib/dashboard/queries";
import type { XpLedger } from "@/lib/coach/xp";
import { PLAN } from "@/lib/coach/plan-defaults";
import { fmtDay } from "@/lib/dashboard/time";
import { num } from "./format";
import { fromLoader, type Loaded } from "./Block";

// BOSS: six progress bars baseline → boss target, then this week's PR feed.
// Halftone texture lives only here.

function fmtVal(mode: unknown, v: { weightKg?: number; reps?: number } | undefined): string {
  if (!v) return "–";
  if (mode === "reps") return `${v.reps ?? "–"} Wdh`;
  if (mode === "added") return `+${num(v.weightKg)} × ${v.reps ?? "–"}`;
  return `${num(v.weightKg)} × ${v.reps ?? "–"}`;
}

// "Noch keiner. Bank fehlt 2,5 kg.": the lift whose 12-week best is closest
// above its latest value. Null when no lift has two comparable values.
export function nearestPr(lifts: LeadLiftData[]): string | null {
  let best: { short: string; delta: number; unit: string } | null = null;
  for (const l of lifts) {
    if (!l.latest) continue;
    const top = Math.max(...l.weeks.filter((w) => w.best).map((w) => w.best!.value));
    const delta = top - l.latest.value;
    if (delta <= 0) continue;
    if (!best || delta < best.delta) best = { short: l.short, delta, unit: l.unit };
  }
  if (!best) return null;
  const d = best.unit === "Wdh" ? `${num(best.delta, 0)} Wdh` : `${num(best.delta, 1)} kg`;
  return `${best.short} ${best.unit === "Wdh" ? "fehlen" : "fehlt"} ${d}.`;
}

export function Boss({ boss, xp, lifts }: { boss: Loaded<BossProgressData>; xp: Loaded<XpLedger>; lifts: Loaded<LeadLiftData[]> }) {
  return (
    <section className="block block--wide boss" aria-label="Boss">
      <h2 className="block__h"><span>Boss</span><span>{fmtDay("2026-12-21")}–{fmtDay(PLAN.end)}</span></h2>
      <h3 className="head boss__title">BOSS · <em>{PLAN.bossWeekLabel}</em></h3>

      {fromLoader(boss, (b) => (
        <>
          <div className="bossbars">
            {b.rows.map((r) => (
              <div className="bossbar" key={r.key} title={`${r.label}: Baseline ${num(r.baseline)} ${r.unit}${r.baselineDay ? ` (${fmtDay(r.baselineDay)})` : ""} · Ist ${num(r.current)} ${r.unit} · Ziel ${num(r.target)} ${r.unit}`}>
                <span className="bossbar__l">{r.label}</span>
                <span className="bossbar__track"><span className="bossbar__fill" style={{ width: `${r.pct ?? 0}%` }} /></span>
                <span className="bossbar__v mono">{r.pct === null ? "–" : `${r.pct} %`}</span>
              </div>
            ))}
          </div>
          {b.rows.some((r) => r.provisional) ? (
            <p className="note mono">Baseline vorläufig bis {fmtDay(b.windowEnd)}: bester Wert der ersten 14 Plan-Tage.</p>
          ) : null}
        </>
      ))}

      <div className="feed">
        <div className="feed__h mono">Neue Bestwerte diese Woche</div>
        {fromLoader(xp, (l) =>
          l.prsThisWeek.length ? (
            <ul className="feed__list">
              {l.prsThisWeek.map((e) => {
                const m = (e.meta ?? {}) as { short?: string; mode?: string; old?: { weightKg?: number; reps?: number }; new?: { weightKg?: number; reps?: number } };
                return (
                  <li className="feed__row" key={e.id}>
                    <span className="feed__lift">{m.short ?? e.sourceId.split(":")[0]}</span>
                    <span className="feed__val mono">
                      <s className="mute">{fmtVal(m.mode, m.old)}</s> <span className="mute">-&gt;</span> <span className="gold">{fmtVal(m.mode, m.new)}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="feed__empty">Noch keiner.{lifts.ok ? ` ${nearestPr(lifts.data) ?? ""}` : ""}</p>
          ),
        )}
      </div>
    </section>
  );
}
