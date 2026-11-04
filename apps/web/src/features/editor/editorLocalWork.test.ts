import { expect, it } from "vitest";
import { hasUnsavedEditorLocalWork, registerEditorLocalWork } from "./editorLocalWork";
it("queries live local work only for its site and removes exactly its registration", () => {
  let dirty = false;
  const removeA = registerEditorLocalWork("a", () => dirty);
  const removeB = registerEditorLocalWork("b", () => true);
  expect(hasUnsavedEditorLocalWork("a")).toBe(false);
  dirty = true;
  expect(hasUnsavedEditorLocalWork("a")).toBe(true);
  removeA(); removeA();
  expect(hasUnsavedEditorLocalWork("a")).toBe(false);
  expect(hasUnsavedEditorLocalWork("b")).toBe(true);
  removeB();
  expect(hasUnsavedEditorLocalWork("b")).toBe(false);
});
