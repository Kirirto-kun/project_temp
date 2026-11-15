import { createHash } from 'node:crypto'
import { access, cp, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { MODEL_SOURCES } from '../src/onboarding/client/vision/models'

const root = fileURLToPath(new URL('..', import.meta.url))
const modelsDir = path.join(root, 'public/intake/models')
const manifestPath = path.join(modelsDir, 'manifest.json')
const exists = (p: string) => access(p).then(() => true, () => false)

// tsx runs this file as CommonJS (no "type": "module"), so top-level await is not available.
async function main() {
  await mkdir(modelsDir, { recursive: true })
  const pinned: Record<string, string> = (await exists(manifestPath)) ? JSON.parse(await readFile(manifestPath, 'utf8')) : {}
  const manifest: Record<string, string> = {}

  for (const [file, url] of Object.entries(MODEL_SOURCES)) {
    const target = path.join(modelsDir, file)
    if (!(await exists(target))) {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`download ${url}: HTTP ${res.status}`)
      await writeFile(target, Buffer.from(await res.arrayBuffer()))
      console.log(`downloaded ${file}`)
    }
    const hash = createHash('sha256').update(await readFile(target)).digest('hex')
    if (pinned[file] && pinned[file] !== hash) {
      throw new Error(`${file} does not match its pinned hash; delete it and investigate before re-pinning`)
    }
    manifest[file] = hash
  }

  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  await cp(path.join(root, 'node_modules/@mediapipe/tasks-vision/wasm'), path.join(root, 'public/intake/wasm'), { recursive: true })
  console.log('vision assets ready')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
