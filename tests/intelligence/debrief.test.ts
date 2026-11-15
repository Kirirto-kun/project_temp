import { describe, expect, it, vi } from 'vitest';
import { buildDebrief } from '@/intelligence/debrief';
import { NO_MODEL, type ModelPorts } from '@/intelligence/ports';
import { finishSession } from '@/engine';
import { RAISE_CONFIG, move, playSession, turnVoice, UNAVAILABLE_VOICE } from '@/testing/fixtures';

const config = { ...RAISE_CONFIG, objections: [] };
const session = playSession(config, [
  move('state_number', 11_200_000, false, 'I want 112k.'),
  move('state_number', 11_200_000, true, '112k because I lead the team.'),
  move('state_number', 11_200_000, true, '112k because I lead the team.'),
  move('state_number', 11_200_000, false, 'I want 112k.'),
  move('concede', 10_400_000, false, 'Okay, 104k.'),
]);

describe('buildDebrief', () => {
  it('computes money without any model and keeps voice unavailable explicit', async () => {
    const debrief = await buildDebrief(session, null, NO_MODEL);
    expect(debrief.outcome).toBe('accepted');
    expect(debrief.agreedMinor).toBe(10_400_000);
    expect(debrief.leftOnTableMinor).toBe(800_000);
    expect(debrief.persuasionScore).toBeNull();
    expect(debrief.voice.status).toBe('unavailable');
    expect(debrief.rows.map((r) => r.turnId)).toEqual(session.turns.map((t) => t.turnId));
  });
  it('joins voice by turnId, not by position', async () => {
    const voice = { status: 'ready' as const, baselineId: null, turns: [turnVoice('turn-fixture-2', 2, { wpm: 190 })], formulaVersion: 1 as const, reason: null };
    const debrief = await buildDebrief(session, voice, NO_MODEL);
    expect(debrief.rows[0]?.voice).toBeNull();
    expect(debrief.rows[1]?.voice?.wpm).toBe(190);
  });
  it('uses model better lines only when their amounts belong to the session, and labels the score', async () => {
    const deps: ModelPorts = {
      available: true,
      completeStructured: vi.fn().mockResolvedValue({
        rows: [
          { turnId: 'turn-fixture-1', betterLine: 'I am asking for $112,000/year because I took over the payments team.' },
          { turnId: 'turn-fixture-5', betterLine: 'What would it take to reach $120,000?' },
        ],
        persuasion: { value: 55, rationale: 'You gave a reason once. You conceded without asking why.' },
      }),
    };
    const debrief = await buildDebrief(session, UNAVAILABLE_VOICE, deps);
    // $120,000 is not in the session, so the whole answer is rejected twice and templates remain.
    expect(debrief.rows[0]?.betterLine).not.toContain('payments team');
    expect(debrief.persuasionScore).toBeNull();
  });
  it('accepts a valid model answer', async () => {
    const deps: ModelPorts = {
      available: true,
      completeStructured: vi.fn().mockResolvedValue({
        rows: [{ turnId: 'turn-fixture-1', betterLine: 'I am asking for $112,000/year because I took over the payments team.' }],
        persuasion: { value: 55, rationale: 'You gave a reason once. You conceded without asking why.' },
      }),
    };
    const debrief = await buildDebrief(session, UNAVAILABLE_VOICE, deps);
    expect(debrief.rows[0]?.betterLine).toContain('payments team');
    expect(debrief.persuasionScore).toEqual({ value: 55, rationale: expect.any(String), source: 'model' });
    expect(debrief.leftOnTableMinor).toBe(800_000);
  });
  it('reports no agreement for a stopped session', async () => {
    const stopped = { ...session, state: finishSession(playSession(config, [move('offtopic')]).state, 'stopped') };
    const debrief = await buildDebrief(stopped, null, NO_MODEL);
    expect(debrief.agreedMinor).toBeNull();
    expect(debrief.leftOnTableMinor).toBeNull();
    expect(debrief.summary).toMatch(/^No agreement/);
  });
});
