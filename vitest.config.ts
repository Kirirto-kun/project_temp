import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const alias = {
  '@': fileURLToPath(new URL('./src', import.meta.url)),
  'server-only': fileURLToPath(new URL('./tests/stubs/server-only.ts', import.meta.url)),
};

export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: 'engine',
          globals: true,
          environment: 'node',
          include: ['tests/contracts/**/*.test.ts', 'tests/engine/**/*.test.ts', 'tests/intelligence/**/*.test.ts'],
        },
      },
      {
        resolve: { alias },
        test: {
          name: 'server',
          globals: true,
          environment: 'node',
          include: ['tests/server/**/*.test.ts'],
          setupFiles: ['tests/server/setup.ts'],
        },
      },
      {
        plugins: [react()],
        resolve: { alias },
        test: {
          name: 'ui',
          globals: true,
          environment: 'jsdom',
          include: ['tests/ui/**/*.test.{ts,tsx}'],
          setupFiles: ['tests/ui/setup.ts'],
        },
      },
      {
        plugins: [react()],
        resolve: { alias },
        test: {
          name: 'intake',
          globals: true,
          environment: 'node',
          include: ['tests/intake/**/*.test.{ts,tsx}'],
          setupFiles: ['tests/server/setup.ts'],
        },
      },
    ],
  },
});
