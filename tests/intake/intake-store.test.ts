import { describe, expect, it } from 'vitest';
import { createIntake, intakeStore, stopMedia } from '@/onboarding/server/service';
import { OWNER, makeDeps } from '../server/helpers';

describe('intake store', () => {
  it('keeps the intake readable after an update, even when the clock has moved on', async () => {
    const deps = makeDeps();
    const v = await createIntake(deps, OWNER, { mode: 'text', consents: { audioAnalysis: false, visualAnalysis: false }, consentVersion: 1 });
    await stopMedia(deps, OWNER, v.id, 'end');
    expect((await intakeStore(deps).read(v.id))?.revision).toBeGreaterThan(v.revision);
    deps.clock.now += 2 * 60_000;
    expect(await intakeStore(deps).read(v.id)).not.toBeNull();
  });
});
