import type { WeightTrendData } from "@/lib/dashboard/queries";
import { goalAt } from "@/lib/dashboard/queries";
import { diffDays, fmtDay } from "@/lib/dashboard/time";
import { num } from "./format";
import { Block, Empty, fromLoader, type Loaded } from "./Block";

// 8 weeks: 7-day mean (ink line), daily values (muted dots), goal line (gold,
// dashed). Inline SVG, no library. Hover = native <title>.
const W = 680, H = 200, PL = 34, PR = 44, PT = 12, PB = 22;

function path(points: { x: number; y: number | null }[]): string {
  let d = "";
  let pen = false;
  for (const p of points) {
    if (p.y === null) { pen = false; continue; }
    d += `${pen ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)} `;
    pen = true;
  }
  return d.trim();
}

export function WeightTrend({ data }: { data: Loaded<WeightTrendData> }) {
  return (
    <Block title="Gewicht 8 Wochen" wide right={fromLoader(data, (w) => (w.latestAvg7 !== null ? `7d ${num(w.latestAvg7)} kg` : null))}>
      {fromLoader(data, (w) => {
        const days = diffDays(w.from, w.to) + 1;
        if (!w.points.length) return <Empty>Keine Gewichtswerte in den letzten 8 Wochen. In HEVY oder Apple Health wiegen.</Empty>;
        const goalPts = w.avg7.map((a) => ({ day: a.day, kg: goalAt(a.day) })).filter((g) => g.kg !== null) as { day: string; kg: number }[];
        const values = [...w.points.map((p) => p.kg), ...w.avg7.map((a) => a.kg).filter((x): x is number => x !== null), ...goalPts.map((g) => g.kg)];
        const lo = Math.floor(Math.min(...values) - 0.5);
        const hi = Math.ceil(Math.max(...values) + 0.5);
        const x = (day: string) => PL + ((W - PL - PR) * diffDays(w.from, day)) / (days - 1);
        const y = (kg: number) => PT + ((H - PT - PB) * (hi - kg)) / (hi - lo);
        const step = hi - lo > 6 ? 2 : 1;
        const ticks: number[] = [];
        for (let v = lo; v <= hi; v += step) ticks.push(v);
        const xTicks: string[] = [];
        for (let i = 0; i < days; i += 14) xTicks.push(w.avg7[i].day);
        const avgLine = path(w.avg7.map((a) => ({ x: x(a.day), y: a.kg === null ? null : y(a.kg) })));
        const goalLine = path(goalPts.map((g) => ({ x: x(g.day), y: y(g.kg) })));
        const last = [...w.avg7].reverse().find((a) => a.kg !== null);
        return (
          <>
            <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Gewichtsverlauf, 7-Tage-Mittel zuletzt ${num(w.latestAvg7)} kg`}>
              {ticks.map((v) => (
                <g key={v}>
                  <line className="grid-line" x1={PL} x2={W - PR} y1={y(v)} y2={y(v)} />
                  <text x={PL - 6} y={y(v) + 3} textAnchor="end">{v}</text>
                </g>
              ))}
              {xTicks.map((d) => (
                <text key={d} x={x(d)} y={H - 6} textAnchor="middle">{fmtDay(d)}</text>
              ))}
              {goalLine ? <path className="goal" d={goalLine} /> : null}
              {w.points.map((p) => (
                <circle className="dot dot--raw" key={p.day} cx={x(p.day)} cy={y(p.kg)} r={3}>
                  <title>{`${fmtDay(p.day)} ${num(p.kg)} kg (${p.source === "hevy" ? "HEVY" : "Apple Health"})`}</title>
                </circle>
              ))}
              {avgLine ? <path className="line" d={avgLine} /> : null}
              {last && last.kg !== null ? (
                <g>
                  <circle className="dot dot--gold" cx={x(last.day)} cy={y(last.kg)} r={4.5} />
                  <text className="end-label" x={x(last.day) + 8} y={y(last.kg) + 3}>{num(last.kg)}</text>
                </g>
              ) : null}
            </svg>
            <div className="legend">
              <span><i /> 7-Tage-Mittel</span>
              <span><i style={{ width: 6, height: 6, borderRadius: 3, background: "var(--mute)", border: 0 }} /> Tageswert</span>
              <span><i className="goal" /> Ziel {num(w.goal.startKg)} → {num(w.goal.endKg)}</span>
            </div>
          </>
        );
      })}
    </Block>
  );
}
