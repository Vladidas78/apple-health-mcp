import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { proxy, config } from "@/proxy";
import { signWeb, WEB_SESSION_COOKIE } from "@/lib/web-auth";

beforeEach(() => {
  process.env.COACH_WEB_SECRET = "web-s3cr3t";
});

describe("proxy (login gate)", () => {
  it("redirects to /login without a cookie", async () => {
    const res = await proxy(new NextRequest("https://x/"));
    expect(res.status).toBe(302);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/login");
  });
  it("redirects with an invalid cookie", async () => {
    const res = await proxy(new NextRequest("https://x/", { headers: { cookie: `${WEB_SESSION_COOKIE}=bad.token` } }));
    expect(res.status).toBe(302);
  });
  it("passes with a valid cookie", async () => {
    const t = await signWeb();
    const res = await proxy(new NextRequest("https://x/", { headers: { cookie: `${WEB_SESSION_COOKIE}=${t}` } }));
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
  });
  it("matcher excludes api, _next, login, well-known, favicon and manifest", () => {
    const re = new RegExp("^" + config.matcher[0].replace(/\(\(\?!/, "((?!") + "$");
    for (const open of ["/api/mcp", "/api/ingest", "/_next/static/x.js", "/login", "/.well-known/oauth-authorization-server", "/favicon.ico", "/manifest.webmanifest"]) {
      expect(re.test(open), open).toBe(false);
    }
    for (const gated of ["/", "/dashboard", "/anything/else"]) {
      expect(re.test(gated), gated).toBe(true);
    }
  });
});
