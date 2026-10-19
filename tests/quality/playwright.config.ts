import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: '.', timeout: 60000, workers: 1, retries: 0, maxFailures: 1,
  reporter: [['list']], outputDir: '../../test-results/quality',
  use: { screenshot: 'only-on-failure', baseURL: 'http://127.0.0.1:5197', locale: 'zh-TW', viewport: { width: 1280, height: 800 } },
  webServer: { command: 'node scripts/quality-server.mjs', cwd: process.cwd(), url: 'http://127.0.0.1:5197', reuseExistingServer: false },
});
