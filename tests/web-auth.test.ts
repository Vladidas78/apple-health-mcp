import { describe, it, expect, beforeEach } from "vitest";
import { signWeb, verifyWeb, webPasswordOk } from "@/lib/web-auth";
import { issueAccessToken, validateAccessToken } from "@/lib/oauth";

beforeEach(() => {
  process.env.COACH_WEB_SECRET = "web-s3cr3t";
  process.env.MCP_SECRET = "mcp-s3cr3t";
});

describe("web session token", () => {
  it("round-trips sign/verify", async () => {
    expect(await verifyWeb(await signWeb())).toBe(true);
  });
  it("rejects an expired token", async () => {
    const t = await signWeb(10, 1000);
    expect(await verifyWeb(t, 1009)).toBe(true);
    expect(await verifyWeb(t, 1010)).toBe(false);
  });
  it("rejects a token signed with a different key", async () => {
    const t = await signWeb();
    process.env.COACH_WEB_SECRET = "other";
    expect(await verifyWeb(t)).toBe(false);
  });
  it("rejects a tampered body or signature", async () => {
    const t = await signWeb();
    expect(await verifyWeb("x" + t.slice(1))).toBe(false);
    expect(await verifyWeb(t.slice(0, -1) + (t.endsWith("A") ? "B" : "A"))).toBe(false);
  });
  it("rejects garbage, empty and undefined", async () => {
    expect(await verifyWeb("not.a.token")).toBe(false);
    expect(await verifyWeb("")).toBe(false);
    expect(await verifyWeb(undefined)).toBe(false);
  });
  it("fails closed when COACH_WEB_SECRET is unset", async () => {
    const t = await signWeb();
    delete process.env.COACH_WEB_SECRET;
    expect(await verifyWeb(t)).toBe(false);
    await expect(signWeb()).rejects.toThrow(/COACH_WEB_SECRET/);
  });
  it("never accepts an MCP access token as a web session", async () => {
    // Even with identical keys the type tag keeps the two token kinds apart.
    process.env.COACH_WEB_SECRET = "same";
    process.env.MCP_SECRET = "same";
    expect(await verifyWeb(issueAccessToken())).toBe(false);
  });
  it("never accepts a web session as an MCP access token", async () => {
    process.env.COACH_WEB_SECRET = "same";
    process.env.MCP_SECRET = "same";
    expect(validateAccessToken(await signWeb())).toBe(false);
  });
});

describe("webPasswordOk", () => {
  it("compares against COACH_WEB_SECRET only", () => {
    expect(webPasswordOk("web-s3cr3t")).toBe(true);
    expect(webPasswordOk("mcp-s3cr3t")).toBe(false);
    expect(webPasswordOk("")).toBe(false);
  });
  it("is false when the secret is unset", () => {
    delete process.env.COACH_WEB_SECRET;
    expect(webPasswordOk("web-s3cr3t")).toBe(false);
  });
});
