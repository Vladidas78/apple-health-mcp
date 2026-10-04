import type {
  LeadLiftData, MeasurementsData, RecoveryData, RunWeekData, TrainingWeekData, WeeklyVolumeData, WeightTrendData,
} from "@/lib/dashboard/queries";
import { num } from "./format";
import type { Loaded } from "./Block";
import { TrainingWeek } from "./TrainingWeek";
import { WeightTrend } from "./WeightTrend";
import { WeeklyVolume } from "./WeeklyVolume";
import { LeadLifts } from "./LeadLifts";
import { RunWeek } from "./RunWeek";
import { Measurements } from "./Measurements";
import { RecoveryLight } from "./RecoveryLight";

// STATS: closed by default; the summary line carries the three numbers, every
// block inside is its own closed <details>. `open` only for the preview.
export function Stats({ weight, recovery, training, lifts, measurements, run, volume, today, open }: {
  weight: Loaded<WeightTrendData>;
  recovery: Loaded<RecoveryData>;
  training: Loaded<TrainingWeekData>;
  lifts: Loaded<LeadLiftData[]>;
  measurements: Loaded<MeasurementsData>;
  run: Loaded<RunWeekData>;
  volume: Loaded<WeeklyVolumeData>;
  today: string;
  open?: boolean;
}) {
  const kg = weight.ok && weight.data.latestAvg7 !== null ? num(weight.data.latestAvg7) : weight.ok && weight.data.latest ? num(weight.data.latest.kg) : "–";
  const sets = training.ok ? training.data.totalSets : "–";
  const runs = run.ok ? run.data.appleWorkouts.length : "–";
  return (
    <details className="block block--wide stats" open={open}>
      <summary className="stats__sum mono">
        <span>STATS</span>
        <span className="mute">·</span>
        <span>GEWICHT {kg}</span>
        <span className="mute">·</span>
        <span>{sets} SÄTZE</span>
        <span className="mute">·</span>
        <span>{runs} {runs === 1 ? "LAUF" : "LÄUFE"}</span>
      </summary>
      <div className="grid stats__grid">
        <TrainingWeek data={training} today={today} fold />
        <WeightTrend data={weight} fold />
        <WeeklyVolume data={volume} fold />
        <LeadLifts data={lifts} fold />
        <RunWeek data={run} fold />
        <Measurements data={measurements} fold />
        <RecoveryLight data={recovery} fold />
      </div>
    </details>
  );
}
