import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const repo = fileURLToPath(new URL('../..', import.meta.url))

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  publicDir: `${repo}/public`,
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': `${repo}/src` } },
  server: { fs: { allow: [repo] } },
  worker: { format: 'es' },
})
