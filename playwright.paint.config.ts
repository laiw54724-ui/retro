import { defineConfig } from "@playwright/test";

const port = Number(process.env.PLAYWRIGHT_PORT ?? 5173);
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "paint-w5a.spec.ts",
  timeout: 30_000,
  workers: 1,
  reporter: "list",
  use: { baseURL, browserName: "chromium", trace: "retain-on-failure" },
  webServer: process.env.PAINT_DEBUG_FILE_URL ? undefined : {
    command: `corepack pnpm --filter @retrodesk/web exec vite --config paint-debug.vite.config.ts --host 127.0.0.1 --port ${port}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000
  }
});
