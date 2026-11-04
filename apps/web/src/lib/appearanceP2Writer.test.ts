import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

describe("P2 rollout exclusion", () => {
  it("cannot enable production writing by setting the build flag", async () => {
    vi.stubEnv("DEV", false);
    vi.stubEnv("VITE_APPEARANCE_P2_WRITER", "true");
    expect((await import("./appearanceP2Writer")).APPEARANCE_P2_WRITER_ENABLED).toBe(false);
  });
  it("keeps a default local build off", async () => {
    vi.stubEnv("DEV", true);
    vi.stubEnv("VITE_APPEARANCE_P2_WRITER", undefined);
    expect((await import("./appearanceP2Writer")).APPEARANCE_P2_WRITER_ENABLED).toBe(false);
  });
  it("allows the opted-in local harness for bounded writer verification", async () => {
    vi.stubEnv("DEV", true);
    vi.stubEnv("VITE_APPEARANCE_P2_WRITER", "true");
    expect((await import("./appearanceP2Writer")).APPEARANCE_P2_WRITER_ENABLED).toBe(true);
  });
});
