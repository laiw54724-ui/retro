import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

const port = 5497;
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  ...base,
  retries: 0,
  workers: 1,
  reporter: "list",
  outputDir: "../evidence/ux-integration-browser",
  use: { ...base.use, baseURL },
  webServer: {
    command: `VITE_API_URL=${baseURL} corepack pnpm --filter @retrodesk/web dev --host 127.0.0.1 --port ${port} --strictPort`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
