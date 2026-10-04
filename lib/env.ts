// Central, validated access to env vars. Throws early with a clear message instead
// of leaking `undefined` into queries or auth checks.
//
// Secret model (one secret per trust boundary, see README "Auth model"):
// - MCP_SECRET        MCP bearer for Claude Code + password for the OAuth /authorize step
// - INGEST_SECRET     bearer Health Auto Export sends to /api/ingest
//                     (falls back to MCP_SECRET while unset, so an existing HAE setup
//                     keeps working until the header is switched over)
// - COACH_WEB_SECRET  browser login password + HMAC key for the `coach_session` cookie
// - HEVY_API_KEY      read-only HEVY API key used by the server-side sync
// - CRON_SECRET       bearer Vercel Cron sends to /api/hevy/sync (falls back to MCP_SECRET)
// - COACH_ENABLED     "true" registers the coach write tools; anything else hides them
export type EnvName =
  | "DATABASE_URL"
  | "MCP_SECRET"
  | "INGEST_SECRET"
  | "COACH_WEB_SECRET"
  | "HEVY_API_KEY"
  | "CRON_SECRET";

export function requireEnv(name: EnvName): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

export function optionalEnv(name: EnvName): string | undefined {
  const v = process.env[name];
  return v ? v : undefined;
}

// Transition rule: INGEST_SECRET wins as soon as it is set; until then MCP_SECRET
// is accepted for ingest so the Health Auto Export header can be switched later.
export function ingestSecret(): string {
  return optionalEnv("INGEST_SECRET") ?? requireEnv("MCP_SECRET");
}

// Same transition rule for the cron route: CRON_SECRET (set by Vercel Cron) or,
// while unset, MCP_SECRET so the route can be triggered by hand.
export function cronSecret(): string {
  return optionalEnv("CRON_SECRET") ?? requireEnv("MCP_SECRET");
}

export function coachEnabled(): boolean {
  return process.env.COACH_ENABLED === "true";
}
