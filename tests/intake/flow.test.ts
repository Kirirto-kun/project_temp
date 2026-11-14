import { describe, expect, it } from 'vitest';
import { createIntakePort } from '@/onboarding/server/port';
import { confirmProfile, createIntake, getIntake, handleTool, patchProfile, postMessage, recordTranscript, stopMedia, updateConsent } from '@/onboarding/server/service';
import { intakeStore } from '@/onboarding/server/service';
import { createSession, loadOwnedSession } from '@/server/session/service';
import { IP, OTHER, OWNER, makeDeps } from '../server/helpers';

let n = 0;
const tid = () => `turn-intake-${String((n += 1)).padStart(4, '0')}`;

async function talk(deps: ReturnType<typeof makeDeps>, id: string, ...lines: string[]) {
  let view = await getIntake(deps, OWNER, id);
  for (const text of lines) view = await postMessage(deps, OWNER, IP, id, { turnId: tid(), text });
  return view;
}

async function fullInterview() {
  const deps = makeDeps();
  deps.intake = createIntakePort(deps);
  const created = await createIntake(deps, OWNER, { mode: 'text', consents: { audioAnalysis: false, visualAnalysis: false }, consentVersion: 1 });
  const view = await talk(
    deps,
    created.id,
    "I'm a backend engineer and I want to ask for a raise.",
    'My manager',
    'I make ninety-five',
    'yes',
    'I want a hundred and ten',
    'yes',
    'Levels.fyi shows $105,000 to $120,000 a year for my level',
    'They will say the budget is frozen.',
    "Hi, I'd like to talk about my pay. Sorry, I know it's a lot, but maybe $105,000?",
  );
  return { deps, id: created.id, view };
}

