import type { Qualified } from './quality'

export type Run = { startMs: number; endMs: number }
/** true/false when the condition can be judged for this sample, null when it cannot. */
export type Test = (x: Qualified) => boolean | null

export const whenValid = (fn: (x: Qualified) => boolean | null): Test => (x) => (x.valid ? fn(x) : null)

/** Intervals where `test` stays true for at least minMs. Unknown samples and gaps break a run. */
export function sustainedRuns(q: readonly Qualified[], test: Test, minMs: number): Run[] {
  const runs: Run[] = []
  let cur: Run | null = null
  const close = () => {
    if (cur && cur.endMs - cur.startMs >= minMs) runs.push(cur)
    cur = null
  }
  for (const x of q) {
    if (cur && x.s.tMs > cur.endMs) close()
    if (test(x) === true) {
      if (!cur) cur = { startMs: x.s.tMs, endMs: x.s.tMs }
      cur.endMs = x.s.tMs + x.durMs
    } else close()
  }
  close()
  return runs
}

export function share(q: readonly Qualified[], test: Test): { onMs: number; knownMs: number } {
  let onMs = 0
  let knownMs = 0
  for (const x of q) {
    const r = test(x)
    if (r === null) continue
    knownMs += x.durMs
    if (r) onMs += x.durMs
  }
  return { onMs, knownMs }
}
