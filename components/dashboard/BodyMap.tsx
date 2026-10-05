import type { MuscleRow } from "@/lib/dashboard/queries";
import type { MuscleKey } from "@/lib/coach/plan-defaults";
import { BODY, type BodySide } from "@/lib/dashboard/body-paths";

// Anatomical figure, front and back, every muscle region tinted by this week's
// working sets against the plan target. Pure SVG, server rendered, no script.
// Regions without a plan group (hands, knees, …) keep the skin tone.

// Plan muscle group → anatomy regions. Front and back share slugs where the
// muscle is visible from both sides (deltoids, triceps, calves, trapezius).
const REGIONS: Record<MuscleKey, string[]> = {
  brust: ["chest"],
  lat: ["upper-back"],
  oberer_ruecken: ["trapezius"],
  schultern: ["deltoids"],
  bizeps: ["biceps"],
  trizeps: ["triceps"],
  quads: ["quadriceps"],
  hamstrings_glutes: ["hamstring", "gluteal"],
  waden: ["calves"],
  core: ["abs", "obliques"],
};

const HAIR = new Set(["hair"]);

// Legend labels short enough for one line next to the figure.
const SHORT: Partial<Record<MuscleKey, string>> = { hamstrings_glutes: "Hamstr. + Po", oberer_ruecken: "Ob. Rücken" };
const short = (m: MuscleRow & { key: MuscleKey }) => SHORT[m.key] ?? m.label;

// 0 = nothing logged, 1 = under half, 2 = under the target, 3 = target reached.
export type Heat = 0 | 1 | 2 | 3;
export function heatOf(sets: number, target: number | null): Heat {
  if (sets <= 0) return 0;
  if (!target) return 1;
  if (sets >= target) return 3;
  if (sets * 2 >= target) return 2;
  return 1;
}

export const HEAT_LABEL: Record<Heat, string> = { 0: "offen", 1: "angefangen", 2: "halb", 3: "Soll erreicht" };

function heatBySlug(muscles: MuscleRow[]): Map<string, Heat> {
  const out = new Map<string, Heat>();
  for (const m of muscles) {
    if (m.key === "sonstiges") continue;
    const heat = heatOf(m.sets, m.target);
    for (const slug of REGIONS[m.key]) out.set(slug, heat);
  }
  return out;
}

function Side({ side, heat }: { side: BodySide; heat: Map<string, Heat> }) {
  const d = BODY[side];
  return (
    <svg className={`body body--${side}`} viewBox={d.viewBox} aria-hidden="true">
      <path className="body__skin" d={d.outline} />
      {d.regions.map((r) => {
        const h = heat.get(r.slug);
        const cls = HAIR.has(r.slug) ? "body__hair" : h === undefined ? "body__skin body__part" : `body__m body__m--${h}`;
        return r.paths.map((p, i) => <path key={`${r.slug}-${i}`} className={cls} d={p} />);
      })}
    </svg>
  );
}

export function BodyMap({ muscles }: { muscles: MuscleRow[] }) {
  const heat = heatBySlug(muscles);
  const groups = muscles.filter((m): m is MuscleRow & { key: MuscleKey } => m.key !== "sonstiges");
  const hot = groups.filter((m) => m.sets > 0).sort((a, b) => heatOf(b.sets, b.target) - heatOf(a.sets, a.target) || b.sets - a.sets);
  const open = groups.filter((m) => m.sets === 0);
  const label = hot.length ? hot.map((m) => `${m.label} ${m.sets} von ${m.target ?? "–"} Sätzen`).join(", ") : "noch keine Sätze diese Woche";
  return (
    <div className="figure" role="img" aria-label={`Muskelkarte der Woche: ${label}`}>
      <div className="figure__bodies">
        <Side side="front" heat={heat} />
        <Side side="back" heat={heat} />
      </div>
      <ul className="figure__legend">
        {hot.slice(0, 5).map((m) => (
          <li key={m.key}>
            <i className={`dot dot--${heatOf(m.sets, m.target)}`} />
            <b>{short(m)}</b> {m.sets}<span className="mute">/{m.target ?? "–"}</span>
          </li>
        ))}
        {open.length ? (
          <li className="figure__open">
            <i className="dot dot--0" />
            {open.length === groups.length ? "Alles offen" : `Offen: ${open.map(short).join(", ")}`}
          </li>
        ) : null}
      </ul>
    </div>
  );
}
