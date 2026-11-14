import { describe, expect, it, vi } from 'vitest';
import type { CounterpartAction, Move } from '@/contracts/domain';
import { applyMove } from '@/engine';
import { renderCounterpart, renderOpening, templateReply } from '@/intelligence/actor';
import { containsNumberLike } from '@/intelligence/money-guard';
import { ModelUnavailableError, NO_MODEL, type ModelPorts } from '@/intelligence/ports';
import { RAISE_CONFIG, move, playSession } from '@/testing/fixtures';

const session = playSession({ ...RAISE_CONFIG, objections: [] }, []);
function contextFor(m: Move) {
  const { state, action } = applyMove(session.scenarioSnapshot, session.state, m);
  return { action, ctx: { session, move: m, next: state } };
}
const concede = contextFor(move('state_number', 11_000_000, true));
const model = (line: string): ModelPorts => ({ available: true, completeStructured: vi.fn().mockResolvedValue({ line }) });

describe('renderCounterpart', () => {
  it('inserts the engine amount with code formatting', async () => {
    expect(concede.action).toEqual({ kind: 'concede', toMinor: 9_840_000 });
    const text = await renderCounterpart(concede.action, concede.ctx, model('Alright, I can go to {{AMOUNT}}.'));
    expect(text).toBe('Alright, I can go to $98,400/year.');
  });
  it('replaces a line with an extra amount by the template', async () => {
    const text = await renderCounterpart(concede.action, concede.ctx, model('I can do {{AMOUNT}}, maybe $105,000 later.'));
    expect(text).toBe(templateReply(concede.action, concede.ctx));
    expect(text).toContain('$98,400/year');
  });
  it('rejects amounts written in words', async () => {
    const text = await renderCounterpart(concede.action, concede.ctx, model('I can do {{AMOUNT}}, or a hundred and five thousand next year.'));
    expect(text).toBe(templateReply(concede.action, concede.ctx));
  });
  it('rejects a new percentage', async () => {
    const hold: CounterpartAction = { kind: 'probe' };
    const text = await renderCounterpart(hold, concede.ctx, model('We usually give 3% at review.'));
    expect(text).toBe(templateReply(hold, concede.ctx));
  });
  it('rejects a wrong currency', async () => {
    const text = await renderCounterpart(concede.action, concede.ctx, model('I can go to {{AMOUNT}} or €90,000.'));
    expect(text).toBe(templateReply(concede.action, concede.ctx));
  });
  it('falls back to the template when the provider is unavailable', async () => {
    const deps: ModelPorts = { available: true, completeStructured: vi.fn().mockRejectedValue(new ModelUnavailableError('down')) };
    expect(await renderCounterpart(concede.action, concede.ctx, deps)).toBe(templateReply(concede.action, concede.ctx));
    expect(await renderCounterpart(concede.action, concede.ctx, NO_MODEL)).toBe(templateReply(concede.action, concede.ctx));
  });
  it('keeps a number-free line for non-money actions', async () => {
    const probe: CounterpartAction = { kind: 'probe' };
    expect(await renderCounterpart(probe, concede.ctx, model('Tell me what changed in your role this year.'))).toBe('Tell me what changed in your role this year.');
  });
  it('asks which number when the amount was ambiguous', () => {
    const { action, ctx } = contextFor(move('state_number', null, true));
    expect(templateReply(action, ctx)).toMatch(/which/i);
  });
  it('templates never contain stray numbers', () => {
    for (const a of [{ kind: 'hold' }, { kind: 'probe' }, { kind: 'walk_away' }] as CounterpartAction[]) {
      expect(containsNumberLike(templateReply(a, contextFor(move('offtopic')).ctx))).toBe(false);
    }
  });
  it('opens with the offer amount when the kind has one', () => {
    expect(renderOpening({ ...RAISE_CONFIG, kind: 'offer' })).toContain('$95,000/year');
  });
});
