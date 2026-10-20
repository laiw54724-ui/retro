import { describe, expect, it } from "vitest";
import { imageAuthoringAllowed } from "./imageAuthoringGate";

const webOrigin = "https://retrodesk-staging.pages.dev", apiOrigin = "https://retrodesk-api-staging.beibeiz.workers.dev";
const release = { enabled: true, webOrigin, apiOrigin };
const staging = { dev: false, devServer: false, mode: "staging", ordinaryFlag: "true", release, webOrigin, apiOrigin };
describe("staging Image runtime origin boundary", () => {
  it("allows only the exact approved staging pair with compiled release enabled", () => {
    expect(imageAuthoringAllowed(staging)).toBe(true);
    expect(imageAuthoringAllowed({ ...staging, ordinaryFlag: undefined })).toBe(true);
    expect(imageAuthoringAllowed({ ...staging, release: { ...release, enabled: false } })).toBe(false);
  });
  it.each(["production", "test", "", "preview"])("keeps non-staging mode %s off despite both opt-ins", (mode) => {
    expect(imageAuthoringAllowed({ ...staging, mode })).toBe(false);
  });
  it.each([undefined, "http://localhost:5173", "https://retrodesk.pages.dev", "https://preview.retrodesk-staging.pages.dev", "https://retrodesk-staging.pages.dev.evil.test", webOrigin + "/"])("rejects a missing or different runtime origin %s", (origin) => {
    expect(imageAuthoringAllowed({ ...staging, webOrigin: origin })).toBe(false);
  });
  it.each([undefined, "https://other-api.workers.dev", apiOrigin + "/", apiOrigin + "/api"])("rejects a different runtime API %s", (origin) => {
    expect(imageAuthoringAllowed({ ...staging, apiOrigin: origin })).toBe(false);
  });
  it("rejects spoofed compiled targets and keeps development's existing local opt-in", () => {
    expect(imageAuthoringAllowed({ ...staging, release: { ...release, webOrigin: "https://retrodesk.pages.dev" }, webOrigin: "https://retrodesk.pages.dev" })).toBe(false);
    expect(imageAuthoringAllowed({ ...staging, release: { ...release, apiOrigin: "https://other-api.workers.dev" }, apiOrigin: "https://other-api.workers.dev" })).toBe(false);
    expect(imageAuthoringAllowed({ ...staging, dev: true, devServer: true, mode: "development", webOrigin: "http://localhost:5173" })).toBe(true);
    expect(imageAuthoringAllowed({ ...staging, dev: true, devServer: true, mode: "development", ordinaryFlag: undefined })).toBe(false);
    expect(imageAuthoringAllowed({ ...staging, dev: true, mode: "production" })).toBe(false);
    expect(imageAuthoringAllowed({ ...staging, dev: true, mode: "development" })).toBe(false);
    expect(imageAuthoringAllowed({ ...staging, dev: true })).toBe(false);
  });
});
