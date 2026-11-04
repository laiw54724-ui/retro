import { defineConfig } from "@playwright/test";
import base from "../../playwright.config";
const port = 5808;
const baseURL = `http://127.0.0.1:${port}`;
export default defineConfig({ ...base, testDir: "../e2e", testMatch: "moodboard*.spec.ts", workers: 1, retries: 0, timeout: 40000, outputDir: "../../test-results/inline-moodboard", use: { ...base.use, baseURL }, webServer: { command: `VITE_API_URL=${baseURL} pnpm --filter @retrodesk/web dev --host 127.0.0.1 --port ${port}`, url: baseURL, reuseExistingServer: true }, projects: [{ name: "chromium", use: { browserName: "chromium" } }, { name: "webkit", use: { browserName: "webkit" } }] });
