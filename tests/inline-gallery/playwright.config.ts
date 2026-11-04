import { defineConfig } from "@playwright/test";
import base from "../../playwright.config";

/** Local gallery candidate gate. Uses the ordinary dev-server and API fixture boundary. */
export default defineConfig({
  ...base,
  testDir: "../e2e",
  testMatch: ["inline-gallery.spec.ts", "media-tasks.spec.ts"],
  workers: 1,
  retries: 0,
  outputDir: "../../test-results/inline-gallery-gate",
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
    { name: "webkit", use: { browserName: "webkit" } }
  ]
});
