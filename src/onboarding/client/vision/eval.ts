import { z } from 'zod'
import { detectAll } from './detect'
import type { Thresholds } from './thresholds'
import { EVENT_KINDS, LandmarkSampleSchema, type EventKind } from './types'

export const LabelledClipSchema = z.strictObject({
  name: z.string(),
  samples: z.array(LandmarkSampleSchema),
  labels: z.array(z.strictObject({ kind: z.enum(EVENT_KINDS), startMs: z.number(), endMs: z.number() })),
})
export type LabelledClip = z.infer<typeof LabelledClipSchema>
export type KindScore = { kind: EventKind; tp: number; fp: number; fn: number; precision: number | null; recall: number | null }

/** A prediction matches an unused label of the same kind when their intervals overlap. */
export function scoreClips(clips: readonly LabelledClip[], o: { handsEnabled: boolean; thresholds?: Thresholds }): KindScore[] {
  const counts = new Map(EVENT_KINDS.map((k) => [k, { tp: 0, fp: 0, fn: 0 }]))
  for (const clip of clips) {
    const { observations } = detectAll(clip.samples, { recordingId: clip.name, modelVersion: 'eval', ...o })
    for (const kind of EVENT_KINDS) {
      const c = counts.get(kind)!
      const labels = clip.labels.filter((l) => l.kind === kind)
      const used = new Set<number>()
      for (const p of observations.filter((x) => x.kind === kind)) {
        const i = labels.findIndex((l, j) => !used.has(j) && l.startMs < p.endMs && l.endMs > p.startMs)
        if (i >= 0) {
          used.add(i)
          c.tp++
        } else c.fp++
      }
      c.fn += labels.length - used.size
    }
  }
  return EVENT_KINDS.map((kind) => {
    const { tp, fp, fn } = counts.get(kind)!
    return { kind, tp, fp, fn, precision: tp + fp ? tp / (tp + fp) : null, recall: tp + fn ? tp / (tp + fn) : null }
  })
}
