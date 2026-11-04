import { defineConfig } from "@playwright/test";
import base from "../../playwright.config";
const port = Number(process.env.PRIMITIVES_PORT ?? 5861), baseURL = `http://127.0.0.1:${port}`;
export default defineConfig({ ...base, testDir: "../e2e", testMatch: "editing-primitives.spec.ts", outputDir: "../../evidence/editing-primitives", workers: 2, retries: 0, use: { ...base.use, baseURL }, projects: [{ name: "chromium", use: { browserName: "chromium" } }, { name: "webkit", use: { browserName: "webkit" } }], webServer: { command: `VITE_API_URL=${baseURL} pnpm --filter @retrodesk/web dev --host 127.0.0.1 --port ${port} --strictPort`, url: baseURL, reuseExistingServer: false } });
