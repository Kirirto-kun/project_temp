import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { LabelledClipSchema, scoreClips } from '../src/onboarding/client/vision/eval'

const args = process.argv.slice(2)
const dir = args.find((a) => !a.startsWith('--'))
if (!dir) throw new Error('usage: npm run vision:eval -- <folder of labelled clip .json files, kept outside git>')
const handsEnabled = !process.argv.includes('--no-hands')

// tsx runs this file as CommonJS (no "type": "module"), so top-level await is not available.
async function main(dir: string) {
  const files = (await readdir(dir)).filter((f) => f.endsWith('.json'))
  if (files.length === 0) throw new Error(`no clips: ${dir} contains no .json files`)
  const clips = await Promise.all(files.map(async (f) => {
    const parsed = LabelledClipSchema.safeParse(JSON.parse(await readFile(path.join(dir, f), 'utf8')))
    if (!parsed.success) throw new Error(`${f}: ${parsed.error.message}`)
    return parsed.data
  }))
  const scores = scoreClips(clips, { handsEnabled })
  const fmt = (v: number | null) => (v === null ? '   –' : v.toFixed(2))

  console.log(`${clips.length} clips\nkind                 tp   fp   fn  precision  recall`)
  for (const s of scores) {
    const flag = s.precision !== null && s.precision < 0.9 ? '  ← below 0.90, disable this kind' : ''
    console.log(`${s.kind.padEnd(20)} ${String(s.tp).padStart(3)}  ${String(s.fp).padStart(3)}  ${String(s.fn).padStart(3)}  ${fmt(s.precision).padStart(9)}  ${fmt(s.recall).padStart(6)}${flag}`)
  }
}

main(dir).catch((err) => {
  console.error(err)
  process.exit(1)
})
