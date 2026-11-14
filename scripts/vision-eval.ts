import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { LabelledClipSchema, scoreClips } from '../src/onboarding/client/vision/eval'

const dir = process.argv[2]
if (!dir) throw new Error('usage: npm run vision:eval -- <folder of labelled clip .json files, kept outside git>')
const handsEnabled = !process.argv.includes('--no-hands')

const files = (await readdir(dir)).filter((f) => f.endsWith('.json'))
const clips = await Promise.all(files.map(async (f) => LabelledClipSchema.parse(JSON.parse(await readFile(path.join(dir, f), 'utf8')))))
const scores = scoreClips(clips, { handsEnabled })
const fmt = (v: number | null) => (v === null ? '   –' : v.toFixed(2))

console.log(`${clips.length} clips\nkind                 tp   fp   fn  precision  recall`)
for (const s of scores) {
  const flag = s.precision !== null && s.precision < 0.9 ? '  ← below 0.90, disable this kind' : ''
  console.log(`${s.kind.padEnd(20)} ${String(s.tp).padStart(3)}  ${String(s.fp).padStart(3)}  ${String(s.fn).padStart(3)}  ${fmt(s.precision).padStart(9)}  ${fmt(s.recall).padStart(6)}${flag}`)
}
