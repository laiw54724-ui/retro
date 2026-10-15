import { describe, expect, it } from "vitest";
import { createWindow, getModule, moduleDefinitions, registry, WINDOW_TYPES } from "./registry";

describe("module registry contract", () => {
  it("keeps one stable ordered definition for all five v1 modules", () => {
    expect(WINDOW_TYPES).toEqual(["document", "gallery", "links", "about", "instagram"]);
    expect(new Set(moduleDefinitions.map((module) => module.type)).size).toBe(5);
    expect(moduleDefinitions.map((module) => module.type)).toEqual(Object.keys(registry));
  });

  it("declares typed metadata and mobile presentation for every module", () => {
    for (const module of moduleDefinitions) {
      expect(module.schemaVersion).toBe(1);
      expect(module.type).toBeTruthy();
      expect(module.icon).toBeTruthy();
      expect(module.capabilities).toMatchObject({ editor: true, visitor: true, mobile: true });
      expect(module.mobile).toEqual({ mode: "window", icon: module.icon });
      expect(typeof module.View).toBe("function");
      expect(typeof module.InlineEditor).toBe("function");
    }
  });

  it("creates the same validated v1 defaults as the shared factory", () => {
    for (const module of moduleDefinitions) {
      const window = module.create(2);
      expect(window.type).toBe(module.type);
      expect(window.layout.mobile.order).toBe(2);
      expect(window.layout.desktop.z).toBe(3);
      expect(window.id).toBeTruthy();
    }
    expect(createWindow("instagram", 0).content.skin).toBe("win98");
  });

  it("rejects missing registrations instead of returning an undefined renderer", () => {
    expect(() => getModule("missing" as never)).toThrow("Unregistered window type: missing");
  });
});
