import { defineConfig } from "@playwright/test";
import base from "./playwright.authoring-webkit.config";

const port = Number(process.env.SHELL_WEBKIT_PORT ?? 5632);
const baseURL = `http://127.0.0.1:${port}`;
export default defineConfig({
  ...base,
  testMatch: ["shell-authoring-v3.spec.ts", "ig-authoring-v3.spec.ts", "mobile-authoring-v3.spec.ts", "authoring-v3-integration.spec.ts", "mobile-content-settings.spec.ts", "mobile-history-status.spec.ts"],
  outputDir: "test-results/shell-webkit",
  use: { ...base.use, baseURL },
  webServer: {
    command: `VITE_API_URL=${baseURL} pnpm --filter @retrodesk/web dev --host 127.0.0.1 --port ${port} --strictPort`,
    url: baseURL, reuseExistingServer: false, timeout: 120_000,
  },
});