describe('text coach flow', () => {
  it('greets with an AI disclosure and asks one question at a time', async () => {
    const deps = makeDeps();
    const v = await createIntake(deps, OWNER, { mode: 'text', consents: { audioAnalysis: false, visualAnalysis: false }, consentVersion: 1 });
    expect(v.committedTranscript[0]?.text).toMatch(/AI practice coach/);
    expect(v.phase).toBe('interviewing');
  });

  it('collects candidates, asks to clarify inferred units, reaches review with an assessment', async () => {
    const { view } = await fullInterview();
    const p = view.publicProfile;
    expect(p.kind.value).toBe('raise');
    expect(p.userRole.value).toBe('backend engineer');
    expect(p.counterpartRole.value).toBe('Manager');
    expect(p.currentMoney).toMatchObject({ status: 'candidate', value: { amountMinor: 9_500_000, period: 'year', basis: 'gross', currency: 'USD' } });
    expect(p.targetMoney).toMatchObject({ status: 'candidate', value: { amountMinor: 11_000_000 } });
    expect(p.marketRange.value).toMatchObject({ lowMinor: 10_500_000, highMinor: 12_000_000 });
    expect(view.phase).toBe('review');
    expect(view.committedTranscript.some((t) => t.text.startsWith('Just to check: $95,000/year'))).toBe(true);
    expect(view.assessmentStatus).toBe('partial');
  });

  it('a duplicate turnId is not applied twice', async () => {
    const deps = makeDeps();
    const v = await createIntake(deps, OWNER, { mode: 'text', consents: { audioAnalysis: false, visualAnalysis: false }, consentVersion: 1 });
    const a = await postMessage(deps, OWNER, IP, v.id, { turnId: 'turn-dup-0001', text: 'I want a raise' });
    const b = await postMessage(deps, OWNER, IP, v.id, { turnId: 'turn-dup-0001', text: 'I want a raise' });
    expect(b.committedTranscript.length).toBe(a.committedTranscript.length);
  });

  it('is owner-bound', async () => {
    const deps = makeDeps();
    const v = await createIntake(deps, OWNER, { mode: 'text', consents: { audioAnalysis: false, visualAnalysis: false }, consentVersion: 1 });
    await expect(getIntake(deps, OTHER, v.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('review, confirmation and handoff', () => {
  it('nothing is confirmed until the user confirms; then the handoff starts the same practice as the quick form', async () => {
    const { deps, id } = await fullInterview();
    const port = createIntakePort(deps);
    await expect(port.getConfirmedHandoff(id, OWNER)).rejects.toMatchObject({ code: 'PROFILE_INCOMPLETE' });
    const before = await getIntake(deps, OWNER, id);
    const confirmed = await confirmProfile(deps, OWNER, id, before.revision, ['kind', 'userRole', 'counterpartRole', 'currentMoney', 'targetMoney', 'marketRange', 'reasons', 'fear']);
    expect(confirmed.publicProfile.currentMoney.status).toBe('confirmed');
    expect(confirmed.handoff?.missingFields).toEqual(['avatarId']);
    expect(confirmed.handoff?.quizDraft).toMatchObject({ currentMinor: 9_500_000, targetMinor: 11_000_000, marketLowMinor: 10_500_000, marketHighMinor: 12_000_000, rangeSource: 'user_provided', moneyBasis: 'gross' });

    const session = await createSession(deps, { intakeId: id, profileRevision: confirmed.handoff!.profileRevision, avatarId: 'daniel-okafor', baselineId: null }, { ownerId: OWNER, ipHash: IP, idempotencyKey: null });
    const stored = await loadOwnedSession(deps, session.id, OWNER);
    expect(stored.scenarioSnapshot.sourceIntakeId).toBe(id);
    expect(stored.scenarioSnapshot.reservationAmountMinor).toBe(12_000_000);
  });

  it('an edit after confirmation makes the handoff stale', async () => {
    const { deps, id } = await fullInterview();
    const v = await getIntake(deps, OWNER, id);
    const confirmed = await confirmProfile(deps, OWNER, id, v.revision, ['kind', 'counterpartRole', 'currentMoney', 'targetMoney', 'marketRange']);
    const edited = await patchProfile(deps, OWNER, id, confirmed.revision, { currentMoney: { amountMinor: 5_000_000, currency: 'USD', period: 'year', basis: 'gross' } });
    expect(edited.handoff).toBeNull();
    await expect(createSession(deps, { intakeId: id, profileRevision: confirmed.handoff!.profileRevision, avatarId: 'daniel-okafor', baselineId: null }, { ownerId: OWNER, ipHash: IP, idempotencyKey: null })).rejects.toMatchObject({
      code: 'PROFILE_INCOMPLETE',
    });
  });

  it('unknown market: no invented range; practice bounds only with explicit choice and labelled', async () => {
    const deps = makeDeps();
    deps.intake = createIntakePort(deps);
    const v0 = await createIntake(deps, OWNER, { mode: 'text', consents: { audioAnalysis: false, visualAnalysis: false }, consentVersion: 1 });
    await talk(deps, v0.id, 'I want a raise', 'skip', 'My manager', '$95,000 a year before tax', '$110,000 a year before tax', "I don't know", 'skip', 'skip');
    let v = await getIntake(deps, OWNER, v0.id);
    expect(v.publicProfile.marketRange.status).toBe('unknown');
    const unconfirmed = await confirmProfile(deps, OWNER, v.id, v.revision, ['kind', 'counterpartRole', 'currentMoney', 'targetMoney']);
    expect(unconfirmed.handoff?.missingFields).toEqual(expect.arrayContaining(['marketLowMinor', 'marketHighMinor']));
    v = await patchProfile(deps, OWNER, v.id, unconfirmed.revision, { usePracticeRange: true });
    expect(v.publicProfile.practiceRange.formula).toMatch(/not a market estimate/);
    const ok = await confirmProfile(deps, OWNER, v.id, v.revision, ['kind', 'counterpartRole', 'currentMoney', 'targetMoney', 'practiceRange']);
    expect(ok.handoff?.quizDraft).toMatchObject({ marketLowMinor: 9_500_000, marketHighMinor: 11_000_000, rangeSource: 'practice_assumption' });
  });

  it('another currency is kept and blocks a personal round; an example is offered', async () => {
    const deps = makeDeps();
    const v0 = await createIntake(deps, OWNER, { mode: 'text', consents: { audioAnalysis: false, visualAnalysis: false }, consentVersion: 1 });
    await talk(deps, v0.id, 'I want a raise', 'engineer', 'My manager', 'about 90,000 euros a year before tax', '100,000 euros a year before tax');
    const v = await getIntake(deps, OWNER, v0.id);
    expect(v.publicProfile.currentMoney.value).toMatchObject({ currency: 'EUR' });
    const confirmed = await confirmProfile(deps, OWNER, v.id, v.revision, ['kind', 'counterpartRole', 'currentMoney', 'targetMoney']);
    expect(confirmed.supportedCurrency).toBe(false);
    expect(confirmed.handoff?.missingFields).toEqual(expect.arrayContaining(['currentMinor', 'targetMinor']));
    const example = await patchProfile(deps, OWNER, v.id, confirmed.revision, { useExample: true });
    const exampleConfirmed = await confirmProfile(deps, OWNER, v.id, example.revision, []);
    expect(exampleConfirmed.handoff?.quizDraft).toMatchObject({ inputMode: 'example', rangeSource: 'example', currency: 'USD' });
  });
});

describe('audio call bookkeeping', () => {
  async function audioIntake() {
    const deps = makeDeps();
    const v = await createIntake(deps, OWNER, { mode: 'audio', consents: { audioAnalysis: true, visualAnalysis: false }, consentVersion: 1 });
    // Simulate a connected call without contacting a provider.
    await intakeStore(deps).update(v.id, (s) => ({ ...s, mediaStatus: 'active', providerEpoch: 1, phase: 'interviewing' }));
    return { deps, id: v.id };
  }

  it('transcripts run the same extraction; tool quotes must be the user’s own words', async () => {
    const { deps, id } = await audioIntake();
    await recordTranscript(deps, OWNER, id, { providerEpoch: 1, itemId: 'item_1', role: 'user', text: "I'm a designer preparing for a raise. I make $80,000 a year before tax." });
    let v = await getIntake(deps, OWNER, id);
    expect(v.publicProfile.currentMoney.value).toMatchObject({ amountMinor: 8_000_000 });
    const forged = await handleTool(deps, OWNER, id, { providerEpoch: 1, callId: 'call_1', name: 'propose_profile_patch', arguments: JSON.stringify({ field: 'targetMoney', quote: 'I want $500,000' }) });
    expect(forged.output.ok).toBe(false);
    await recordTranscript(deps, OWNER, id, { providerEpoch: 1, itemId: 'item_2', role: 'user', text: 'I would like ninety thousand' });
    const ok = await handleTool(deps, OWNER, id, { providerEpoch: 1, callId: 'call_2', name: 'propose_profile_patch', arguments: JSON.stringify({ field: 'targetMoney', quote: 'ninety thousand' }) });
    expect(ok.output.ok).toBe(true);
    v = await getIntake(deps, OWNER, id);
    expect(v.publicProfile.targetMoney).toMatchObject({ status: 'candidate', value: { amountMinor: 9_000_000 } });
    const again = await handleTool(deps, OWNER, id, { providerEpoch: 1, callId: 'call_2', name: 'propose_profile_patch', arguments: JSON.stringify({ field: 'targetMoney', quote: 'ninety thousand' }) });
    expect(again.output.duplicate).toBe(true);
  });

  it('stop closes media, bumps the epoch, and late callbacks are ignored', async () => {
    const { deps, id } = await audioIntake();
    const stopped = await stopMedia(deps, OWNER, id, 'end');
    expect(stopped.mediaStatus).toBe('closed');
    expect(stopped.phase).toBe('review');
    const late = await handleTool(deps, OWNER, id, { providerEpoch: 1, callId: 'call_late', name: 'request_mini_practice', arguments: '{}' });
    expect(late.output.ok).toBe(false);
    const before = await getIntake(deps, OWNER, id);
    const after = await recordTranscript(deps, OWNER, id, { providerEpoch: 1, itemId: 'late', role: 'user', text: 'I make $1,000,000' });
    expect(after.committedTranscript.length).toBe(before.committedTranscript.length);
  });

  it('revoking audio consent is never blocked by a stale revision', async () => {
    const { deps, id } = await audioIntake();
    const v = await updateConsent(deps, OWNER, id, { audioAnalysis: false }, 0);
    expect(v.consents.audioAnalysis).toBe(false);
    expect(v.consentVersion).toBe(2);
    await expect(createIntakePort(deps).ensureAudioAllowed(id, OWNER)).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });

  it('handoff closes any open media', async () => {
    const { deps, id } = await audioIntake();
    await createIntakePort(deps).ensureMediaClosed(id, OWNER);
    expect((await getIntake(deps, OWNER, id)).mediaStatus).toBe('closed');
  });
});
