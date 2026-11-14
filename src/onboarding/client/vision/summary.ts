import { coverage, type Qualified } from './quality'
import type { Thresholds } from './thresholds'
import type { Observation, VisualSummary } from './types'

export function summarize(q: readonly Qualified[], observations: readonly Observation[], t: Thresholds, maxEvents = 5): VisualSummary {
  const cov = coverage(q)
  const ratio = cov.observedMs > 0 ? cov.validMs / cov.observedMs : 0
  const events = observations
    .filter((o) => o.unit === 'ms')
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
    .slice(0, maxEvents)
    .sort((a, b) => a.startMs - b.startMs)
  const base = { validMs: cov.validMs, observedMs: cov.observedMs, coverage: ratio }

  if (cov.validMs >= t.summaryMinValidMs && ratio >= t.summaryMinCoverage) {
    return { ...base, status: 'ready', unavailableReason: null, events, metrics: observations.filter((o) => o.unit !== 'ms') }
  }
  const unavailableReason = cov.dominantReason ?? 'not_enough_valid_time'
  if (events.length > 0) return { ...base, status: 'partial', unavailableReason, events, metrics: [] }
  return { ...base, status: 'unavailable', unavailableReason, events: [], metrics: [] }
}
