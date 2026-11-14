import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const config = [
  ...nextVitals,
  ...nextTs,
  {
    ignores: ['.next/**', 'node_modules/**', 'services/**', 'playwright-report/**', 'test-results/**', 'next-env.d.ts', 'public/intake/wasm/**'],
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    // The deterministic engine must never import React, provider SDKs or server code.
    files: ['src/engine/**', 'src/domain/**', 'src/contracts/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: ['react', 'react-dom', 'next/*', '@elevenlabs/*', '@/server/*', '@/client/*', '@/onboarding/*', '@/features/*'],
        },
      ],
    },
  },
];

export default config;
