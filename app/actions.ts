"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { optionalEnv } from "@/lib/env";
import { syncHevy } from "@/lib/hevy/sync";
import { lastHevySync } from "@/lib/dashboard/queries";
import { verifyWeb, WEB_SESSION_COOKIE } from "@/lib/web-auth";

const SYNC_THROTTLE_MS = 10 * 60_000;

// "Aktualisieren" button: run the HEVY sync now, throttled to once per 10 min
// over max(synced_at). After every run the newest workout's synced_at is bumped,
// so a run with zero changes still counts for the throttle. The result lands in
// the query string (?sync=ok|throttled|error|nokey) and the page shows it.
export async function refreshHevy(): Promise<void> {
  const jar = await cookies();
  if (!(await verifyWeb(jar.get(WEB_SESSION_COOKIE)?.value))) redirect("/login");
  const apiKey = optionalEnv("HEVY_API_KEY");
  if (!apiKey) redirect("/?sync=nokey");

  const db = getDb();
  let status = "ok";
  try {
    const last = await lastHevySync(db);
    if (last && Date.now() - last.getTime() < SYNC_THROTTLE_MS) {
      status = "throttled";
    } else {
      await syncHevy(db, (input, init) => fetch(input, init), { apiKey });
      await db.execute(sql`UPDATE hevy_workouts SET synced_at = now()
        WHERE id = (SELECT id FROM hevy_workouts ORDER BY start_time DESC NULLS LAST LIMIT 1)`);
    }
  } catch (err) {
    console.error("[dashboard/refresh] error:", err instanceof Error ? err.message : err);
    status = "error";
  }
  redirect(`/?sync=${status}`);
}
