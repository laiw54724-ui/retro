import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

const port = Number(process.env.PLAYWRIGHT_PORT ?? 5262);
const baseURL = `http://127.0.0.1:${port}`;
/** Deliberately set the opt-in in a production build: writers must still stay off. */
export default defineConfig({
  ...base, testMatch: "image-reader-compatibility.spec.ts", retries: 0, workers: 1, reporter: "list",
  use: { ...base.use, baseURL },
  webServer: {
    command: `VITE_IMAGE_WINDOW_WRITER=true VITE_API_URL=${baseURL} corepack pnpm --filter @retrodesk/web build && corepack pnpm --filter @retrodesk/web exec vite preview --host 127.0.0.1 --port ${port}`,
    url: baseURL, reuseExistingServer: false, timeout: 120_000
  }
});
