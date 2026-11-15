'use client';

import { ArrowRight, BriefcaseBusiness, CircleAlert, House, ReceiptText, TrendingUp, type LucideIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { allowedPeriodsForKind, objectiveForKind, type MoneyBasis, type Period, type StandardKind } from '@/contracts/domain';
import { applyMoneyPercent, suggestPracticeRange, validatePracticeDraft } from '@/domain/intake-handoff';
import { formatMoney } from '@/domain/money';
import type { DraftState } from '@/client/storage/draft';
import { CoachMark } from '@/components/holdline/Avatar';
import { ScreenSkeleton } from '@/components/ui/skeleton';
import { StepTransition } from '@/components/ui/step-transition';
import { useDraft } from '@/features/setup/useDraft';
import { COACH_NOTES, COUNTERPART_ROLES, KIND_TILES } from '@/content/copy';
import { FunnelProgress } from './Progress';
import { MoneyField } from './MoneyField';

const TOTAL = 7;

function kindOf(state: DraftState): StandardKind {
  const k = state.draft.kind;
  return k === 'offer' || k === 'rent' || k === 'bill' ? k : 'raise';
}

const KIND_META: Record<StandardKind, { icon: LucideIcon; hint: string }> = {
  raise: { icon: TrendingUp, hint: 'With your manager' },
  offer: { icon: BriefcaseBusiness, hint: 'With a recruiter' },
  rent: { icon: House, hint: 'With your landlord' },
  bill: { icon: ReceiptText, hint: 'With a provider' },
};

const STEP_EYEBROW = ['The conversation', 'Your counterpart', 'Where you are', 'Where you want to be', 'The range', 'What worries you', 'Before you start'];

const CURRENT_LABEL: Record<StandardKind, { label: string; hint: string }> = {
  raise: { label: 'What is your current base pay per year?', hint: 'Base salary only. Leave bonuses out.' },
  offer: { label: 'What base pay does the offer state per year?', hint: 'The number in the offer as it stands today.' },
  rent: { label: 'What is the rent per month you have been offered?', hint: 'The renewal or listing price.' },
  bill: { label: 'What does the bill charge?', hint: 'The amount on your current plan.' },
};

const TARGET_LABEL: Record<StandardKind, string> = {
  raise: 'What would you like to ask for per year?',
  offer: 'What base pay would you like per year?',
  rent: 'What rent per month would you like to pay?',
  bill: 'What would you like to pay instead?',
};

function StepHeader({ step, title, id, sub }: { step: number; title: string; id?: string; sub?: string }) {
  return (
    <header className="grid gap-3">
      <p className="eyebrow m-0">{STEP_EYEBROW[step]}</p>
      <h1 id={id} className="h-title m-0">
        {title}
      </h1>
      {sub && <p className="m-0 text-[15px] leading-6 text-muted">{sub}</p>}
    </header>
  );
}

function ErrorNote({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p className="callout callout-warn pop-in m-0 flex items-start gap-2 text-ink" role="alert">
      <CircleAlert size={18} strokeWidth={2} className="mt-px shrink-0 text-gap" aria-hidden />
      {error}
    </p>
  );
}

function ContinueButton({ onClick }: { onClick: () => void }) {
  return (
    <div className="funnel-actions">
      <button type="button" className="btn btn-primary btn-xl !max-w-none sm:!w-full" onClick={onClick}>
        Continue <ArrowRight size={18} strokeWidth={2} className="arrow" aria-hidden />
      </button>
    </div>
  );
}

export function QuizFlow() {
  const router = useRouter();
  const [state, setDraft] = useDraft();
  const [error, setError] = useState<string | null>(null);
  const [direction, setDirection] = useState<1 | -1>(1);
  const setState = (fn: (s: DraftState | null) => DraftState | null) => setDraft((current) => fn(current) ?? current);

  const kind = state ? kindOf(state) : 'raise';
  const period: Period = state?.draft.period ?? allowedPeriodsForKind(kind)[0]!;
  const objective = objectiveForKind(kind);

  const practiceRange = state?.draft.currentMinor && state.draft.targetMinor ? suggestPracticeRange(state.draft.currentMinor, state.draft.targetMinor, objective) : null;

  if (!state) return <ScreenSkeleton />;

  const step = Math.min(state.step, TOTAL - 1);
  const update = (patch: Partial<DraftState['draft']>, extra: Partial<DraftState> = {}) => {
    setError(null);
    setState((s) => (s ? { ...s, ...extra, draft: { ...s.draft, ...patch } } : s));
  };
  const go = (next: number) => {
    setError(null);
    setDirection(next >= step ? 1 : -1);
    setState((s) => (s ? { ...s, step: next } : s));
    if (typeof window !== 'undefined') window.scrollTo({ top: 0 });
  };
  const back = step > 0 ? () => go(step - 1) : undefined;

  function chooseKind(next: StandardKind) {
    const periods = allowedPeriodsForKind(next);
    const salaryNext = next === 'raise' || next === 'offer';
    setDirection(1);
    setState((s) =>
      s
        ? {
            ...s,
            step: 1,
            marketUnknown: false,
            practiceRangeConfirmed: false,
            avatarId: null,
            intake: null,
            draft: {
              ...s.draft,
              // A different kind starts clean: amounts, worry and salary-only answers do not carry over.
              ...(s.draft.kind !== next
                ? { currentMinor: undefined, targetMinor: undefined, fear: '', description: '', conversationDate: null, userRole: salaryNext ? s.draft.userRole : undefined }
                : {}),
              kind: next,
              period: periods[0],
              counterpartRole: COUNTERPART_ROLES[next]![0],
              currency: 'USD',
              inputMode: 'personal',
              moneyBasis: salaryNext ? (s.draft.moneyBasis ?? 'unspecified') : 'unspecified',
              marketLowMinor: undefined,
              marketHighMinor: undefined,
              rangeSource: undefined,
            },
          }
        : s,
    );
  }

  function continueFromAmounts(which: 'current' | 'target') {
    const { currentMinor, targetMinor } = state!.draft;
    if (which === 'current') {
      if (!currentMinor) return setError('Enter the current amount to continue.');
      return go(3);
    }
    if (!targetMinor) return setError('Enter the amount you want to continue.');
    if (currentMinor && (objective === 'maximize' ? targetMinor <= currentMinor : targetMinor >= currentMinor)) {
      return setError(objective === 'maximize' ? 'Your target should be above the current amount.' : 'Your target should be below the current amount.');
    }
    // Editing the amounts revokes a previously confirmed practice range.
    if (state!.draft.rangeSource === 'practice_assumption') update({ marketLowMinor: undefined, marketHighMinor: undefined, rangeSource: undefined }, { practiceRangeConfirmed: false });
    go(4);
  }

  function continueFromRange() {
    const d = state!.draft;
    if (state!.marketUnknown) {
      if (!state!.practiceRangeConfirmed || !practiceRange) return setError('Confirm the practice bounds or enter a range you know.');
      return go(5);
    }
    if (!d.marketLowMinor || !d.marketHighMinor) return setError('Enter both ends of the range, or choose “I don’t know”.');
    if (d.marketLowMinor > d.marketHighMinor) return setError('The low end is above the high end.');
    if (objective === 'maximize' && d.currentMinor && d.marketHighMinor < d.currentMinor) return setError('The high end should be at least your current pay.');
    if (objective === 'minimize' && d.currentMinor && d.marketLowMinor > d.currentMinor) return setError('The low end should be at most the current price.');
    update({ rangeSource: 'user_provided' });
    go(5);
  }

  function finish() {
    const validation = validatePracticeDraft({ ...state!.draft, avatarId: 'pending' });
    if (!validation.ready) {
      setError(validation.errors[0]?.message ?? `Missing: ${validation.missingFields.join(', ')}`);
      return;
    }
    setState((s) => (s ? { ...s, intake: null } : s));
    router.push('/result');
  }

  const salary = kind === 'raise' || kind === 'offer';

  return (
    <div className="mx-auto flex max-w-[600px] flex-col gap-8">
      <FunnelProgress step={step + 1} total={TOTAL} onBack={back} />

      <StepTransition stepKey={step} direction={direction} className="grid gap-6">
        {step === 0 && (
          <section aria-labelledby="q-kind" className="grid gap-6">
            <StepHeader step={0} id="q-kind" title="What are you negotiating?" sub="Pick one. You can change it later." />
            <div className="grid grid-cols-2 gap-3">
              {KIND_TILES.map((tile) => {
                const meta = KIND_META[tile.kind];
                const Icon = meta.icon;
                return (
                  <button
                    key={tile.kind}
                    type="button"
                    aria-pressed={state.draft.kind === tile.kind}
                    onClick={() => chooseKind(tile.kind)}
                    className="option min-h-[148px] flex-col items-start justify-between gap-6 !p-4 sm:!p-5"
                  >
                    <span className="grid h-11 w-11 place-items-center rounded-[14px] bg-hold-tint text-hold-text" aria-hidden>
                      <Icon size={22} strokeWidth={1.75} />
                    </span>
                    <span className="grid gap-0.5">
                      <span className="text-[17px] font-semibold tracking-[-0.015em]">{tile.title}</span>
                      <span className="text-[13px] font-normal text-muted">{meta.hint}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {step === 1 && (
          <section aria-labelledby="q-role" className="grid gap-6">
            <StepHeader step={1} id="q-role" title="Who will you be speaking with?" />
            <div className="grid gap-2.5" role="radiogroup" aria-labelledby="q-role">
              {COUNTERPART_ROLES[kind]!.map((role) => (
                <button key={role} type="button" role="radio" aria-checked={state.draft.counterpartRole === role} className="option" onClick={() => update({ counterpartRole: role })}>
                  {role}
                </button>
              ))}
            </div>
            {salary && (
              <label className="grid gap-2">
                <span className="text-[15px] font-semibold">
                  What do you do? <span className="font-normal text-muted">(optional)</span>
                </span>
                <input className="input" maxLength={120} placeholder="Backend engineer" value={state.draft.userRole ?? ''} onChange={(e) => update({ userRole: e.target.value || undefined })} />
              </label>
            )}
            <ContinueButton onClick={() => go(2)} />
          </section>
        )}

        {step === 2 && (
          <section className="grid gap-6">
            <StepHeader step={2} title={CURRENT_LABEL[kind].label} />
            {kind === 'bill' && (
              <div className="grid grid-cols-2 gap-2.5" role="radiogroup" aria-label="How often">
                {(['month', 'one_time'] as const).map((p) => (
                  <button key={p} type="button" role="radio" aria-checked={period === p} className="option" onClick={() => update({ period: p })}>
                    {p === 'month' ? 'Every month' : 'One-time'}
                  </button>
                ))}
              </div>
            )}
            <MoneyField label="Amount in US dollars" hint={CURRENT_LABEL[kind].hint} valueMinor={state.draft.currentMinor} period={period} salaryScale={salary} onChange={(v) => update({ currentMinor: v })} autoFocus />
            {salary && (
              <fieldset className="m-0 grid gap-2 border-0 p-0">
                <legend className="mb-2 text-[15px] font-semibold">Before or after tax?</legend>
                <div className="grid grid-cols-3 gap-2">
                  {(['gross', 'net', 'unspecified'] as MoneyBasis[]).map((b) => (
                    <button key={b} type="button" aria-pressed={state.draft.moneyBasis === b} className="option option-center !min-h-12 !px-3 text-[14px]" onClick={() => update({ moneyBasis: b })}>
                      {b === 'gross' ? 'Before tax' : b === 'net' ? 'After tax' : 'Not sure'}
                    </button>
                  ))}
                </div>
              </fieldset>
            )}
            <ErrorNote error={error} />
            <ContinueButton onClick={() => continueFromAmounts('current')} />
          </section>
        )}

        {step === 3 && (
          <section className="grid gap-6">
            <StepHeader step={3} title={TARGET_LABEL[kind]} sub="Aim for the number you can explain. The counterpart never sees it." />
            <MoneyField label="Your target in US dollars" valueMinor={state.draft.targetMinor} period={period} salaryScale={salary} onChange={(v) => update({ targetMinor: v })} autoFocus />
            {state.draft.currentMinor && (
              <div className="grid gap-2">
                <span className="label">Quick targets</span>
                <div className="flex flex-wrap gap-2" aria-label="Quick targets">
                  {(objective === 'maximize' ? [1_000, 1_500, 2_000] : [-500, -1_000]).map((bp) => {
                    const candidate = applyMoneyPercent({ amountMinor: state.draft.currentMinor!, currency: 'USD', period, basis: state.draft.moneyBasis ?? 'unspecified' }, bp);
                    const active = state.draft.targetMinor === candidate.value.amountMinor;
                    return (
                      <button
                        key={bp}
                        type="button"
                        className={`chip min-h-9 ${active ? '!bg-hold !text-white !shadow-none' : ''}`}
                        aria-pressed={active}
                        onClick={() => update({ targetMinor: candidate.value.amountMinor })}
                        title={candidate.formula}
                      >
                        <span className="font-semibold">
                          {bp > 0 ? '+' : '−'}
                          {Math.abs(bp) / 100}%
                        </span>
                        <span className="opacity-70">{formatMoney(candidate.value.amountMinor, period)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            <ErrorNote error={error} />
            <ContinueButton onClick={() => continueFromAmounts('target')} />
          </section>
        )}

        {step === 4 && (
          <section className="grid gap-6">
            <StepHeader
              step={4}
              title="What range have you seen for this?"
              sub={objective === 'maximize' ? 'The high end becomes the ceiling of the simulation. It is your range, not a promise of what anyone pays.' : 'The low end becomes the floor of the simulation. It is your range, not a market estimate.'}
            />
            {!state.marketUnknown && (
              <div className="grid gap-4 sm:grid-cols-2">
                <MoneyField label="Low end" size="md" valueMinor={state.draft.marketLowMinor} period={period} salaryScale={salary} onChange={(v) => update({ marketLowMinor: v })} />
                <MoneyField label="High end" size="md" valueMinor={state.draft.marketHighMinor} period={period} salaryScale={salary} onChange={(v) => update({ marketHighMinor: v })} />
              </div>
            )}
            <button
              type="button"
              className="option"
              aria-pressed={state.marketUnknown}
              onClick={() => update({ marketLowMinor: undefined, marketHighMinor: undefined, rangeSource: undefined }, { marketUnknown: !state.marketUnknown, practiceRangeConfirmed: false })}
            >
              I don’t know the range
            </button>
            {state.marketUnknown && practiceRange && (
              <div className="card pop-in grid gap-4 p-5">
                <span className="badge w-fit">Practice assumption — not a market estimate</span>
                <p className="m-0 text-[16px] leading-7">
                  Practise between <span className="num font-semibold">{formatMoney(practiceRange.lowMinor, period)}</span> and{' '}
                  <span className="num font-semibold">{formatMoney(practiceRange.highMinor, period)}</span>, your current amount and your target.
                </p>
                <label className="flex cursor-pointer items-start gap-3 rounded-[14px] bg-paper-subtle p-3 text-[15px] leading-6 shadow-[inset_0_0_0_1px_var(--line)]">
                  <input
                    type="checkbox"
                    className="mt-1 h-5 w-5 shrink-0"
                    checked={state.practiceRangeConfirmed}
                    onChange={(e) =>
                      e.target.checked
                        ? update({ marketLowMinor: practiceRange.lowMinor, marketHighMinor: practiceRange.highMinor, rangeSource: 'practice_assumption' }, { practiceRangeConfirmed: true })
                        : update({ marketLowMinor: undefined, marketHighMinor: undefined, rangeSource: undefined }, { practiceRangeConfirmed: false })
                    }
                  />
                  Use these practice bounds, labelled as an assumption in the round and the debrief.
                </label>
                <a href="/example" className="text-[14px]">
                  Or open the example debrief instead
                </a>
              </div>
            )}
            <ErrorNote error={error} />
            <ContinueButton onClick={continueFromRange} />
          </section>
        )}

        {step === 5 && (
          <section className="grid gap-6">
            <StepHeader step={5} title="What response worries you most?" sub="Optional. It shapes the objections, never the numbers." />
            <textarea className="input min-h-[104px]" maxLength={500} placeholder="They will say the budget is frozen." value={state.draft.fear ?? ''} onChange={(e) => update({ fear: e.target.value })} aria-label="The response that worries you" />
            <div className="grid gap-4 sm:grid-cols-[220px_minmax(0,1fr)]">
              <label className="grid content-start gap-2">
                <span className="text-[15px] font-semibold">
                  When is it? <span className="font-normal text-muted">(optional)</span>
                </span>
                <input type="date" className="input" value={state.draft.conversationDate ?? ''} onChange={(e) => update({ conversationDate: e.target.value || null })} />
              </label>
              <label className="grid content-start gap-2">
                <span className="text-[15px] font-semibold">
                  Anything else? <span className="font-normal text-muted">(optional)</span>
                </span>
                <textarea className="input min-h-[48px]" rows={1} maxLength={4000} value={state.draft.description ?? ''} onChange={(e) => update({ description: e.target.value })} placeholder="Context that helps the round" />
              </label>
            </div>
            <ContinueButton onClick={() => go(6)} />
          </section>
        )}

        {step === 6 && (
          <section className="grid gap-6">
            <StepHeader step={6} title="One thing to keep in mind" />
            <div className="on-violet relative grid gap-4 overflow-hidden rounded-[28px] p-6 sm:p-8">
              <div className="flex items-center gap-3">
                <CoachMark size={44} idle />
                <div className="leading-tight">
                  <div className="text-[15px] font-semibold">Alex</div>
                  <div className="text-[12.5px] text-white/70">Coach note</div>
                </div>
              </div>
              <p className="m-0 text-[clamp(24px,3.4vw,30px)] font-bold leading-[1.15] tracking-[-0.03em] text-white">{COACH_NOTES[kind]!.big}</p>
              <p className="m-0 text-[15px] leading-6 text-white/80">{COACH_NOTES[kind]!.sub}</p>
            </div>
            <ErrorNote error={error} />
            <ContinueButton onClick={finish} />
          </section>
        )}
      </StepTransition>
    </div>
  );
}
