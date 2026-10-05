import type { BossProgressData, LeadLiftData } from "@/lib/dashboard/queries";
import type { XpLedger } from "@/lib/coach/xp";
import { PLAN } from "@/lib/coach/plan-defaults";
import { fmtDay } from "@/lib/dashboard/time";
import { num } from "./format";
import { fromLoader, type Loaded } from "./Block";

// MISSION KW 52: four lift cards, one accent each, then waist and weight as
// two lines, then this week's new bests.

const TONE: Record<string, string> = { bench: "y", pullup_bw: "o", dip: "r", squat: "b" };

function cur(r: BossProgressData["rows"][number], lifts: LeadLiftData[]): string {
  const l = lifts.find((x) => x.key === r.key);
  const b = l?.latest;
  if (!b) return "–";
  if (l.mode === "reps") return `${b.reps}`;
  if (l.mode === "added") return `+${num(b.weightKg)}×${b.reps}`;
  return `${num(b.weightKg)}×${b.reps}`;
}

function goal(r: BossProgressData["rows"][number], lifts: LeadLiftData[]): string {
  const l = lifts.find((x) => x.key === r.key);
  const t = l?.boss;
  if (!l || !t) return r.target === null ? "–" : `${num(r.target)} ${r.unit}`;
  if (l.mode === "reps") return `${t.reps}`;
  if (l.mode === "added") return `+${num(t.weightKg)}×${t.reps}`;
  return `${num(t.weightKg)}×${t.reps}`;
}

function fmtPr(mode: unknown, v: { weightKg?: number; reps?: number } | undefined): string {
  if (!v) return "–";
  if (mode === "reps") return `${v.reps ?? "–"} Wdh`;
  if (mode === "added") return `+${num(v.weightKg)} × ${v.reps ?? "–"}`;
  return `${num(v.weightKg)} × ${v.reps ?? "–"}`;
}

export function Mission({ boss, lifts, xp }: { boss: Loaded<BossProgressData>; lifts: Loaded<LeadLiftData[]>; xp: Loaded<XpLedger> }) {
  const ls = lifts.ok ? lifts.data : [];
  return (
    <section className="card" aria-label="Mission">
      <h2 className="card__h">Mission {PLAN.bossWeekLabel} <span className="card__r">bis {fmtDay(PLAN.end)}</span></h2>
      {fromLoader(boss, (b) => {
        const cards = b.rows.filter((r) => TONE[r.key]);
        const rest = b.rows.filter((r) => !TONE[r.key]);
        return (
          <>
            <div className="missions">
              {cards.map((r) => (
                <div className={`m m--${TONE[r.key]}`} key={r.key} title={`${r.label}: Basis ${num(r.baseline)} ${r.unit} · Ist ${num(r.current)} ${r.unit} · Ziel ${num(r.target)} ${r.unit}`}>
                  <div className="m__l">{r.label}</div>
                  <div className="m__v">{cur(r, ls)}</div>
                  <div className="m__g">Ziel {goal(r, ls)}</div>
                  <div className="m__bar"><i style={{ width: `${r.pct ?? 0}%` }} /></div>
                </div>
              ))}
            </div>
            <ul className="mrows">
              {rest.map((r) => (
                <li key={r.key}>
                  <span>{r.label}</span>
                  <span className="mrows__v">
                    <b>{num(r.current)}</b> {r.unit} <span className="mute">· Ziel {r.key === "weight" ? "≤ " : ""}{num(r.target)} {r.unit}</span>
                  </span>
                </li>
              ))}
            </ul>
            {b.rows.some((r) => r.provisional) ? <p className="note">Basis vorläufig bis {fmtDay(b.windowEnd)}: bester Wert der ersten 14 Tage.</p> : null}
          </>
        );
      })}
      {fromLoader(xp, (l) =>
        l.prsThisWeek.length ? (
          <ul className="prs">
            {l.prsThisWeek.map((e) => {
              const m = (e.meta ?? {}) as { short?: string; mode?: string; old?: { weightKg?: number; reps?: number }; new?: { weightKg?: number; reps?: number } };
              return (
                <li key={e.id}>
                  <span className="tag tag--yellow">Bestwert</span> <b>{m.short ?? e.sourceId.split(":")[0]}</b> {fmtPr(m.mode, m.new)} <span className="mute">vorher {fmtPr(m.mode, m.old)}</span>
                </li>
              );
            })}
          </ul>
        ) : null,
      )}
    </section>
  );
}
