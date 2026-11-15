import { describe, expect, it } from 'vitest';
import { QuizAnswersSchema, QuizDraftSchema } from '@/contracts/domain';
import type { ProfilePatch } from '@/onboarding/contracts';
import { DailyBudget } from '@/onboarding/server/budget';
import { ProfileControl } from '@/onboarding/server/profile-control';
import { CallService, type CallProvider } from '@/onboarding/server/service';
import { MemoryStore } from './helpers/memory-store';

const owner = 'owner';
const clientId = '00000000-0000-4000-8000-000000000001';
const amounts = {
  currentMinor: 9_500_000, targetMinor: 11_000_000,
  marketLowMinor: 9_000_000, marketHighMinor: 12_000_000,
  currency: 'USD', period: 'year', moneyBasis: 'gross', rangeSource: 'user_provided',
} as const;
const common = {
  description: 'I want to talk about a change to our shared plans.',
  counterpartRole: 'My partner', goal: 'Agree on the next step together',
};

async function fixture() {
  const now = () => Date.parse('2026-11-15T00:00:00Z');
  const store = new MemoryStore(now);
  const provider: CallProvider = {
    async open() { return { providerSessionId: 'provider', credentialCiphertext: 'encrypted' }; },
    async close() {},
    async credentials() { return { sessionToken: 'token' }; },
  };
  const service = new CallService({ store, provider, now, budget: new DailyBudget(store, {
    dailyCents: 1000, attemptCents: 100, concurrency: 2, attemptsPerIp: 3,
  }, now) });
  const view = await service.create(owner, 'create-key-01', {
    mode: 'video', locale: 'en', consentVersion: 1,
    consents: { audioAnalysis: false, visualAnalysis: false },
  });
  return { service, profile: new ProfileControl(service), view };
}

