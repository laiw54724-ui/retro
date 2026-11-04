import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

const port = 5498;
const baseURL = `http://127.0.0.1:${port}`;

/** WebKit run of the UX candidate's interaction specs (same specs, same fixtures, a different engine). Not a real-device result. */
export default defineConfig({
  ...base,
  retries: 0,
  workers: Number(process.env.UX_WORKERS ?? 1),
  reporter: "list",
  outputDir: "evidence/ux-webkit-browser",
  use: { ...base.use, baseURL },
  projects: [{ name: "webkit", use: { browserName: "webkit" } }],
  webServer: {
    command: `VITE_API_URL=${baseURL} corepack pnpm --filter @retrodesk/web dev --host 127.0.0.1 --port ${port} --strictPort`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
