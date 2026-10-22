import { defineConfig } from "@playwright/test";
import base from "./playwright.config";
const port = 5518;
const baseURL = `http://127.0.0.1:${port}`;
export default defineConfig({
  ...base, retries: 0, workers: 1, reporter: "list", outputDir: "evidence/document-browser",
  use: { ...base.use, baseURL },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }, { name: "webkit", use: { browserName: "webkit" } }],
  webServer: { command: `VITE_API_URL=${baseURL} pnpm --filter @retrodesk/web dev --host 127.0.0.1 --port ${port} --strictPort`, url: baseURL, reuseExistingServer: false, timeout: 120000 }
});
