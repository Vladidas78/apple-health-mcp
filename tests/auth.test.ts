import { describe, it, expect, beforeEach } from "vitest";
import { secretOk, ingestOk, cronOk, isAuthorized, bearerToken } from "@/lib/auth";
import { ingestSecret, cronSecret, coachEnabled } from "@/lib/env";
import { secretEquals } from "@/lib/secret-compare";
import { issueAccessToken } from "@/lib/oauth";

beforeEach(() => {
  process.env.MCP_SECRET = "s3cr3t";
  delete process.env.INGEST_SECRET;
  delete process.env.CRON_SECRET;
  delete process.env.COACH_ENABLED;
});

function req(url: string, headers: Record<string, string> = {}) {
  return new Request(url, { headers });
}

describe("secretOk (MCP static secret)", () => {
  it("accepts a correct Authorization: Bearer header", () => {
    expect(secretOk(req("https://x/api/mcp", { authorization: "Bearer s3cr3t" }))).toBe(true);
  });
  it("no longer accepts the ?key query parameter", () => {
    expect(secretOk(req("https://x/api/mcp?key=s3cr3t"))).toBe(false);
    expect(isAuthorized(req("https://x/api/mcp?key=s3cr3t"))).toBe(false);
  });
  it("rejects a wrong secret", () => {
    expect(secretOk(req("https://x/api/mcp", { authorization: "Bearer nope" }))).toBe(false);
  });
  it("rejects a missing secret", () => {
    expect(secretOk(req("https://x/api/mcp"))).toBe(false);
  });
  it("rejects an empty bearer", () => {
    expect(bearerToken(req("https://x/api/mcp", { authorization: "Bearer " }))).toBeNull();
    expect(secretOk(req("https://x/api/mcp", { authorization: "Bearer " }))).toBe(false);
  });
});

describe("ingestOk (INGEST_SECRET with MCP_SECRET fallback)", () => {
  it("falls back to MCP_SECRET while INGEST_SECRET is unset", () => {
    expect(ingestSecret()).toBe("s3cr3t");
    expect(ingestOk(req("https://x/api/ingest", { authorization: "Bearer s3cr3t" }))).toBe(true);
  });
  it("accepts only INGEST_SECRET once it is set", () => {
    process.env.INGEST_SECRET = "ingest-only";
    expect(ingestSecret()).toBe("ingest-only");
    expect(ingestOk(req("https://x/api/ingest", { authorization: "Bearer ingest-only" }))).toBe(true);
    expect(ingestOk(req("https://x/api/ingest", { authorization: "Bearer s3cr3t" }))).toBe(false);
  });
  it("never accepts INGEST_SECRET on the MCP endpoint", () => {
    process.env.INGEST_SECRET = "ingest-only";
    expect(isAuthorized(req("https://x/api/mcp", { authorization: "Bearer ingest-only" }))).toBe(false);
  });
  it("ignores ?key", () => {
    expect(ingestOk(req("https://x/api/ingest?key=s3cr3t"))).toBe(false);
  });
});

describe("cronOk", () => {
  it("accepts MCP_SECRET while CRON_SECRET is unset", () => {
    expect(cronSecret()).toBe("s3cr3t");
    expect(cronOk(req("https://x/api/hevy/sync", { authorization: "Bearer s3cr3t" }))).toBe(true);
  });
  it("accepts CRON_SECRET and still MCP_SECRET (manual trigger) once set", () => {
    process.env.CRON_SECRET = "cron-only";
    expect(cronOk(req("https://x/api/hevy/sync", { authorization: "Bearer cron-only" }))).toBe(true);
    expect(cronOk(req("https://x/api/hevy/sync", { authorization: "Bearer s3cr3t" }))).toBe(true);
    expect(cronOk(req("https://x/api/hevy/sync", { authorization: "Bearer nope" }))).toBe(false);
  });
});

describe("isAuthorized", () => {
  it("accepts a valid OAuth access token", () => {
    expect(isAuthorized(req("https://x/api/mcp", { authorization: `Bearer ${issueAccessToken()}` }))).toBe(true);
  });
  it("rejects garbage", () => {
    expect(isAuthorized(req("https://x/api/mcp", { authorization: "Bearer not.a.token" }))).toBe(false);
  });
});

describe("secretEquals", () => {
  it("compares equal and unequal strings, including length mismatches", () => {
    expect(secretEquals("abc", "abc")).toBe(true);
    expect(secretEquals("abc", "abd")).toBe(false);
    expect(secretEquals("abc", "abcd")).toBe(false);
    expect(secretEquals("", "")).toBe(true);
    expect(secretEquals("", "a")).toBe(false);
  });
});

describe("coachEnabled", () => {
  it("is true only for the literal string \"true\"", () => {
    expect(coachEnabled()).toBe(false);
    process.env.COACH_ENABLED = "1";
    expect(coachEnabled()).toBe(false);
    process.env.COACH_ENABLED = "true";
    expect(coachEnabled()).toBe(true);
  });
});
