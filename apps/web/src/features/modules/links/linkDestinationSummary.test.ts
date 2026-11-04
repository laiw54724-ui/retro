import { describe, expect, it } from "vitest";
import { linkDestinationSummary } from "./linkDestinationSummary";

const url = (value: string) => linkDestinationSummary({ target: "url", url: value, windowId: "stale-window" }, []);

describe("link destination feedback", () => {
  it("distinguishes an unfinished URL from unsafe or malformed input", () => {
    for (const value of ["", "  ", "https://", "http://", "mailto:"]) expect(url(value).state).toBe("empty");
    for (const value of ["javascript:alert(1)", "data:text/html,<script>alert(1)</script>", "file:///tmp/test", "/relative", "example.com", "https:// bad"]) {
      expect(url(value).state).toBe("invalid");
    }
  });

  it("keeps the existing HTTP, HTTPS and mailto targets supported", () => {
    expect(url("http://example.com/path")).toMatchObject({ state: "ready", summary: "網址：http://example.com/path" });
    expect(url(" https://example.com/作品?q=test#work ")).toMatchObject({ state: "ready", hint: "在新分頁開啟。" });
    expect(url("mailto:hello@example.com?subject=Hello")).toMatchObject({ state: "ready", summary: "電子郵件：hello@example.com" });
  });

  it("distinguishes missing selection from a deleted window and ignores inactive URL data", () => {
    const windows = [{ id: "about", title: "名片.exe" }];
    const target = { target: "window" as const, url: "javascript:stale-value", windowId: "" };
    expect(linkDestinationSummary(target, windows).state).toBe("empty");
    expect(linkDestinationSummary({ ...target, windowId: "deleted" }, windows)).toMatchObject({ state: "missing", summary: "目標視窗已不存在" });
    expect(linkDestinationSummary({ ...target, windowId: "about" }, windows)).toMatchObject({ state: "ready", summary: "開啟視窗：名片.exe" });
  });

  it("uses the current window title instead of caching a stale destination label", () => {
    const target = { target: "window" as const, url: "", windowId: "about" };
    expect(linkDestinationSummary(target, [{ id: "about", title: "新名片.exe" }]).summary).toBe("開啟視窗：新名片.exe");
    expect(linkDestinationSummary(target, []).state).toBe("missing");
  });
});
