import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const headers = readFileSync(new URL("../../public/_headers", import.meta.url), "utf8");
const csp = headers.split("\n").find((line) => line.trim().startsWith("Content-Security-Policy:"))?.split(":").slice(1).join(":").trim() ?? "";
const directives = new Map(csp.split(";").map((part) => part.trim()).filter(Boolean).map((part) => { const [name, ...values] = part.split(/\s+/); return [name, values] as const; }));

describe("Pages Content-Security-Policy", () => {
  it("allows only the official music embed origins to be framed", () => {
    expect(directives.get("frame-src")).toEqual(["https://open.spotify.com", "https://www.youtube-nocookie.com"]);
  });

  it("does not widen script, object, framing or default policy", () => {
    expect(directives.get("default-src")).toEqual(["'self'"]);
    expect(directives.get("script-src")).toEqual(["'self'"]);
    expect(directives.get("object-src")).toEqual(["'none'"]);
    expect(directives.get("frame-ancestors")).toEqual(["'self'"]);
    expect(directives.get("base-uri")).toEqual(["'self'"]);
    expect(csp).not.toMatch(/unsafe-eval|\*|data:\s*;/);
    expect(directives.get("script-src")?.some((value) => value.includes("unsafe"))).toBe(false);
  });

  it("keeps clickjacking and referrer protections on the Retro pages themselves", () => {
    expect(headers).toMatch(/X-Frame-Options: SAMEORIGIN/);
    expect(headers).toMatch(/Referrer-Policy: strict-origin-when-cross-origin/);
    expect(headers).toMatch(/Permissions-Policy: camera=\(\), microphone=\(\), geolocation=\(\)/);
  });

  it("lets HTTPS and uploaded audio play without opening other fetch or frame sources", () => {
    expect(directives.get("media-src")).toEqual(["'self'", "blob:", "https:"]);
    expect(directives.get("connect-src")).toEqual(["'self'", "https:"]);
  });
});
