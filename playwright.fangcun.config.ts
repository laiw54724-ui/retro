import { defineConfig } from "@playwright/test";
import base from "./playwright.config";
// Match the preview server's four-locale contract in test workers as well.
process.env.VITE_I18N_PREVIEW_LOCALES = "true";
const port = 5651;
const baseURL = `http://127.0.0.1:${port}`;
export default defineConfig({
  ...base, workers: 1, retries: 0,
  outputDir: "test-results/fangcun", use: { ...base.use, baseURL },
  projects: ["chromium", "webkit"].map(browserName => ({ name: browserName, use: { browserName: browserName as "chromium" | "webkit" } })),
  webServer: { command: `VITE_I18N_PREVIEW_LOCALES=true VITE_API_URL=${baseURL} pnpm --filter @retrodesk/web dev --host 127.0.0.1 --port ${port} --strictPort`, url: baseURL, reuseExistingServer: false, timeout: 120_000 },
});
