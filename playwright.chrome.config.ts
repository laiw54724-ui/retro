import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

/** Isolated development showcase. No screenshot baselines are shared across engines or OSes. */
export default defineConfig({
  ...base,
  testMatch: "window-chrome.visual.spec.ts",
  outputDir: "test-results/window-chrome",
  snapshotPathTemplate: "{testDir}/__screenshots__/window-chrome/{arg}-{projectName}-{platform}{ext}",
  use: {
    ...base.use,
    viewport: { width: 1160, height: 960 },
    colorScheme: "light",
    reducedMotion: "reduce",
    locale: "en-US",
    timezoneId: "UTC",
    deviceScaleFactor: 1
  },
  expect: {
    toHaveScreenshot: { animations: "disabled", caret: "hide", scale: "css", maxDiffPixels: 20, threshold: 0.15 }
  },
  projects: [
    { name: "chrome-linux", use: { browserName: "chromium" } },
    { name: "chrome-webkit", grep: /@smoke/, use: { browserName: "webkit" } }
  ]
});
