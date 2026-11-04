import { defineConfig } from "@playwright/test";

const port = 5214;
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./tests/paint-operation",
  timeout: 30_000,
  workers: 1,
  reporter: "list",
  outputDir: "test-results/paint-operation",
  use: { baseURL, browserName: "chromium", trace: "retain-on-failure", screenshot: "only-on-failure" },
  webServer: {
    command: `cd apps/web && node node_modules/vite/bin/vite.js --config paint-operation.vite.config.ts --configLoader runner --host 127.0.0.1 --port ${port}`,
    url: `${baseURL}/paint-operation-debug.html`,
    reuseExistingServer: false,
    timeout: 120_000
  }
});
