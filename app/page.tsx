import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { logout } from "./login/actions";
import { refreshHevy } from "./actions";
import { getDb } from "@/lib/db";
import { optionalEnv } from "@/lib/env";
import { verifyWeb, WEB_SESSION_COOKIE } from "@/lib/web-auth";
import { weekStartOf } from "@/lib/dashboard/time";
import {
  lastHevySync, leadLifts, measurements, recovery, runWeek, trainingWeek, weeklyVolume, weightTrend,
} from "@/lib/dashboard/queries";
import { Dashboard, type DashboardData } from "@/components/dashboard/Dashboard";
import type { Loaded } from "@/components/dashboard/Block";
import type { SyncStatus } from "@/components/dashboard/Header";

// Never cache: a cached page behind a proxy mistake would be public.
export const dynamic = "force-dynamic";

// One failed loader must not take the page down: it becomes an inline note in
// its block, every other block renders normally.
async function load<T>(p: Promise<T>): Promise<Loaded<T>> {
  try {
    return { ok: true, data: await p };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.error("[dashboard] loader failed:", error);
    return { ok: false, error };
  }
}

const STATUS = new Set(["ok", "throttled", "error", "nokey"]);

export default async function Home({ searchParams }: { searchParams: Promise<{ sync?: string }> }) {
  // Defense in depth: proxy.ts already redirects, but the page checks the cookie
  // itself so a matcher mistake cannot expose it.
  const jar = await cookies();
  if (!(await verifyWeb(jar.get(WEB_SESSION_COOKIE)?.value))) redirect("/login");

  const { sync } = await searchParams;
  const status = (sync && STATUS.has(sync) ? sync : null) as SyncStatus;
  const now = new Date();
  const weekStart = weekStartOf(now);
  const db = getDb();

  const [weight, rec, training, lifts, meas, run, volume, hevySync] = await Promise.all([
    load(weightTrend(db, 8, now)),
    load(recovery(db, now)),
    load(trainingWeek(db, weekStart)),
    load(leadLifts(db, 12, now)),
    load(measurements(db)),
    load(runWeek(db, weekStart)),
    load(weeklyVolume(db, 12, now)),
    lastHevySync(db).catch(() => null),
  ]);

  const data: DashboardData = { now, hevySync, weight, recovery: rec, training, lifts, measurements: meas, run, volume };
  const canRefresh = !!optionalEnv("HEVY_API_KEY");
  return <Dashboard data={data} refreshAction={canRefresh ? refreshHevy : undefined} logoutAction={logout} status={status} />;
}
