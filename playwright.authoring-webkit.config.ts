import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

const port = Number(process.env.AUTHORING_WEBKIT_PORT ?? 5624);
const baseURL = `http://127.0.0.1:${port}`;

/** Combined authoring candidate, including the cross-branch regressions. */
export default defineConfig({
  ...base,
  testMatch: ["ig-authoring-v3.spec.ts", "mobile-authoring-v3.spec.ts", "authoring-v3-integration.spec.ts"],
  retries: 0,
  workers: 1,
  reporter: "list",
  outputDir: "test-results/authoring-webkit",
  use: { ...base.use, baseURL },
  projects: [{ name: "webkit", use: { browserName: "webkit" } }],
  webServer: {
    command: `VITE_API_URL=${baseURL} pnpm --filter @retrodesk/web dev --host 127.0.0.1 --port ${port} --strictPort`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