describe('universal preparation profiles', () => {
  it.each(['interview', 'feedback', 'conflict', 'relationship', 'presentation', 'custom'] as const)(
    'accepts %s as a complete common brief without money or an avatar', kind => {
      const result = QuizAnswersSchema.safeParse({ kind, ...common, desiredTone: ' Calm and direct ' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.desiredTone).toBe('Calm and direct');
        expect(result.data.currentMinor).toBeUndefined();
      }
    },
  );

  it.each(['custom', 'interview'] as const)('saves a %s tool proposal and hands off only after human confirmation', async kind => {
    const f = await fixture();
    const connection = await f.service.connect(owner, f.view.id, 'connect-key-01', 'ip', {
      expectedRevision: 0, mode: 'video', restart: false, clientId,
    });
    const proposed = await f.profile.tool(owner, f.view.id, {
      providerEpoch: 1, clientId, callId: 'save-topic', expectedRevision: connection.view.revision,
      toolName: 'save_profile', payload: { patch: { kind, ...common, desiredTone: 'Curious and clear' } },
    });
    expect(proposed.missingFields).toEqual([]);
    expect(proposed.view.confirmed).toBe(false);
    expect(proposed.view.publicProfile.currentMinor).toBeUndefined();
    await expect(f.profile.handoff(owner, f.view.id)).rejects.toMatchObject({ code: 'CONFIRMATION_REQUIRED' });
    const review = await f.profile.tool(owner, f.view.id, {
      providerEpoch: 1, clientId, callId: 'review-topic', expectedRevision: proposed.view.revision,
      toolName: 'prepare_confirmation', payload: {},
    });
    expect(review.view.confirmed).toBe(false);
    expect(review.view.mediaStatus).toBe('closed');
    const confirmed = await f.profile.confirm(owner, f.view.id, 'confirm-key-01', { expectedRevision: review.view.revision });
    expect(confirmed.confirmed).toBe(true);
    const handoff = await f.profile.handoff(owner, f.view.id);
    expect(handoff.missingFields).toEqual([]);
    expect(handoff.quizDraft).toMatchObject({ kind, ...common });
    expect(QuizAnswersSchema.safeParse(handoff.quizDraft).success).toBe(true);
  });

  it('reports only common preparation fields and keeps blank legacy descriptions readable', async () => {
    const f = await fixture();
    expect(f.profile.missing(await f.service.load(f.view.id, owner))).toEqual(['kind', 'description', 'goal', 'counterpartRole']);
    expect(QuizAnswersSchema.safeParse({ kind: 'raise', ...common, description: '' }).success).toBe(true);
    await f.profile.patch(owner, f.view.id, 'patch-key-01', {
      expectedRevision: 0, patch: { kind: 'custom', ...common, description: '   ' },
    });
    expect(f.profile.missing(await f.service.load(f.view.id, owner))).toEqual(['description']);
  });

  it('invalidates human confirmation when the goal changes', async () => {
    const f = await fixture();
    const saved = await f.profile.patch(owner, f.view.id, 'patch-key-01', {
      expectedRevision: 0, patch: { kind: 'relationship', ...common },
    });
    const confirmed = await f.profile.confirm(owner, f.view.id, 'confirm-key-01', { expectedRevision: saved.revision });
    const changed = await f.profile.patch(owner, f.view.id, 'patch-key-02', {
      expectedRevision: confirmed.revision, patch: { goal: 'Understand their concerns before deciding' },
    });
    expect(changed.confirmed).toBe(false);
    expect(changed.profileRevision).toBe(confirmed.profileRevision + 1);
    await expect(f.profile.handoff(owner, f.view.id)).rejects.toMatchObject({ code: 'CONFIRMATION_REQUIRED' });
  });

  it.each(['relationship', null] as const)('clears prior financial assumptions when the kind changes to %s', async kind => {
    const f = await fixture();
    const saved = await f.profile.patch(owner, f.view.id, 'patch-key-01', {
      expectedRevision: 0, patch: { kind: 'raise', ...common, ...amounts, userRole: 'Engineer', fear: 'Being interrupted' },
    });
    const changed = await f.profile.patch(owner, f.view.id, 'patch-key-02', {
      expectedRevision: saved.revision, patch: { kind },
    });
    expect(changed.publicProfile).toMatchObject({ ...common, userRole: 'Engineer', fear: 'Being interrupted' });
    for (const field of Object.keys(amounts)) expect(changed.publicProfile).not.toHaveProperty(field);
    expect(changed.publicProfile.kind).toBe(kind ?? undefined);
  });

  it('keeps only money explicitly supplied again with a new kind', async () => {
    const f = await fixture();
    const saved = await f.profile.patch(owner, f.view.id, 'patch-key-01', {
      expectedRevision: 0, patch: { kind: 'raise', ...amounts },
    });
    const changed = await f.profile.patch(owner, f.view.id, 'patch-key-02', {
      expectedRevision: saved.revision,
      patch: { kind: 'rent', currentMinor: 180_000, currency: 'USD', period: 'month', moneyBasis: 'unspecified' },
    });
    expect(changed.publicProfile).toEqual({ kind: 'rent', currentMinor: 180_000, currency: 'USD', period: 'month', moneyBasis: 'unspecified' });
  });

  it('preserves a legacy kindless monetary draft when adding common context', async () => {
    const f = await fixture();
    expect(QuizDraftSchema.safeParse(amounts).success).toBe(true);
    const legacy = await f.profile.patch(owner, f.view.id, 'patch-key-01', { expectedRevision: 0, patch: amounts });
    const changed = await f.profile.patch(owner, f.view.id, 'patch-key-02', {
      expectedRevision: legacy.revision, patch: { kind: 'raise', ...common },
    });
    expect(changed.publicProfile).toMatchObject({ kind: 'raise', ...common, ...amounts });
    const sameKind = await f.profile.patch(owner, f.view.id, 'patch-key-03', {
      expectedRevision: changed.revision, patch: { kind: 'raise', goal: 'Ask for a clear review date' },
    });
    expect(sameKind.publicProfile).toMatchObject(amounts);
  });

  it.each([
    [{ kind: 'custom', currentMinor: 100 }, 'MONEY_UNITS_REQUIRED'],
    [{ kind: 'custom', marketLowMinor: 200, marketHighMinor: 100, currency: 'USD', period: 'one_time', moneyBasis: 'unspecified' }, 'INVALID_RANGE'],
    [{ kind: 'custom', currentMinor: 1.5, currency: 'USD', period: 'month', moneyBasis: 'gross' }, 'INVALID_PROFILE'],
    [{ kind: 'custom', currentMinor: 100, currency: 'EUR', period: 'month', moneyBasis: 'gross' }, 'INVALID_PROFILE'],
  ])('retains monetary validation for optional financial details %#', async (patch, code) => {
    const f = await fixture();
    await expect(f.profile.patch(owner, f.view.id, 'patch-key-01', {
      expectedRevision: 0, patch: patch as ProfilePatch,
    })).rejects.toMatchObject({ code });
    expect((await f.service.read(owner, f.view.id)).publicProfile).toEqual({});
  });
});
