import type {
  LeadLiftData, MeasurementsData, RecoveryData, RunWeekData, TrainingWeekData, WeeklyVolumeData, WeightTrendData,
} from "@/lib/dashboard/queries";
import { berlinDay } from "@/lib/dashboard/time";
import type { Loaded } from "./Block";
import { Header, type SyncStatus } from "./Header";
import { ScoreCard } from "./ScoreCard";
import { RecoveryLight } from "./RecoveryLight";
import { CoachLine } from "./CoachLine";
import { GoalCard } from "./GoalCard";
import { TrainingWeek } from "./TrainingWeek";
import { RunWeek } from "./RunWeek";
import { WeightTrend } from "./WeightTrend";
import { LeadLifts } from "./LeadLifts";
import { Measurements } from "./Measurements";
import { WeeklyVolume } from "./WeeklyVolume";

export type DashboardData = {
  now: Date;
  hevySync: Date | null;
  weight: Loaded<WeightTrendData>;
  recovery: Loaded<RecoveryData>;
  training: Loaded<TrainingWeekData>;
  lifts: Loaded<LeadLiftData[]>;
  measurements: Loaded<MeasurementsData>;
  run: Loaded<RunWeekData>;
  volume: Loaded<WeeklyVolumeData>;
};

// Pure view: no data access, no Next imports, so it renders in the preview
// script exactly as on the page. Order = Gina's reading order.
export function Dashboard({ data, refreshAction, logoutAction, status }: {
  data: DashboardData;
  refreshAction?: (formData: FormData) => Promise<void>;
  logoutAction?: (formData: FormData) => Promise<void>;
  status?: SyncStatus;
}) {
  const today = berlinDay(data.now);
  return (
    <main className="wrap">
      <Header now={data.now} hevySync={data.hevySync} refreshAction={refreshAction} status={status} />
      <div className="grid">
        <ScoreCard today={today} />
        <RecoveryLight data={data.recovery} />
        <CoachLine today={today} recovery={data.recovery} training={data.training} />
        <GoalCard weight={data.weight} lifts={data.lifts} measurements={data.measurements} />
        <TrainingWeek data={data.training} today={today} />
        <RunWeek data={data.run} />
        <WeeklyVolume data={data.volume} />
        <WeightTrend data={data.weight} />
        <LeadLifts data={data.lifts} />
        <Measurements data={data.measurements} />
      </div>
      <footer className="ftr">
        <span className="mono">Kraft &amp; Figur Q4 2026</span>
        {logoutAction ? (
          <form action={logoutAction}>
            <button type="submit" className="btn">Abmelden</button>
          </form>
        ) : null}
      </footer>
    </main>
  );
}
