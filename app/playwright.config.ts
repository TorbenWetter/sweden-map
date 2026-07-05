import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './test',
  timeout: 30_000,
  retries: process.env.CI ? 2 : 0,
  use: { baseURL: 'http://localhost:5199' },
  webServer: {
    command: 'pnpm dev --port 5199 --strictPort',
    url: 'http://localhost:5199',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
