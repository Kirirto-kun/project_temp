import { describe, expect, it, vi } from 'vitest';
import { createScenario } from '@/intelligence/scenario';
import { NO_MODEL, type ModelPorts } from '@/intelligence/ports';
import { buildBaseScenario } from '@/scenarios';
import { RAISE_QUIZ } from '@/testing/fixtures';

describe('createScenario', () => {
  const base = buildBaseScenario(RAISE_QUIZ);
  it('returns the deterministic base without a model', async () => {
    expect(await createScenario(RAISE_QUIZ, NO_MODEL)).toEqual(base);
  });
  it('lets a model reword objections but never money', async () => {
    const deps: ModelPorts = {
      available: true,
      completeStructured: vi.fn().mockResolvedValue({ objections: base.objections.map((o) => ({ id: o.id, text: `Reworded: ${o.id} objection text` })) }),
    };
    const config = await createScenario(RAISE_QUIZ, deps);
    expect(config.objections[0]?.text).toMatch(/^Reworded/);
    expect(config.reservationAmountMinor).toBe(base.reservationAmountMinor);
    expect(config.concessionStepMinor).toBe(base.concessionStepMinor);
    expect(config.objections.map((o) => o.clearedBy)).toEqual(base.objections.map((o) => o.clearedBy));
  });
  it('keeps the base when the model writes numbers or changes ids', async () => {
    const deps: ModelPorts = {
      available: true,
      completeStructured: vi.fn().mockResolvedValue({ objections: base.objections.map((o) => ({ id: o.id, text: 'We only have $5,000 for raises.' })) }),
    };
    expect(await createScenario(RAISE_QUIZ, deps)).toEqual(base);
  });
  it('does not fail the start when the model throws', async () => {
    const deps: ModelPorts = { available: true, completeStructured: vi.fn().mockRejectedValue(new Error('boom')) };
    expect(await createScenario(RAISE_QUIZ, deps)).toEqual(base);
  });
});
