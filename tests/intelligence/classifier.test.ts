import { describe, expect, it, vi } from 'vitest';
import type { CoreState } from '@/contracts/domain';
import { createInitialState } from '@/engine';
import { classifyByRules, classifyMove } from '@/intelligence/classifier';
import { ModelUnavailableError, NO_MODEL, type ModelPorts } from '@/intelligence/ports';
import { RAISE_CONFIG, playSession } from '@/testing/fixtures';
import fixtures from './fixtures/classifier-30.json';

interface Item {
  id: string;
  text: string;
  state: Partial<CoreState>;
  expected: { type: string; amountMinor: number | null; hasReason?: boolean; tone?: string };
}

const items = fixtures.items as Item[];
const stateFor = (patch: Partial<CoreState>): CoreState => ({ ...createInitialState(RAISE_CONFIG), ...patch });

describe('classifier fixture set', () => {
  it('has exactly 30 labelled replies covering all eight moves', () => {
    expect(items).toHaveLength(30);
    expect(new Set(items.map((i) => i.expected.type)).size).toBe(8);
  });

  it.each(items.map((i) => [i.id, i] as const))('rules classifier: %s', (_id, item) => {
    const result = classifyByRules(item.text, RAISE_CONFIG, stateFor(item.state));
    expect(result.type).toBe(item.expected.type);
    expect(result.amountMinor).toBe(item.expected.amountMinor);
    if (item.expected.hasReason !== undefined) expect(result.hasReason).toBe(item.expected.hasReason);
    if (item.expected.tone !== undefined) expect(result.tone).toBe(item.expected.tone);
  });
});

function sessionWith(patch: Partial<CoreState> = {}) {
  const session = playSession(RAISE_CONFIG, []);
  return { ...session, state: { ...session.state, ...patch } };
}

const turnInput = (text: string) => ({ turnId: 'turn-test-0001', expectedVersion: 1, text, mode: 'text' as const, sourceTurnKey: null });

describe('classifyMove with a model', () => {
  it('uses the rules when no model is configured', async () => {
    const move = await classifyMove(turnInput("I'm asking for $110,000."), sessionWith(), NO_MODEL);
    expect(move).toMatchObject({ type: 'state_number', amountMinor: 11_000_000 });
  });

  it('takes the amount only from the parsed candidates', async () => {
    const deps: ModelPorts = { available: true, completeStructured: vi.fn().mockResolvedValue({ moveType: 'state_number', amountIndex: 0, hasReason: true, tone: 'assertive' }) };
    const move = await classifyMove(turnInput('Given my results I want 110k'), sessionWith(), deps);
    expect(move).toMatchObject({ type: 'state_number', amountMinor: 11_000_000, hasReason: true });
  });

  it('retries once on invalid output, then falls back to offtopic', async () => {
    const complete = vi.fn().mockResolvedValue({ moveType: 'flatter', amountIndex: null, hasReason: false, tone: 'neutral' });
    const move = await classifyMove(turnInput('I want 110k'), sessionWith(), { available: true, completeStructured: complete });
    expect(complete).toHaveBeenCalledTimes(2);
    expect(move.type).toBe('offtopic');
    expect(move.amountMinor).toBeNull();
  });

  it('recovers when the retry is valid', async () => {
    const complete = vi
      .fn()
      .mockResolvedValueOnce({ nonsense: true })
      .mockResolvedValueOnce({ moveType: 'ask_question', amountIndex: null, hasReason: false, tone: 'neutral' });
    const move = await classifyMove(turnInput('Why is that?'), sessionWith(), { available: true, completeStructured: complete });
    expect(move.type).toBe('ask_question');
  });

  it('rejects an amount index that does not exist', async () => {
    const complete = vi.fn().mockResolvedValue({ moveType: 'state_number', amountIndex: 3, hasReason: false, tone: 'neutral' });
    const move = await classifyMove(turnInput('I want 110k'), sessionWith(), { available: true, completeStructured: complete });
    expect(move.type).toBe('offtopic');
  });

  it('falls back to the rules when the provider is down', async () => {
    const complete = vi.fn().mockRejectedValue(new ModelUnavailableError('timeout'));
    const move = await classifyMove(turnInput('Could we do 112?'), sessionWith(), { available: true, completeStructured: complete });
    expect(move).toMatchObject({ type: 'state_number', amountMinor: 11_200_000 });
  });

  it('does not let a model invent an amount for a non-money move', async () => {
    const complete = vi.fn().mockResolvedValue({ moveType: 'justify', amountIndex: 0, hasReason: true, tone: 'neutral' });
    const move = await classifyMove(turnInput('I closed deals worth $100,000 last quarter'), sessionWith(), { available: true, completeStructured: complete });
    expect(move).toMatchObject({ type: 'justify', amountMinor: null });
  });
});
