import type {
  BossProgressData, LeadLiftData, MeasurementsData, RecoveryData, RunWeekData, TodayState, TrainingWeekData, WeekSlotsData, WeeklyVolumeData, WeightTrendData,
} from "@/lib/dashboard/queries";
import type { XpLedger } from "@/lib/coach/xp";
import { berlinDay } from "@/lib/dashboard/time";
import type { Loaded } from "./Block";
import { Header, type SyncStatus } from "./Header";
import { Ampel } from "./Ampel";
import { Figure } from "./Figure";
import { WeekChips } from "./WeekChips";
import { Numbers } from "./Numbers";
import { Mission } from "./Mission";
import { ChallengeNote } from "./ChallengeNote";
import { NextUp } from "./NextUp";
import { Stats } from "./Stats";
import { Footer } from "./Footer";

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
  xp: Loaded<XpLedger>;
  slots: Loaded<WeekSlotsData>;
  boss: Loaded<BossProgressData>;
  today: Loaded<TodayState>;
};

// Pure view: no data access, no Next imports, so it renders in the preview
// script exactly as on the page. Top to bottom: greeting and rank, traffic
// light, figure, week chips, two numbers, mission, challenge, today with the
// HEVY button, folded stats.
export function Dashboard({ data, refreshAction, logoutAction, status, statsOpen }: {
  data: DashboardData;
  refreshAction?: (formData: FormData) => Promise<void>;
  logoutAction?: (formData: FormData) => Promise<void>;
  status?: SyncStatus;
  statsOpen?: boolean;
}) {
  const today = berlinDay(data.now);
  return (
    <main className="wrap">
      <Header today={today} xp={data.xp} />
      <Ampel recovery={data.recovery} />
      <NextUp today={today} state={data.today} recovery={data.recovery} training={data.training} />
      <Figure training={data.training} />
      <WeekChips slots={data.slots} today={today} />
      <Numbers weight={data.weight} training={data.training} />
      <Mission boss={data.boss} lifts={data.lifts} xp={data.xp} />
      <ChallengeNote today={today} />
      <Stats
        weight={data.weight} recovery={data.recovery} training={data.training} lifts={data.lifts}
        measurements={data.measurements} run={data.run} volume={data.volume} today={today} open={statsOpen}
      />
      <Footer now={data.now} hevySync={data.hevySync} refreshAction={refreshAction} logoutAction={logoutAction} status={status} />
    </main>
  );
}
