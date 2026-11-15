import { describe, expect, it } from 'vitest';
import type { MoneyAnswer } from '@/contracts/intake';
import type { IntakeProfile, PendingClarification } from '@/onboarding/contracts';
import { extractFromUtterance, type AskedField } from '@/onboarding/domain/extract';
import { extractionFromModel, type ModelExtraction } from '@/onboarding/domain/model-extract';
import { emptyProfile } from '@/onboarding/domain/profile';
import { createIntakePort } from '@/onboarding/server/port';
import { createIntake, postMessage } from '@/onboarding/server/service';
import type { ModelPorts } from '@/intelligence/ports';
import { IP, OWNER, makeDeps } from '../server/helpers';

const none: ModelExtraction = { intent: 'unclear', kind: null, userRole: null, counterpartRole: null, currentMoney: null, targetMoney: null, marketRange: null, fear: null, reasons: null, conversationDate: null, ack: null };
const usd = (amount: number, period: 'year' | 'month' | 'hour' = 'year', stated = true) => ({ amount, period, periodStated: stated, currency: 'USD', currencyStated: stated, basis: stated ? ('gross' as const) : ('unspecified' as const) });

function ctx(asked: AskedField, kind: IntakeProfile['kind']['value'] = 'raise', pending: PendingClarification | null = null) {
  const profile = emptyProfile();
  if (kind) profile.kind = { value: kind, status: 'candidate', sourceTurnId: null, revision: 1, formula: null };
  return { asked, profile, pending, lastMoneyField: null };
}
const value = (patches: { patch: { field: string; value: unknown } }[], field: string) => patches.find((p) => p.patch.field === field)?.patch.value;

describe('model-assisted intake extraction', () => {
  it('maps a natural answer onto several fields at once', () => {
    const e = extractionFromModel(
      { ...none, intent: 'info', kind: 'raise', userRole: 'Backend engineer', counterpartRole: 'manager', currentMoney: usd(80_000), targetMoney: usd(95_000), ack: 'A raise with your manager.' },
      'I am a backend engineer, my review with my manager is soon. I make $80,000 a year before tax and want $95,000 a year before tax.',
      ctx('kind', null),
    )!;
    expect(value(e.patches, 'kind')).toBe('raise');
    expect(value(e.patches, 'counterpartRole')).toBe('Manager');
    expect(value(e.patches, 'currentMoney')).toMatchObject({ amountMinor: 8_000_000, period: 'year' });
    expect(value(e.patches, 'targetMoney')).toMatchObject({ amountMinor: 9_500_000 });
    expect(e.clarification).toBeNull();
    expect(e.ack).toBe('A raise with your manager.');
  });

  it('rejects the whole reading when an amount is not in the user’s words', () => {
    expect(extractionFromModel({ ...none, intent: 'info', targetMoney: usd(120_000) }, 'I want a bit more than now', ctx('targetMoney'))).toBeNull();
  });

  it('converts an hourly rate in code and asks to check it', () => {
    const e = extractionFromModel({ ...none, intent: 'info', targetMoney: usd(10, 'hour') }, 'I want $10 an hour', ctx('targetMoney', 'raise'))!;
    expect(value(e.patches, 'targetMoney')).toMatchObject({ amountMinor: 160_000, period: 'month' });
    expect(e.clarification?.question).toBe('Just to check: $10 an hour is about $1,600/month at 160 hours a month. Shall I use that?');
  });

  it('accepts a unit correction to the pending check', () => {
    const proposal: MoneyAnswer = { amountMinor: 500_000, currency: 'USD', period: 'year', basis: 'unspecified' };
    const pending: PendingClarification = { field: 'targetMoney', question: 'Just to check: $5,000/year, in US dollars, before tax?', proposal };
    const e = extractionFromModel({ ...none, intent: 'info', targetMoney: usd(5_000, 'month') }, 'monthly, before tax', ctx('targetMoney', 'raise', pending))!;
    expect(value(e.patches, 'targetMoney')).toMatchObject({ amountMinor: 500_000, period: 'month' });
    expect(e.clarification).toBeNull();
  });

  it('asks the pending check again when the answer is unclear', () => {
    const pending: PendingClarification = { field: 'currentMoney', question: 'Just to check: $95,000/year, in US dollars, before tax?', proposal: { amountMinor: 9_500_000, currency: 'USD', period: 'year', basis: 'unspecified' } };
    expect(extractionFromModel(none, 'hmm', ctx('currentMoney', 'raise', pending))!.clarification).toEqual(pending);
    expect(extractFromUtterance('let us think about it per hour', ctx('currentMoney', 'raise', pending)).clarification).toEqual(pending);
  });

  it('drops an acknowledgement that contains numbers', () => {
    expect(extractionFromModel({ ...none, intent: 'info', userRole: 'Designer', ack: 'You make 80k.' }, 'I am a designer', ctx('userRole'))!.ack).toBeNull();
  });
});

describe('text coach with a model', () => {
  it('uses the model reading and falls back to rules when the model fails', async () => {
    let fail = false;
    const models: ModelPorts = {
      available: true,
      async completeStructured() {
        if (fail) throw new Error('down');
        return { ...none, intent: 'info', kind: 'raise', userRole: 'Backend engineer', counterpartRole: 'Manager', currentMoney: usd(80_000), targetMoney: usd(95_000), ack: 'A raise talk with your manager.' };
      },
    };
    const deps = makeDeps({ models });
    deps.intake = createIntakePort(deps);
    const created = await createIntake(deps, OWNER, { mode: 'text', consents: { audioAnalysis: false, visualAnalysis: false }, consentVersion: 1 });
    const v = await postMessage(deps, OWNER, IP, created.id, { turnId: 'turn-model-0001', text: 'Backend engineer asking my manager for a raise: I make $80,000 a year before tax and want $95,000 a year before tax.' });
    expect(v.publicProfile.kind.value).toBe('raise');
    expect(v.publicProfile.currentMoney.value).toMatchObject({ amountMinor: 8_000_000 });
    expect(v.publicProfile.targetMoney.value).toMatchObject({ amountMinor: 9_500_000 });
    fail = true;
    const after = await postMessage(deps, OWNER, IP, created.id, { turnId: 'turn-model-0002', text: 'Levels.fyi shows $90,000 to $110,000 a year' });
    expect(after.publicProfile.marketRange.value).toMatchObject({ lowMinor: 9_000_000, highMinor: 11_000_000 });
  });
});
