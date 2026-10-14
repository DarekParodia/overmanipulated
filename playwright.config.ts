import { defineConfig, devices } from '@playwright/test';

// Local sandboxes may ship their own Chromium (PW_CHROMIUM_PATH); CI uses `playwright install`.
const executablePath = process.env.PW_CHROMIUM_PATH;
const launchOptions = executablePath ? { executablePath } : {};
// Override when several checkouts run e2e on one machine (agent worktrees), so a run never
// reuses another checkout's servers.
const serverPort = process.env.E2E_SERVER_PORT ?? '3000';
const webPort = process.env.E2E_WEB_PORT ?? '4173';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: `http://localhost:${webPort}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions,
  },
  projects: [
    {
      name: 'desktop',
      // Phone-only checks (S7-12).
      testIgnore: /phone-layout\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 768 }, launchOptions },
    },
    {
      name: 'mobile',
      use: {
        ...devices['Pixel 7 landscape'],
        launchOptions,
      },
    },
    {
      // The smallest supported phone (S7-12): the phone layout checks at 640×360, and the role
      // ability button there (S7-47), the lobby manage and level details sheets (S7-87).
      name: 'phone-small',
      testMatch: /(phone-layout|abilities|lobby-manage)\.spec\.ts/,
      use: {
        ...devices['Pixel 7 landscape'],
        viewport: { width: 640, height: 360 },
        launchOptions,
      },
    },
  ],
  webServer: [
    {
      command: 'bun apps/server/src/index.ts',
      url: `http://localhost:${serverPort}/health`,
      // A short briefing keeps the start-to-HUD tests quick even without pressing "Gotowy!".
      // e2e/server-config.json turns the room browser on (off by default, S7-88).
      env: {
        PORT: serverPort,
        DATABASE_PATH: ':memory:',
        LOG_LEVEL: 'silent',
        BRIEFING_MS: '1500',
        CONFIG_PATH: 'e2e/server-config.json',
      },
      reuseExistingServer: !process.env.CI,
    },
    {
      command: `bun run build && cd apps/client && bunx vite preview --port ${webPort} --strictPort`,
      url: `http://localhost:${webPort}`,
      env: { GAME_SERVER: `localhost:${serverPort}` },
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
