import type { LeadLiftData } from "@/lib/dashboard/queries";
import { fmtDay } from "@/lib/dashboard/time";
import { num } from "./format";
import { Block, Empty, fromLoader, type Loaded } from "./Block";

// Per lift: 12-week sparkline of the main number, latest value, boss target.
const SW = 120, SH = 28;

function Sparkline({ lift }: { lift: LeadLiftData }) {
  const vals = lift.weeks.map((w) => w.best?.value ?? null);
  const known = vals.filter((v): v is number => v !== null);
  if (!known.length) return <svg className="spark" viewBox={`0 0 ${SW} ${SH}`} aria-hidden="true"><line className="goal" x1={0} x2={SW} y1={SH / 2} y2={SH / 2} /></svg>;
  const all = lift.boss ? [...known, lift.boss.value] : known;
  const lo = Math.min(...all), hi = Math.max(...all);
  const y = (v: number) => (hi === lo ? SH / 2 : 3 + ((SH - 6) * (hi - v)) / (hi - lo));
  const x = (i: number) => 3 + ((SW - 6) * i) / (vals.length - 1);
  let d = "", pen = false;
  vals.forEach((v, i) => {
    if (v === null) { pen = false; return; }
    d += `${pen ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)} `;
    pen = true;
  });
  const lastIdx = vals.length - 1 - [...vals].reverse().findIndex((v) => v !== null);
  return (
    <svg className="spark" viewBox={`0 0 ${SW} ${SH}`} role="img" aria-label={`${lift.title}, 12 Wochen`}>
      <title>{lift.weeks.filter((w) => w.best).map((w) => `KW ${fmtDay(w.weekStart)} ${num(w.best!.value)}`).join(" · ")}</title>
      {lift.boss ? <line className="goal" x1={0} x2={SW} y1={y(lift.boss.value)} y2={y(lift.boss.value)} /> : null}
      <path className="line" d={d.trim()} />
      {vals.map((v, i) => (v !== null ? <circle key={i} className="dot" cx={x(i)} cy={y(v)} r={i === lastIdx ? 3 : 0} /> : null))}
    </svg>
  );
}

function sub(l: LeadLiftData): string {
  const b = l.latest;
  if (!b) return "keine Sätze in 12 Wochen";
  const set = l.mode === "added" ? `+${num(b.weightKg)} kg × ${b.reps}` : `${num(b.weightKg)} kg × ${b.reps}`;
  if (l.mode === "e1rm") return `${set} · ${fmtDay(b.day)}`;
  if (l.mode === "reps") return `letzter Satz · ${fmtDay(b.day)}`;
  return `${set} · System ${num(b.systemLoad, 0)} kg · e1RM ${num(b.e1rm, 0)}`;
}

export function LeadLifts({ data }: { data: Loaded<LeadLiftData[]> }) {
  return (
    <Block title="Leitübungen 12 Wochen" wide>
      {fromLoader(data, (ls) =>
        ls.every((l) => !l.latest) ? (
          <Empty>Noch keine Sätze an den Leitübungen in den letzten 12 Wochen.</Empty>
        ) : (
          <div className="lifts">
            {ls.map((l) => (
              <div className="lift" key={l.key}>
                <div>
                  <div className="lift__t">{l.title}</div>
                  <div className="lift__s">{sub(l)}</div>
                </div>
                <Sparkline lift={l} />
                <div className="lift__v">
                  <b>{l.latest ? num(l.latest.value, l.mode === "reps" ? 0 : 1) : "–"}</b> {l.latest ? l.unit : ""}
                  <span className="soll">
                    {l.boss ? `Boss ${num(l.boss.value, l.mode === "reps" ? 0 : 0)} ${l.unit}` : l.mode === "e1rm" ? "e1RM" : l.mode === "reps" ? "max. Wdh" : "Zusatz kg"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ),
      )}
    </Block>
  );
}
