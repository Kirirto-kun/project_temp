import { defineConfig,devices } from '@playwright/test';
import { loadEnvFile } from 'node:process';
import { existsSync } from 'node:fs';
if(existsSync('.env.local'))loadEnvFile('.env.local');
export default defineConfig({
  testDir:'tests/e2e',timeout:45000,fullyParallel:false,workers:1,retries:0,
  globalSetup:'./tests/e2e/setup.ts',
  use:{baseURL:'http://127.0.0.1:3100',trace:'retain-on-failure'},
  projects:[{name:'chromium',use:{...devices['Desktop Chrome']}}],
  webServer:{command:'npm run dev -- --port 3100 --hostname 127.0.0.1',url:'http://127.0.0.1:3100/api/health',reuseExistingServer:!process.env.CI,timeout:120000,
    env:{APP_ORIGIN:'http://127.0.0.1:3100',DATABASE_URL:process.env.TEST_DATABASE_URL??'',AVATAR_INTAKE_ENABLED:'false'}},
});
