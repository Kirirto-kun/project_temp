import { describe, expect, it } from 'vitest';
import type { IntakeView } from '@/onboarding/contracts';
import { coachFor, nextFallback } from '@/onboarding/ui/coach-choice';

const v = (mode: IntakeView['mode'], avatarIntake: boolean, coachVoice: boolean) => ({ mode, availability: { avatarIntake, coachVoice, audioAnalysis: false } }) as IntakeView;

describe('coach choice', () => {
  it('shows the chosen coach when it is available', () => {
    expect(coachFor(v('video', true, true), null)).toBe('video');
    expect(coachFor(v('audio', false, true), null)).toBe('audio');
    expect(coachFor(v('text', true, true), null)).toBe('text');
  });

  it('falls back from video to audio to text', () => {
    expect(nextFallback(v('video', true, true), 'video')).toBe('audio');
    expect(nextFallback(v('video', true, false), 'video')).toBe('text');
    expect(nextFallback(v('video', true, true), 'audio')).toBe('text');
    expect(coachFor(v('video', true, true), 'audio')).toBe('audio');
    expect(coachFor(v('video', true, true), 'text')).toBe('text');
  });

  it('never shows a coach whose capability is off', () => {
    expect(coachFor(v('video', false, true), null)).toBe('audio');
    expect(coachFor(v('video', false, false), null)).toBe('text');
    expect(coachFor(v('audio', false, false), null)).toBe('text');
  });
});
