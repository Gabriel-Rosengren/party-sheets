import { defineConfig, devices } from '@playwright/test';

const API_PORT = 3101;
const WEB_PORT = 5174;
const WEB_URL = `http://localhost:${WEB_PORT}`;

/**
 * End-to-end tests against the production client build and a real API + database.
 * Runs on its own ports, so it works next to `npm run dev`.
 */
export default defineConfig({
  testDir: './tests',
  // Strict on purpose: a flaky test is a failing test, and `.only` can't sneak into CI.
  retries: 0,
  forbidOnly: !!process.env.CI,
  workers: process.env.CI ? 2 : undefined,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: WEB_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chrome',
      // Installed Google Chrome (also preinstalled on GitHub's Ubuntu runners), so no
      // separate browser download is needed.
      use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    },
  ],
  webServer: [
    {
      command: 'node start-api.mjs',
      url: `http://localhost:${API_PORT}/api/health`,
      env: { E2E_API_PORT: String(API_PORT), E2E_WEB_URL: WEB_URL },
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      // `vite preview` serves the production build and reuses the dev proxy settings.
      command: `npm run build && npx vite preview --port ${WEB_PORT} --strictPort`,
      cwd: '../client',
      url: WEB_URL,
      env: { API_URL: `http://localhost:${API_PORT}` },
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
