import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

const port = Number(process.env.SHELL_LOCALES_PORT ?? 5633);
const baseURL = `http://127.0.0.1:${port}`;
/** Japanese/Korean remain preview-only in production; test their actual opt-in build. */
export default defineConfig({
  ...base,
  testDir: "./tests/shell-locales",
  retries: 0, workers: 1, reporter: "list",
  outputDir: "test-results/shell-locales",
  use: { ...base.use, baseURL },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }, { name: "webkit", use: { browserName: "webkit" } }],
  webServer: {
    command: `VITE_I18N_PREVIEW_LOCALES=true VITE_API_URL=${baseURL} pnpm --filter @retrodesk/web dev --host 127.0.0.1 --port ${port} --strictPort`,
    url: baseURL, reuseExistingServer: false, timeout: 120_000,
  },
});
