import { defineConfig } from "@playwright/test";
const port = Number(process.env.STAGING_I18N_PORT ?? 5641);
const baseURL = `http://127.0.0.1:${port}`;

/** Test the release command's compiled assets; do not inject the locale flag here. */
export default defineConfig({
  testDir: "./tests/staging-i18n", retries: 0, workers: 1, timeout: 30_000,
  reporter: "list", outputDir: "test-results/staging-i18n",
  use: { baseURL, locale: "zh-TW", trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }, { name: "webkit", use: { browserName: "webkit" } }],
  webServer: {
    command: `NODE_ENV=production VITE_API_URL=${baseURL} VITE_SUPABASE_URL=https://example.supabase.co VITE_SUPABASE_ANON_KEY=synthetic-fixture-key pnpm --filter @retrodesk/web build:staging && pnpm --filter @retrodesk/web exec vite preview --host 127.0.0.1 --port ${port} --strictPort`,
    url: baseURL, reuseExistingServer: false, timeout: 120_000,
  },
});
