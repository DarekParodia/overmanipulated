import { defineConfig, devices } from '@playwright/test';

// Local sandboxes may ship their own Chromium (PW_CHROMIUM_PATH); CI uses `playwright install`.
const executablePath = process.env.PW_CHROMIUM_PATH;
const launchOptions = executablePath ? { executablePath } : {};

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions,
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 768 }, launchOptions },
    },
    {
      name: 'mobile',
      use: {
        ...devices['Pixel 7 landscape'],
        launchOptions,
      },
    },
  ],
  webServer: [
    {
      command: 'bun apps/server/src/index.ts',
      url: 'http://localhost:3000/health',
      env: { PORT: '3000', DATABASE_PATH: ':memory:', LOG_LEVEL: 'silent' },
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'bun run build && cd apps/client && bunx vite preview --port 4173 --strictPort',
      url: 'http://localhost:4173',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
