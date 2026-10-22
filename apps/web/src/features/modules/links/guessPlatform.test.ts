import { describe, expect, it } from "vitest";
import { guessPlatform, normalizeLinkInput } from "./guessPlatform";

describe("pasted link recognition", () => {
  it("normalizes domains and email, preserving valid URLs", () => {
    expect(normalizeLinkInput(" example.com/a?q=1 ")).toBe("https://example.com/a?q=1");
    expect(normalizeLinkInput("artist+work@example.com")).toBe("mailto:artist+work@example.com");
    expect(normalizeLinkInput("https://example.com/a")).toBe("https://example.com/a");
  });
  it.each(["javascript:alert(1)", "https://", "mailto:", "not a url", "ftp://example.com", "https://x.com@evil.test/a", "https://a b.com"])("rejects unsafe or incomplete input %s", (value) => {
    expect(normalizeLinkInput(value)).toBeNull();
  });
  it("checks the canonical URL limit after adding a scheme", () => {
    expect(normalizeLinkInput("example.com/" + "a".repeat(2030))).toBeNull();
    expect(normalizeLinkInput("https://example.com/" + "a".repeat(2028))).not.toBeNull();
  });
  it("matches host boundaries rather than arbitrary URL text", () => {
    expect(guessPlatform("https://www.instagram.com/mochi")).toEqual({ label: "Instagram", icon: "camera", color: "#c2185b" });
    expect(guessPlatform("https://evil.test/instagram.com").label).toBe("evil.test");
    expect(guessPlatform("https://notinstagram.com").label).toBe("notinstagram.com");
    expect(guessPlatform("mailto:a@example.com").icon).toBe("mail");
  });
  it.each(["x.com", "twitter.com", "threads.net", "youtube.com", "youtu.be", "pixiv.net", "facebook.com", "fb.me", "tiktok.com", "discord.gg", "open.spotify.com", "github.com", "plurk.com", "ko-fi.com", "patreon.com", "bsky.app", "booth.pm"])("recognizes %s", (host) => {
    expect(guessPlatform(`https://${host}/a`).icon).not.toBe("link");
  });
});
