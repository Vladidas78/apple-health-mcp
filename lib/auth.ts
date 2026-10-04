import { cronSecret, ingestSecret, requireEnv } from "@/lib/env";
import { secretEquals } from "@/lib/secret-compare";
import { validateAccessToken } from "@/lib/oauth";

// Bearer token from the Authorization header, or null. The former `?key=` query
// parameter is gone on purpose: it put the secret into browser history, Vercel
// logs and screenshots.
export function bearerToken(req: Request): string | null {
  const auth = req.headers.get("authorization");
  if (!auth || !auth.startsWith("Bearer ")) return null;
  const token = auth.slice(7).trim();
  return token.length ? token : null;
}

function bearerMatches(req: Request, expected: string): boolean {
  const token = bearerToken(req);
  return token !== null && secretEquals(token, expected);
}

// Static MCP secret (Claude Code header, Routine env).
export function secretOk(req: Request): boolean {
  return bearerMatches(req, requireEnv("MCP_SECRET"));
}

// Ingest (Health Auto Export): INGEST_SECRET, or MCP_SECRET while INGEST_SECRET is unset.
export function ingestOk(req: Request): boolean {
  return bearerMatches(req, ingestSecret());
}

// Cron route: CRON_SECRET (Vercel Cron sends it as a bearer) or MCP_SECRET as a
// manual trigger. Both are accepted at the same time so a hand-triggered sync keeps
// working after CRON_SECRET is set.
export function cronOk(req: Request): boolean {
  if (bearerMatches(req, cronSecret())) return true;
  return bearerMatches(req, requireEnv("MCP_SECRET"));
}

// MCP endpoint authorization: accept EITHER the static secret (Claude Code) OR a
// valid OAuth access token (claude.ai web/mobile, which require OAuth).
export function isAuthorized(req: Request): boolean {
  if (secretOk(req)) return true;
  const token = bearerToken(req);
  return token !== null && validateAccessToken(token);
}
