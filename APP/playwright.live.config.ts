import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_LIVE_BASE_URL?.trim() || 'http://127.0.0.1:5173';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: ['auth.live.spec.ts'],
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
  ],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
    colorScheme: 'light',
    viewport: {
      width: 1440,
      height: 1024,
    },
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
      },
    },
  ],
});
