import { cronOk } from "@/lib/auth";
import { optionalEnv } from "@/lib/env";
import { getDb } from "@/lib/db";
import { syncHevy } from "@/lib/hevy/sync";
import type { FetchLike } from "@/lib/hevy/client";

// Daily HEVY → Postgres mirror. Triggered by Vercel Cron (vercel.json, bearer
// CRON_SECRET) or by hand with the MCP secret. GET because Vercel Cron sends GET.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

type Db = Parameters<typeof syncHevy>[0];

export async function handleHevySync(
  req: Request,
  getDbFn: () => Db,
  fetchImpl: FetchLike = (input, init) => fetch(input, init),
): Promise<Response> {
  if (!cronOk(req)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const apiKey = optionalEnv("HEVY_API_KEY");
  if (!apiKey) return Response.json({ error: "HEVY_API_KEY not set" }, { status: 503 });
  try {
    const summary = await syncHevy(getDbFn(), fetchImpl, { apiKey });
    return Response.json(summary, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "sync failed";
    console.error("[hevy/sync] error:", message);
    return Response.json({ error: "sync failed", detail: message }, { status: 502 });
  }
}

export function GET(req: Request) {
  return handleHevySync(req, getDb);
}
