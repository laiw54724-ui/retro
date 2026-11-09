import { describe, expect, it } from "vitest";
import { buildPublishChecks, createStarterDocument, makeWindow } from "../src";

describe("pre-publish overlap warning", () => {
  function document() {
    const doc = createStarterDocument("Review desktop");
    doc.windows = [makeWindow("about", 0), makeWindow("links", 1)];
    doc.windows.forEach((window) => { window.defaultOpen = true; window.layout.desktop = { ...window.layout.desktop, x: 20, y: 20, w: 300, h: 300 }; });
    return doc;
  }
  it("warns instead of presenting overlapping auto-open windows as a pass", () => {
    const checks = buildPublishChecks(document());
    expect(checks.find((check) => check.text.includes("自動開啟 2"))?.level).toBe("warn");
    expect(checks.find((check) => check.text.includes("有重疊"))?.level).toBe("warn");
  });
  it("includes character dialogs that auto-show even with defaultOpen disabled", () => {
    const doc = document();
    const character = makeWindow("character-dialog", 2);
    if (character.type !== "character-dialog") throw new Error("fixture type");
    character.defaultOpen = false;
    character.content.autoShow = true;
    character.layout.desktop = { ...character.layout.desktop, ...doc.windows[0].layout.desktop };
    doc.windows = [doc.windows[0], character];
    expect(buildPublishChecks(doc).find((check) => check.text.includes("自動開啟 2"))?.level).toBe("warn");
    character.content.autoShow = false;
    expect(buildPublishChecks(doc).some((check) => check.text.includes("有重疊"))).toBe(false);
  });
  it("does not flag touching edges, separated or closed windows", () => {
    for (const mode of ["touching", "separated", "closed"] as const) {
      const doc = document();
      doc.windows[1].layout.desktop.x = mode === "touching" ? 320 : mode === "separated" ? 400 : 20;
      if (mode === "closed") doc.windows[1].defaultOpen = false;
      expect(buildPublishChecks(doc).some((check) => check.text.includes("有重疊"))).toBe(false);
    }
  });
});
