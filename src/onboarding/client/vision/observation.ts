import { clamp } from './geometry'
import { coverage, type Qualified } from './quality'
import { share, type Run, type Test } from './runs'
import type { Thresholds } from './thresholds'
import type { Direction, EventKind, MetricKind, Observation, UnavailableReason } from './types'

export type Ctx = { recordingId: string; modelVersion: string }

export function eventObservation(ctx: Ctx, kind: EventKind, run: Run, direction: Direction | null = null): Observation {
  const ms = run.endMs - run.startMs
  return {
    id: `${kind}:${run.startMs}`, recordingId: ctx.recordingId, kind, startMs: run.startMs, endMs: run.endMs,
    value: ms, unit: 'ms', direction, quality: 1, validMs: ms, observedMs: ms,
    source: 'mediapipe', modelVersion: ctx.modelVersion, unavailableReason: null,
  }
}

export function metricObservation(
  ctx: Ctx, kind: MetricKind, window: Run, value: number | null, unit: 'ratio' | 'per_min',
  knownMs: number, observedMs: number, reason: UnavailableReason | null,
): Observation {
  return {
    id: `${kind}:${window.startMs}-${window.endMs}`, recordingId: ctx.recordingId, kind,
    startMs: window.startMs, endMs: window.endMs, value, unit, direction: null,
    quality: observedMs > 0 ? clamp(knownMs / observedMs, 0, 1) : 0,
    validMs: knownMs, observedMs, source: 'mediapipe', modelVersion: ctx.modelVersion,
    unavailableReason: value === null ? reason : null,
  }
}

export function windowOf(q: readonly Qualified[]): Run {
  const first = q[0]
  const last = q.at(-1)
  return { startMs: first?.s.tMs ?? 0, endMs: last ? last.s.tMs + last.durMs : 0 }
}

/** Ratio metric; unavailable until the condition has been judgeable for summaryMinValidMs. */
export function shareMetric(ctx: Ctx, kind: MetricKind, q: readonly Qualified[], test: Test, t: Thresholds, reasonIfShort: UnavailableReason): Observation {
  const { onMs, knownMs } = share(q, test)
  const enough = knownMs >= t.summaryMinValidMs
  return metricObservation(ctx, kind, windowOf(q), enough ? onMs / knownMs : null, 'ratio', knownMs, coverage(q).observedMs, reasonIfShort)
}
