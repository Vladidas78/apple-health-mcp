import { optionalEnv } from "@/lib/env";
import { secretEquals } from "@/lib/secret-compare";

// Browser session token for the dashboard, separate from the MCP/OAuth tokens in
// lib/oauth.ts on purpose: a different key (COACH_WEB_SECRET instead of MCP_SECRET)
// and a different type tag (`t: "web"`), so an MCP access token can never be
// presented as a cookie and a cookie can never be presented as a bearer token.
// Uses Web Crypto (crypto.subtle) instead of node:crypto so the same code runs in
// the proxy, in Server Actions and in route handlers.

export const WEB_SESSION_COOKIE = "coach_session";
export const WEB_SESSION_TTL_S = 60 * 60 * 24 * 90; // 90 days

type WebPayload = { t: "web"; exp: number };

function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): Uint8Array | null {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4);
  try {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

async function hmac(key: string, data: string): Promise<string> {
  const enc = new TextEncoder();
  const k = await crypto.subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", k, enc.encode(data));
  return toBase64Url(new Uint8Array(sig));
}

// Sign a browser session: `base64url(json).hmac`. Throws when COACH_WEB_SECRET is
// unset, because without a key no session may be minted.
export async function signWeb(ttlSec: number = WEB_SESSION_TTL_S, now: number = nowSec()): Promise<string> {
  const key = optionalEnv("COACH_WEB_SECRET");
  if (!key) throw new Error("Missing required env var: COACH_WEB_SECRET");
  const payload: WebPayload = { t: "web", exp: now + ttlSec };
  const body = toBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  return `${body}.${await hmac(key, body)}`;
}

// Verify signature, type and expiry. Fails closed: an unset key, a token signed
// with a different key, a non-"web" payload, or an expired token all yield false.
export async function verifyWeb(token: string | undefined | null, now: number = nowSec()): Promise<boolean> {
  if (!token) return false;
  const key = optionalEnv("COACH_WEB_SECRET");
  if (!key) return false;
  const dot = token.indexOf(".");
  if (dot < 0) return false;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = await hmac(key, body);
  if (!secretEquals(sig, expected)) return false;
  const raw = fromBase64Url(body);
  if (!raw) return false;
  let payload: unknown;
  try {
    payload = JSON.parse(new TextDecoder().decode(raw));
  } catch {
    return false;
  }
  if (!payload || typeof payload !== "object") return false;
  const p = payload as Partial<WebPayload>;
  if (p.t !== "web") return false;
  if (typeof p.exp !== "number" || p.exp <= now) return false;
  return true;
}

// Login password check against COACH_WEB_SECRET. Constant-time; false when unset.
export function webPasswordOk(input: string): boolean {
  const key = optionalEnv("COACH_WEB_SECRET");
  if (!key) return false;
  return secretEquals(input, key);
}
