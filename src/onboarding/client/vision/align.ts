import type { Moment, Observation, SpeechTurn } from './types'

/** Visual events that overlap what the user was saying. Key turns (e.g. the ask) come first. */
export function alignMoments(observations: readonly Observation[], turns: readonly SpeechTurn[], keyTurnIds: readonly string[] = [], max = 3): Moment[] {
  const events = observations.filter((o) => o.unit === 'ms')
  const key = new Set(keyTurnIds)
  return turns
    .map((turn) => ({
      ...turn,
      isKey: key.has(turn.turnId),
      observations: events.filter((o) => o.startMs < turn.t1Ms && o.endMs > turn.t0Ms),
    }))
    .filter((m) => m.observations.length > 0)
    .sort((a, b) => Number(b.isKey) - Number(a.isKey) || b.observations.length - a.observations.length || a.t0Ms - b.t0Ms)
    .slice(0, max)
}
