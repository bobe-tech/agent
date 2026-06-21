import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  use: { baseURL: 'http://localhost:5173' },
  // Automatically start the API (:3001) and the frontend (:5173) (cwd is the monorepo root, where package.json lives).
  // reuseExistingServer: do not restart servers already running locally.
  webServer: [
    {
      command: 'npm run api:start',
      url: 'http://localhost:3001/api/health',
      cwd: '..',
      reuseExistingServer: true,
      timeout: 30_000,
    },
    {
      command: 'npm run front:dev',
      url: 'http://localhost:5173',
      cwd: '..',
      reuseExistingServer: true,
      timeout: 30_000,
    },
  ],
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'tablet', use: { ...devices['iPad (gen 7)'] } },
    { name: 'mobile', use: { ...devices['iPhone 13'] } },
  ],
});
