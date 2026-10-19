import { defineConfig } from "@playwright/test";

const port = Number(process.env.PLAYWRIGHT_PORT ?? 5261);
const baseURL = `http://127.0.0.1:${port}`;
export default defineConfig({
  testDir: "./tests/image-authoring", timeout: 40_000, retries: 0, workers: 1,
  reporter: "list", use: { baseURL, locale: "en", trace: "retain-on-failure", screenshot: "only-on-failure" },
  webServer: {
    command: `VITE_IMAGE_WINDOW_WRITER=true VITE_API_URL=${baseURL} corepack pnpm --filter @retrodesk/web dev --host 127.0.0.1 --port ${port}`,
    url: baseURL, reuseExistingServer: false, timeout: 120_000
  }, projects: [{ name: "chromium", use: { browserName: "chromium" } }]
});
