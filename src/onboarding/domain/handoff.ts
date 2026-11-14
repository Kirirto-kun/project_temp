import type { IntakeHandoff, MoneyAnswer, QuizDraft, QuizField } from '@/contracts/intake';
import { allowedPeriodsForKind } from '@/contracts/domain';
import { normalizePracticeMoney, validatePracticeDraft } from '@/domain/intake-handoff';
import { personasForKind } from '@/scenarios/personas';
import type { IntakeSession, RangeValue } from '../contracts';

export interface DraftBuild {
  draft: QuizDraft;
  missingFields: QuizField[];
  notes: string[];
  supportedCurrency: boolean;
  formulas: string[];
}

export const EXAMPLE_DRAFT: QuizDraft = {
  kind: 'raise',
  counterpartRole: 'Manager',
  userRole: 'Software engineer',
  currentMinor: 9_500_000,
  targetMinor: 11_000_000,
  marketLowMinor: 10_000_000,
  marketHighMinor: 11_200_000,
  period: 'year',
  currency: 'USD',
  moneyBasis: 'gross',
  inputMode: 'example',
  rangeSource: 'example',
  description: 'Example scenario.',
  fear: '',
  conversationDate: null,
};

function toPeriod(m: MoneyAnswer, period: 'year' | 'month' | 'one_time', formulas: string[]): number | null {
  if (m.period === period) return m.amountMinor;
  try {
    const candidate = normalizePracticeMoney(m, period, { rounding: 'nearest_cent' });
    formulas.push(candidate.formula);
    return candidate.value.amountMinor;
  } catch {
    return null;
  }
}

function rangeToPeriod(r: RangeValue, period: 'year' | 'month' | 'one_time', basis: MoneyAnswer['basis'], formulas: string[]): [number, number] | null {
  const low = toPeriod({ amountMinor: r.lowMinor, currency: r.currency, period: r.period, basis }, period, formulas);
  const high = toPeriod({ amountMinor: r.highMinor, currency: r.currency, period: r.period, basis }, period, formulas);
  return low !== null && high !== null ? [low, high] : null;
}

/**
 * Builds the practice draft from confirmed profile values only. Candidates, skipped and
 * unknown values stay missing; no amount is invented, converted between currencies or
 * between gross and net.
 */
export function buildDraftFromProfile(session: IntakeSession): DraftBuild {
  const notes: string[] = [];
  const formulas: string[] = [];
  if (session.inputMode === 'example') {
    const missing = validatePracticeDraft(EXAMPLE_DRAFT).missingFields;
    return { draft: { ...EXAMPLE_DRAFT, sourceIntakeId: session.id }, missingFields: missing, notes: ['Example scenario, not your personal numbers.'], supportedCurrency: true, formulas };
  }
  const p = session.profile;
  const confirmed = <T,>(f: { value: T | null; status: string }) => (f.status === 'confirmed' ? f.value : null);
  const kind = confirmed(p.kind) ?? p.kind.value;
  const draft: QuizDraft = {
    kind: kind ?? undefined,
    counterpartRole: confirmed(p.counterpartRole) ?? p.counterpartRole.value ?? undefined,
    userRole: (confirmed(p.userRole) ?? p.userRole.value) || undefined,
    description: confirmed(p.reasons) ?? p.reasons.value ?? '',
    fear: confirmed(p.fear) ?? p.fear.value ?? '',
    conversationDate: (confirmed(p.conversationDate) ?? null) as string | null,
    inputMode: 'personal',
  };
  const period = kind ? allowedPeriodsForKind(kind)[0]! : undefined;
  const current = confirmed(p.currentMoney);
  const target = confirmed(p.targetMoney);
  let supportedCurrency = true;
  for (const m of [current, target, confirmed(p.marketRange)]) {
    if (m && m.currency !== 'USD') supportedCurrency = false;
  }
  if (!supportedCurrency) notes.push('Practice rounds use US dollars in this version. Your amounts are kept as you said them; you can practise with a USD example instead.');
  if (supportedCurrency && period) {
    draft.currency = 'USD';
    draft.period = period;
    if (current) draft.currentMinor = toPeriod(current, period, formulas) ?? undefined;
    if (target) draft.targetMinor = toPeriod(target, period, formulas) ?? undefined;
    const basisValues = [current?.basis, target?.basis].filter((b): b is MoneyAnswer['basis'] => Boolean(b));
    const specified = basisValues.filter((b) => b !== 'unspecified');
    if (specified.length === 2 && specified[0] !== specified[1]) notes.push('One amount is before tax and the other after tax. Make them the same basis.');
    else draft.moneyBasis = specified[0] ?? (basisValues.length ? 'unspecified' : undefined);
    const market = confirmed(p.marketRange);
    const practice = confirmed(p.practiceRange);
    if (market) {
      const range = rangeToPeriod(market, period, draft.moneyBasis ?? 'unspecified', formulas);
      if (range) {
        [draft.marketLowMinor, draft.marketHighMinor] = range;
        draft.rangeSource = 'user_provided';
      }
    } else if (practice) {
      draft.marketLowMinor = practice.lowMinor;
      draft.marketHighMinor = practice.highMinor;
      draft.rangeSource = 'practice_assumption';
    }
  }
  const validation = validatePracticeDraft(draft);
  for (const error of validation.errors) notes.push(error.message);
  const missing = new Set<QuizField>(validation.missingFields);
  for (const error of validation.errors) if (error.field !== '_form') missing.add(error.field);
  missing.add('avatarId');
  return { draft, missingFields: [...missing], notes, supportedCurrency, formulas };
}

export function handoffFrom(session: IntakeSession, build: DraftBuild, confirmedAt: string): IntakeHandoff {
  const kind = build.draft.kind;
  const suggested = kind && kind !== 'custom' ? personasForKind(kind)[0]?.avatarId ?? null : null;
  return {
    intakeId: session.id,
    profileRevision: session.profileRevision,
    confirmedAt,
    quizDraft: { ...build.draft, sourceIntakeId: session.id },
    missingFields: build.missingFields,
    suggestedAvatarId: suggested,
    referenceKind: session.assessment?.speechAvailable ? 'observed_intake' : 'none',
    assessmentId: session.assessment ? `asm_${session.id}` : null,
    mode: session.inputMode,
  };
}
