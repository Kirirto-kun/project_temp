import { isEventKind, type EventKind, type MetricKind, type Moment, type Observation, type UnavailableReason } from './types'

/** Report language must describe movements, never what they supposedly mean. */
export const BANNED_TERMS = [
  /nervous/i, /confiden/i, /anxious/i, /\blying\b/i, /\bhonest/i, /diagnos/i,
  /bad posture|posture is bad/i, /eye contact/i, /insecure/i, /fidget/i,
]

export const REASON_TEXT: Record<UnavailableReason, string> = {
  no_face: 'Your face was not in view',
  multiple_people: 'More than one person was in view',
  too_dark: 'The room was too dark for the camera',
  camera_moved: 'The camera moved',
  limbs_not_visible: 'Shoulders or hands were not in view',
  hands_disabled: 'Hand tracking is off',
  not_enough_valid_time: 'Not enough clear camera time',
  frame_rate_too_low: 'The camera frame rate was too low',
  device_too_slow: 'This device could not keep up, so visual analysis was turned off',
  camera_off: 'Camera was off',
  model_failed: 'Visual analysis could not start',
}

const METRIC_LABEL: Record<MetricKind, string> = {
  gaze_on_screen_share: 'Gaze toward the screen',
  gesture_activity: 'Hand gestures',
  hands_visible_share: 'Hands in view',
  open_palm_share: 'Open palms',
  smile_share: 'Smiling',
  blink_rate: 'Blink rate',
}

export const fmtTime = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
export const fmtDur = (ms: number) => `~${Math.max(1, Math.round(ms / 1000))} s`
const pct = (v: number) => `${Math.round(v * 100)}%`

function eventPhrase(o: Observation & { kind: EventKind }): string {
  switch (o.kind) {
    case 'head_turn_away': return 'head turned away'
    case 'head_down': return 'looked down'
    case 'out_of_frame': return 'out of frame'
    case 'posture_shift': return 'shifted position'
    case 'lean_change': return o.direction === 'farther' ? 'moved back from the camera' : 'moved closer to the camera'
    case 'shoulder_raise': return 'shoulders raised'
    case 'hand_to_face': return 'hand near face'
    case 'brow_raise': return 'raised eyebrows'
    case 'lip_press': return 'pressed lips'
  }
}

function metricText(kind: MetricKind, v: number): string {
  switch (kind) {
    case 'gaze_on_screen_share': return `Gaze toward the screen about ${pct(v)} of visible time (approximate)`
    case 'gesture_activity': return `About ${Math.round(v)} hand gestures per minute while hands were visible`
    case 'hands_visible_share': return `Hands in view ${pct(v)} of the time`
    case 'open_palm_share': return `Open palms ${pct(v)} of the time hands were visible`
    case 'smile_share': return `Smiling about ${pct(v)} of visible time`
    case 'blink_rate': return `About ${Math.round(v)} blinks per minute`
  }
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export function describe(o: Observation): string {
  if (isEventKind(o.kind)) {
    const e = o as Observation & { kind: EventKind }
    return `${capitalize(eventPhrase(e))} for ${fmtDur(e.endMs - e.startMs)} at ${fmtTime(e.startMs)}`
  }
  const kind = o.kind as MetricKind
  if (o.value === null) return `${METRIC_LABEL[kind]}: not available (${REASON_TEXT[o.unavailableReason ?? 'not_enough_valid_time'].toLowerCase()})`
  return metricText(kind, o.value)
}

export function describeMoment(m: Moment): string {
  const parts = m.observations
    .filter((o) => isEventKind(o.kind))
    .map((o) => `${eventPhrase(o as Observation & { kind: EventKind })} ${fmtDur(o.endMs - o.startMs)}`)
  return `${fmtTime(m.t0Ms)}–${fmtTime(m.t1Ms)}${m.isKey ? ' (key moment)' : ''}: ${parts.join('; ')}`
}
