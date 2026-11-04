import { expect, it } from "vitest";
import en from "./locale-deltas/en.json";
import zh from "./locale-deltas/zh-Hant.json";
import ja from "./locale-deltas/ja.json";
import ko from "./locale-deltas/ko.json";
it("delivers the same nonempty about-only keys in four languages", () => {
  for (const delta of [en, zh, ja, ko]) {
    expect(Object.keys(delta)).toEqual(["about"]);
    expect(Object.keys(delta.about.inline).sort()).toEqual(Object.keys(en.about.inline).sort());
    expect(Object.values(delta.about.inline).every(value => value.trim().length > 0)).toBe(true);
  }
});
