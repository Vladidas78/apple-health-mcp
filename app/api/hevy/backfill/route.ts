import { getDb } from "@/lib/db";
import { handleHevySync } from "@/app/api/hevy/sync/route";

// One-off HEVY history import, triggered by a dated Vercel Cron (vercel.json) so it
// needs no secret by hand. Same auth as the daily sync; defaults to the first HEVY
// workout month. Remove the cron entry once the import has run.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

export const DEFAULT_HISTORY_FROM = "2025-02-01";

export function withBackfill(req: Request): Request {
  const url = new URL(req.url);
  if (!url.searchParams.has("backfill")) url.searchParams.set("backfill", DEFAULT_HISTORY_FROM);
  return new Request(url, { headers: req.headers });
}

export function GET(req: Request) {
  return handleHevySync(withBackfill(req), getDb);
}
