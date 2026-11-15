import type { IntakeView } from '../contracts';

export type CoachKind = 'video' | 'audio' | 'text';

/** The coach the intake screen shows: the chosen mode when available, then each fallback in turn. */
export function coachFor(view: IntakeView, fallback: CoachKind | null): CoachKind {
  if (fallback === null && view.mode === 'video' && view.availability.avatarIntake) return 'video';
  const voiceMode = view.mode === 'audio' || view.mode === 'video';
  if (fallback !== 'text' && voiceMode && view.availability.coachVoice) return 'audio';
  return 'text';
}

export function nextFallback(view: IntakeView, from: CoachKind): CoachKind {
  return from === 'video' && view.availability.coachVoice ? 'audio' : 'text';
}
