import { describe, expect, it } from 'vitest';
import { ModelUnavailableError, type ModelPorts } from '@/intelligence/ports';
import { createIntake, getAssessment, getIntake, postMessage } from '@/onboarding/server/service';
import { IP, OWNER, makeDeps } from '../server/helpers';

// Production bug: GET .../assessment re-ran the model and saved the result, bumping the intake
// revision behind the review page, so every edit, tick and Confirm there failed with VERSION_CONFLICT.
describe('reading the practice assessment', () => {
  it('never changes the intake revision, even with a model available', async () => {
    let evaluateCalls = 0;
    const models: ModelPorts = {
      available: true,
      async completeStructured(request) {
        if (request.purpose === 'intake_evaluate') {
          evaluateCalls += 1;
          return { items: [{ index: 0, suggestion: evaluateCalls % 2 ? "Keep the reason short and specific." : "Name one concrete result, then stop." }] };
        }
        throw new ModelUnavailableError('not used in this test');
      },
    };
    const deps = makeDeps({ models });
    const created = await createIntake(deps, OWNER, { mode: 'text', consents: { audioAnalysis: false, visualAnalysis: false }, consentVersion: 1 });
    await postMessage(deps, OWNER, IP, created.id, { turnId: 'it-practice-0001', text: 'Based on what I delivered, I am asking for $95,000.', practice: true });
    const before = await getIntake(deps, OWNER, created.id);
    expect(await getAssessment(deps, OWNER, created.id)).not.toBeNull();
    await getAssessment(deps, OWNER, created.id);
    const after = await getIntake(deps, OWNER, created.id);
    expect(after.revision).toBe(before.revision);
  });
});
