import { describe, expect, it } from "vitest";
import { moduleDefinitions } from "../modules/registry";
import { groupModules } from "./moduleGroups";

describe("purpose catalog", () => {
  it("includes each available module once and hides Image without writer permission", () => {
    const grouped = groupModules(moduleDefinitions, false).flatMap(group => group.modules);
    expect(grouped.map(module => module.type).sort()).toEqual(moduleDefinitions.filter(module => module.type !== "image").map(module => module.type).sort());
    expect(new Set(grouped.map(module => module.type)).size).toBe(grouped.length);
  });
  it("never adds an unavailable type even with a compatible Image writer", () => {
    const available = moduleDefinitions.filter(module => module.type === "document");
    expect(groupModules(available, true).map(group => group.modules.map(module => module.type))).toEqual([["document"]]);
  });
  it("puts an available, permitted Image alongside visual modules", () => {
    expect(groupModules(moduleDefinitions, true).find(group => group.id === "visual")?.modules.map(module => module.type)).toContain("image");
  });
});
