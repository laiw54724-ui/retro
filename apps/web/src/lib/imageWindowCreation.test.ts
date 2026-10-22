import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });
describe("image writer rollout", () => {
  it.each([[false, "true", false], [true, undefined, false], [true, "false", false], [true, "true", true]] as const)("DEV=%s flag=%s gives %s", async (dev, flag, enabled) => {
    vi.stubEnv("DEV", dev); vi.stubEnv("MODE", "development"); vi.stubEnv("VITE_IMAGE_WINDOW_WRITER", flag);
    const gate = await import("./imageWindowCreation");
    expect(gate.IMAGE_WINDOW_CREATION_ENABLED).toBe(enabled);
    expect(gate.canCreateWindowType("image")).toBe(enabled);
    expect(gate.canCreateWindowType("gallery")).toBe(true);
  });
});
