import type {
  BossProgressData, LeadLiftData, MeasurementsData, RecoveryData, RunWeekData, TodayState, TrainingWeekData, WeekSlotsData, WeeklyVolumeData, WeightTrendData,
} from "@/lib/dashboard/queries";
import type { XpLedger } from "@/lib/coach/xp";
import { berlinDay } from "@/lib/dashboard/time";
import type { Loaded } from "./Block";
import { Header, type SyncStatus } from "./Header";
import { Today } from "./Today";
import { WeekBar } from "./WeekBar";
import { Boss } from "./Boss";
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
// script exactly as on the page. Four sections (Gina v2): HEUTE, DIESE WOCHE,
// BOSS, STATS. Reward and action on top, everything explanatory folded below.
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
      <Header />
      <div className="grid grid--stack">
        <Today today={today} recovery={data.recovery} training={data.training} xp={data.xp} state={data.today} />
        <WeekBar slots={data.slots} xp={data.xp} training={data.training} today={today} />
        <Boss boss={data.boss} xp={data.xp} lifts={data.lifts} />
        <Stats
          weight={data.weight} recovery={data.recovery} training={data.training} lifts={data.lifts}
          measurements={data.measurements} run={data.run} volume={data.volume} today={today} open={statsOpen}
        />
      </div>
      <Footer now={data.now} hevySync={data.hevySync} refreshAction={refreshAction} logoutAction={logoutAction} status={status} />
    </main>
  );
}
