import type { WeeklyVolumeData } from "@/lib/dashboard/queries";
import { fmtDay, isoWeek } from "@/lib/dashboard/time";
import { Block, Empty, fromLoader, type Loaded } from "./Block";

// Sets per week, 12 columns, current week in gold. Only the last column is
// labelled; every column has a hover title.
const W = 320, H = 90, PB = 16, PT = 14;

export function WeeklyVolume({ data, fold }: { data: Loaded<WeeklyVolumeData>; fold?: boolean }) {
  return (
    <Block fold={fold} title="Sätze je Woche">
      {fromLoader(data, (v) => {
        const max = v.weeks.length ? Math.max(...v.weeks.map((w) => w.sets)) : 0;
        if (!max) return <Empty>Keine HEVY-Sätze in den letzten 12 Wochen.</Empty>;
        const n = v.weeks.length;
        const slot = W / n;
        const bw = Math.min(24, slot - 2);
        const y = (s: number) => PT + (H - PT - PB) * (1 - s / max);
        return (
          <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Sätze je Woche, zuletzt ${v.weeks[n - 1].sets}`}>
            <line className="grid-line" x1={0} x2={W} y1={H - PB} y2={H - PB} />
            {v.weeks.map((w, i) => {
              const x = i * slot + (slot - bw) / 2;
              const top = y(w.sets);
              const last = i === n - 1;
              return (
                <g key={w.weekStart}>
                  <rect className={last ? "col col--now" : "col"} x={x} y={top} width={bw} height={Math.max(0, H - PB - top)} rx={w.sets ? 2 : 0} />
                  <title>{`KW ${isoWeek(w.weekStart)} (${fmtDay(w.weekStart)}): ${w.sets} Sätze, ${w.sessions} Einheiten`}</title>
                  {last && w.sets ? <text className="end-label" x={x + bw / 2} y={top - 4} textAnchor="middle">{w.sets}</text> : null}
                  {i % 4 === 0 || last ? <text x={x + bw / 2} y={H - 4} textAnchor="middle">{isoWeek(w.weekStart)}</text> : null}
                </g>
              );
            })}
          </svg>
        );
      })}
    </Block>
  );
}
