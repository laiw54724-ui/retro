import { defineConfig } from "@playwright/test";
import authoring from "./playwright.image-authoring.config";
import reader from "./playwright.image-reader-production.config";
import renderer from "./playwright.image-w3a.config";

/** Local fixture acceptance only: reuses the existing authoring harness and its guards. */
const mode = process.env.IMAGE_READINESS_MODE ?? "authoring";
if (!["authoring", "reader", "renderer"].includes(mode)) throw new Error("Unknown IMAGE_READINESS_MODE");
const suite = mode === "reader" ? reader : mode === "renderer" ? renderer : authoring;
export default defineConfig({
  ...suite,
  outputDir: `test-results/image-readiness-${mode}`,
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
    { name: "webkit", use: { browserName: "webkit" } }
  ]
});
