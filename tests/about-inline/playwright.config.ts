import { defineConfig } from "@playwright/test";
import base from "../../playwright.config";
const port = Number(process.env.ABOUT_TEST_PORT ?? 5606);
const baseURL = `http://127.0.0.1:${port}`;
export default defineConfig({
  ...base, testDir: "../e2e", workers: 1, retries: 0,
  outputDir: process.env.ABOUT_TEST_OUTPUT ?? "../../evidence/about-inline", use: { ...base.use, baseURL },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }, { name: "webkit", use: { browserName: "webkit" } }],
  webServer: { command: `VITE_API_URL=${baseURL} pnpm --filter @retrodesk/web dev --host 127.0.0.1 --port ${port} --strictPort`, url: baseURL, reuseExistingServer: false },
});
