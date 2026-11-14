import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.E2E_PORT ?? 3100);
const baseURL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL,
    trace: 'off',
    permissions: [],
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `npm run start -- -p ${port}`,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        env: {
          NODE_ENV: 'production',
          STORAGE_DRIVER: 'memory',
          HOLDLINE_SIGNING_SECRET: 'e2e-only-signing-secret-not-for-production-use',
          HOLDLINE_ALLOW_INSECURE_COOKIES: '1',
          // Every E2E request comes from one IP; production defaults stay at 3 per day.
          SESSIONS_PER_IP_PER_DAY: '1000',
          INTAKE_ATTEMPTS_PER_IP_PER_DAY: '1000',
        },
      },
});
