import { renderToStaticMarkup } from 'react-dom/server'
import { describe as suite, expect, it } from 'vitest'
import { BANNED_TERMS, REASON_TEXT, describe, describeMoment, fmtTime } from '@/onboarding/client/vision/copy'
import { metricObservation, eventObservation } from '@/onboarding/client/vision/observation'
import { EVENT_KINDS, METRIC_KINDS, UNAVAILABLE_REASONS, type VisualSummary } from '@/onboarding/client/vision/types'
import { VisualReport } from '@/onboarding/ui/VisualReport'

const ctx = { recordingId: 'rec', modelVersion: 'v' }
const ev = (kind: (typeof EVENT_KINDS)[number], startMs = 42000, ms = 3000) => eventObservation(ctx, kind, { startMs, endMs: startMs + ms })
const metric = (kind: (typeof METRIC_KINDS)[number], value: number | null) =>
  metricObservation(ctx, kind, { startMs: 0, endMs: 60000 }, value, kind === 'gesture_activity' || kind === 'blink_rate' ? 'per_min' : 'ratio', 50000, 60000, value === null ? 'limbs_not_visible' : null)

const allStrings = () => [
  ...EVENT_KINDS.map((k) => describe(ev(k))),
  describe({ ...ev('lean_change'), direction: 'farther' }),
  ...METRIC_KINDS.flatMap((k) => [describe(metric(k, 0.42)), describe(metric(k, null))]),
  ...UNAVAILABLE_REASONS.map((r) => REASON_TEXT[r]),
]

suite('copy', () => {
  it('formats times and events as facts', () => {
    expect(fmtTime(62000)).toBe('1:02')
    expect(describe(ev('head_turn_away'))).toBe('Head turned away for ~3 s at 0:42')
    expect(describe({ ...ev('lean_change'), direction: 'closer' })).toBe('Moved closer to the camera for ~3 s at 0:42')
    expect(describe(metric('gaze_on_screen_share', 0.78))).toBe('Gaze toward the screen about 78% of visible time (approximate)')
    expect(describe(metric('gesture_activity', null))).toBe('Hand gestures: not available (shoulders or hands were not in view)')
    expect(describeMoment({ turnId: 't', t0Ms: 41000, t1Ms: 47000, isKey: true, observations: [ev('head_down', 42000, 2000), ev('hand_to_face', 43000, 1000)] }))
      .toBe('0:41–0:47 (key moment): looked down ~2 s; hand near face ~1 s')
  })

  it('never uses interpretive or diagnostic language', () => {
    for (const text of allStrings()) for (const term of BANNED_TERMS) expect(text).not.toMatch(term)
  })
})

suite('VisualReport', () => {
  const ready: VisualSummary = {
    status: 'ready', validMs: 42000, observedMs: 50000, coverage: 0.84, unavailableReason: null,
    events: [ev('head_turn_away')], metrics: [metric('smile_share', 0.2)],
  }

  it('renders coverage, events and metrics when ready', () => {
    const html = renderToStaticMarkup(<VisualReport summary={ready} />)
    expect(html).toContain('42 s')
    expect(html).toContain('84%')
    expect(html).toContain('Head turned away for ~3 s at 0:42')
    expect(html).toContain('Smiling about 20% of visible time')
    for (const term of BANNED_TERMS) expect(html).not.toMatch(term)
  })

  it('explains partial and unavailable states', () => {
    expect(renderToStaticMarkup(<VisualReport summary={{ ...ready, status: 'partial', unavailableReason: 'too_dark', metrics: [] }} />))
      .toContain('Showing individual moments only')
    expect(renderToStaticMarkup(<VisualReport summary={{ ...ready, status: 'unavailable', unavailableReason: 'camera_off', events: [], metrics: [] }} />))
      .toContain('Visual feedback unavailable: Camera was off.')
  })
})
