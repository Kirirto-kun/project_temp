import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';

if (existsSync('.env.local')) loadEnvFile('.env.local');

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: { include: ['tests/intake/**/*.test.{ts,tsx}'], environment: 'node' },
});
