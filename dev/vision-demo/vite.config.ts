import { createReadStream, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

const repo = fileURLToPath(new URL('../..', import.meta.url))

const WASM_TYPES: Record<string, string> = { js: 'text/javascript', wasm: 'application/wasm' }

// MediaPipe's module worker loads its wasm glue with a dynamic import().
// Vite's dev server would try to transform that public file and refuses, so serve it raw.
function rawIntakeWasm(): Plugin {
  return {
    name: 'raw-intake-wasm',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = req.url?.split('?')[0] ?? ''
        const m = /^\/intake\/wasm\/([\w.-]+)\.(js|wasm)$/.exec(path)
        const file = m && `${repo}/public${path}`
        if (!m || !file || !existsSync(file)) return next()
        res.setHeader('Content-Type', WASM_TYPES[m[2]!]!)
        createReadStream(file).pipe(res)
      })
    },
  }
}

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  publicDir: `${repo}/public`,
  plugins: [rawIntakeWasm(), react(), tailwindcss()],
  resolve: { alias: { '@': `${repo}/src` } },
  server: { fs: { allow: [repo] } },
  worker: { format: 'es' },
})
