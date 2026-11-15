import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IntakeHandoff, MoneyAnswer } from '@/contracts/intake';
import type { IntakeProfile, IntakeView } from '@/onboarding/contracts';
import { emptyProfile } from '@/onboarding/domain/profile';
import { CONFIRMED_HANDOFF } from '@/testing/fixtures';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('next/link', () => ({ default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a> }));
const api = vi.hoisted(() => ({ confirmIntake: vi.fn(), patchProfile: vi.fn(), getAssessment: vi.fn(), sendMessage: vi.fn(), deleteIntake: vi.fn() }));
vi.mock('@/onboarding/client/api', () => api);

import { Review } from '@/onboarding/ui/Review';

const usd = (amountMinor: number, basis: MoneyAnswer['basis'] = 'gross'): MoneyAnswer => ({ amountMinor, currency: 'USD', period: 'year', basis });
const cand = <T,>(value: T) => ({ value, status: 'candidate' as const, sourceTurnId: 't', revision: 1, formula: null });

function viewOf(profile: IntakeProfile, patch: Partial<IntakeView> = {}): IntakeView {
  return {
    id: 'int_test', revision: 9, profileRevision: 7, phase: 'review', mode: 'text', mediaStatus: 'not_started', publicProfile: profile, committedTranscript: [],
    availability: { coachVoice: false, avatarIntake: false, audioAnalysis: false }, consents: { audioAnalysis: false, visualAnalysis: false }, consentVersion: 1, missingFields: [], pendingQuestion: null,
    expiresAt: '2026-11-16T00:00:00.000Z', deadlineAt: null, inputMode: 'personal', assessmentStatus: null, handoff: null, supportedCurrency: true, ...patch,
  };
}
/** The demo script: everything answered, "I don't know the market". */
function scriptProfile(): IntakeProfile {
  return { ...emptyProfile(), kind: cand('raise'), userRole: cand('backend engineer'), counterpartRole: cand('Manager'), currentMoney: cand(usd(9_500_000)), targetMoney: cand(usd(11_000_000)), reasons: cand('I took over the payments team.'), fear: cand('Budget is frozen.') } as IntakeProfile;
}
const handoff = (missingFields: string[]): IntakeHandoff => ({ ...CONFIRMED_HANDOFF, intakeId: 'int_test', missingFields: missingFields as IntakeHandoff['missingFields'] });
const CAMEL = /\b[a-z]+[A-Z][A-Za-z]*\b/; // marketLowMinor, rangeSource, counterpartRole ...
const confirmButton = () => screen.getByRole('button', { name: /Confirm and start my practice/ });
const alertText = async () => (await screen.findByRole('alert')).textContent ?? '';

describe('QA-9: coach review, Confirm with an incomplete brief', () => {
  beforeEach(() => {
    push.mockReset();
    for (const fn of Object.values(api)) fn.mockReset();
    api.getAssessment.mockResolvedValue(null);
  });

  it('unknown range, practice-bounds box unticked: plain hint, and the server is not asked to complete the intake', async () => {
    const view = viewOf(scriptProfile());
    api.confirmIntake.mockResolvedValue({ intake: { ...view, phase: 'completed' }, handoff: handoff(['marketLowMinor', 'marketHighMinor', 'rangeSource', 'avatarId']) });
    render(<Review view={view} onView={() => undefined} />);
    expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(false);
    fireEvent.click(confirmButton());
    const text = await alertText();
    expect(text).toMatch(/practice bounds/i);
    expect(text).not.toMatch(CAMEL);
    expect(api.confirmIntake).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
    expect(confirmButton()).toBeEnabled();
  });

  it('box ticked: confirms and continues to the counterparts', async () => {
    const profile = { ...scriptProfile(), practiceRange: cand({ lowMinor: 9_500_000, highMinor: 11_000_000, currency: 'USD', period: 'year' as const }) } as IntakeProfile;
    const view = viewOf(profile);
    api.confirmIntake.mockResolvedValue({ intake: { ...view, phase: 'completed' }, handoff: handoff(['avatarId']) });
    render(<Review view={view} onView={() => undefined} />);
    expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(true);
    fireEvent.click(confirmButton());
    await waitFor(() => expect(push).toHaveBeenCalledWith('/opponents'));
    expect(api.confirmIntake).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('a brief with almost nothing filled in: no internal field names, points to the quick form', async () => {
    const view = viewOf(emptyProfile());
    api.confirmIntake.mockResolvedValue({
      intake: { ...view, phase: 'completed' },
      handoff: handoff(['kind', 'counterpartRole', 'currentMinor', 'targetMinor', 'marketLowMinor', 'marketHighMinor', 'period', 'currency', 'moneyBasis', 'rangeSource', 'avatarId']),
    });
    render(<Review view={view} onView={() => undefined} />);
    fireEvent.click(confirmButton());
    const text = await alertText();
    expect(text).not.toMatch(CAMEL);
    expect(text).not.toMatch(/\b(kind|period|currency)\b/);
    expect(text).toMatch(/quick form/i);
    expect(text).toMatch(/what you are negotiating/i);
    expect(text.match(/range/gi)?.length ?? 0).toBeLessThanOrEqual(1); // never repeated three times
    expect(push).not.toHaveBeenCalled();
  });

  it('example mode (chosen after a non-USD intake) still starts: the pre-check must not block it', async () => {
    const eur = (amountMinor: number): MoneyAnswer => ({ amountMinor, currency: 'EUR', period: 'year', basis: 'gross' });
    const profile = { ...scriptProfile(), currentMoney: cand(eur(8_000_000)), targetMoney: cand(eur(9_000_000)) } as IntakeProfile;
    const view = viewOf(profile, { inputMode: 'example' });
    api.confirmIntake.mockResolvedValue({ intake: { ...view, phase: 'completed' }, handoff: { ...handoff(['avatarId']), mode: 'example' } });
    render(<Review view={view} onView={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: 'Start my practice' }));
    await waitFor(() => expect(api.confirmIntake).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/opponents'));
  });

  it('no practice bounds possible (target on the wrong side): the missing range is named once, in plain words', async () => {
    const profile = { ...scriptProfile(), currentMoney: cand(usd(11_000_000)), targetMoney: cand(usd(9_500_000)) } as IntakeProfile;
    const view = viewOf(profile);
    api.confirmIntake.mockResolvedValue({ intake: { ...view, phase: 'completed' }, handoff: handoff(['marketLowMinor', 'marketHighMinor', 'rangeSource', 'avatarId']) });
    render(<Review view={view} onView={() => undefined} />);
    expect(screen.queryByRole('checkbox')).toBeNull();
    fireEvent.click(confirmButton());
    const text = await alertText();
    expect(text).not.toMatch(CAMEL);
    expect(text.match(/a range or practice bounds/g)?.length).toBe(1);
    expect(text).toMatch(/quick form/i);
  });

  it('a single leftover field never produces an empty or raw list', async () => {
    const profile = { ...scriptProfile(), targetMoney: cand(usd(11_000_000, 'net')), practiceRange: cand({ lowMinor: 9_500_000, highMinor: 11_000_000, currency: 'USD', period: 'year' as const }) } as IntakeProfile;
    const view = viewOf(profile);
    api.confirmIntake.mockResolvedValue({ intake: { ...view, phase: 'completed' }, handoff: handoff(['moneyBasis', 'avatarId']) });
    render(<Review view={view} onView={() => undefined} />);
    fireEvent.click(confirmButton());
    const text = await alertText();
    expect(text).not.toMatch(CAMEL);
    expect(text).not.toMatch(/:\s*\./);
    expect(text).toMatch(/tax/i);
  });
});
