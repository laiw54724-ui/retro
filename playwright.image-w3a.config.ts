import { defineConfig } from "@playwright/test";

const port = 5212;
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "image-w3a.spec.ts",
  timeout: 30_000,
  workers: 1,
  reporter: "list",
  outputDir: "test-results/image-w3a",
  use: { baseURL, trace: "retain-on-failure", screenshot: "only-on-failure" },
  webServer: {
    command: `cd apps/web && VITE_API_URL=${baseURL} node node_modules/vite/bin/vite.js --config image-w3a.vite.config.ts --configLoader runner --host 127.0.0.1 --port ${port}`,
    url: `${baseURL}/image-w3a-debug.html`,
    reuseExistingServer: false,
    timeout: 120_000
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }]
});
