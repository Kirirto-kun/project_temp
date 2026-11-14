'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { allowedPeriodsForKind, objectiveForKind, type MoneyBasis, type Period, type StandardKind } from '@/contracts/domain';
import { applyMoneyPercent, suggestPracticeRange, validatePracticeDraft } from '@/domain/intake-handoff';
import { formatMoney } from '@/domain/money';
import type { DraftState } from '@/client/storage/draft';
import { useDraft } from '@/features/setup/useDraft';
import { COACH_NOTES, COUNTERPART_ROLES, KIND_TILES } from '@/content/copy';
import { FunnelProgress } from './Progress';
import { MoneyField } from './MoneyField';

const TOTAL = 7;

function kindOf(state: DraftState): StandardKind {
  const k = state.draft.kind;
  return k === 'offer' || k === 'rent' || k === 'bill' ? k : 'raise';
}

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

export function QuizFlow() {
  const router = useRouter();
  const [state, setDraft] = useDraft();
  const [error, setError] = useState<string | null>(null);
  const setState = (fn: (s: DraftState | null) => DraftState | null) => setDraft((current) => fn(current) ?? current);

  const kind = state ? kindOf(state) : 'raise';
  const period: Period = state?.draft.period ?? allowedPeriodsForKind(kind)[0]!;
  const objective = objectiveForKind(kind);

  const practiceRange = state?.draft.currentMinor && state.draft.targetMinor ? suggestPracticeRange(state.draft.currentMinor, state.draft.targetMinor, objective) : null;

  if (!state) return <p className="text-muted">Loading…</p>;

  const step = Math.min(state.step, TOTAL - 1);
  const update = (patch: Partial<DraftState['draft']>, extra: Partial<DraftState> = {}) => {
    setError(null);
    setState((s) => (s ? { ...s, ...extra, draft: { ...s.draft, ...patch } } : s));
  };
  const go = (next: number) => {
    setError(null);
    setState((s) => (s ? { ...s, step: next } : s));
    if (typeof window !== 'undefined') window.scrollTo({ top: 0 });
  };
  const back = step > 0 ? () => go(step - 1) : undefined;

  function chooseKind(next: StandardKind) {
    const periods = allowedPeriodsForKind(next);
    setState((s) =>
      s
        ? {
            ...s,
            step: 1,
            marketUnknown: false,
            practiceRangeConfirmed: false,
            avatarId: null,
            draft: {
              ...s.draft,
              kind: next,
              period: periods[0],
              counterpartRole: COUNTERPART_ROLES[next]![0],
              currency: 'USD',
              inputMode: 'personal',
              moneyBasis: s.draft.moneyBasis ?? 'unspecified',
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
    router.push('/result');
  }

  return (
    <div className="mx-auto flex max-w-[560px] flex-col gap-6">
      <FunnelProgress step={step + 1} total={TOTAL} onBack={back} />

      {step === 0 && (
        <section aria-labelledby="q-kind" className="grid gap-4">
          <p className="eyebrow m-0">Holdline</p>
          <h1 id="q-kind" className="h-title m-0">
            What are you negotiating?
          </h1>
          <p className="m-0 text-[14px] text-muted">Pick one. You can change it later.</p>
          <div className="grid grid-cols-2 gap-2">
            {KIND_TILES.map((tile) => (
              <button
                key={tile.kind}
                type="button"
                aria-pressed={state.draft.kind === tile.kind}
                onClick={() => chooseKind(tile.kind)}
                className="option flex min-h-[112px] flex-col items-start justify-between gap-4 p-3 text-[14px] font-semibold"
              >
                <span className="flex w-full flex-col gap-1" aria-hidden>
                  <span className="block h-1.5 rounded-[2px] bg-ink" style={{ width: `${tile.bars[0]}%` }} />
                  <span className="block h-1.5 rounded-[2px] bg-hold" style={{ width: `${tile.bars[1]}%` }} />
                </span>
                {tile.title}
              </button>
            ))}
          </div>
        </section>
      )}

      {step === 1 && (
        <section aria-labelledby="q-role" className="grid gap-4">
          <h1 id="q-role" className="h-title m-0">
            Who will you be speaking with?
          </h1>
          <div className="grid gap-2" role="radiogroup" aria-labelledby="q-role">
            {COUNTERPART_ROLES[kind]!.map((role) => (
              <button key={role} type="button" role="radio" aria-checked={state.draft.counterpartRole === role} className="option" onClick={() => update({ counterpartRole: role })}>
                {role}
              </button>
            ))}
          </div>
          {(kind === 'raise' || kind === 'offer') && (
            <label className="grid gap-2">
              <span className="text-[15px] font-semibold">What do you do? (optional)</span>
              <input className="input" maxLength={120} placeholder="Backend engineer" value={state.draft.userRole ?? ''} onChange={(e) => update({ userRole: e.target.value || undefined })} />
            </label>
          )}
          <button type="button" className="btn btn-primary btn-xl" onClick={() => go(2)}>
            Continue
          </button>
        </section>
      )}

      {step === 2 && (
        <section className="grid gap-4">
          <h1 className="h-title m-0">{CURRENT_LABEL[kind].label}</h1>
          {kind === 'bill' && (
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="How often">
              {(['month', 'one_time'] as const).map((p) => (
                <button key={p} type="button" role="radio" aria-checked={period === p} className="option" onClick={() => update({ period: p })}>
                  {p === 'month' ? 'Every month' : 'One-time'}
                </button>
              ))}
            </div>
          )}
          <MoneyField label="Amount in US dollars" hint={CURRENT_LABEL[kind].hint} valueMinor={state.draft.currentMinor} period={period} salaryScale={kind === 'raise' || kind === 'offer'} onChange={(v) => update({ currentMinor: v })} autoFocus />
          {(kind === 'raise' || kind === 'offer') && (
            <fieldset className="m-0 grid gap-2 border-0 p-0">
              <legend className="mb-2 text-[15px] font-semibold">Before or after tax?</legend>
              <div className="grid grid-cols-3 gap-2">
                {(['gross', 'net', 'unspecified'] as MoneyBasis[]).map((b) => (
                  <button key={b} type="button" aria-pressed={state.draft.moneyBasis === b} className="option justify-center" onClick={() => update({ moneyBasis: b })}>
                    {b === 'gross' ? 'Before tax' : b === 'net' ? 'After tax' : 'Not sure'}
                  </button>
                ))}
              </div>
            </fieldset>
          )}
          {error && <p className="m-0 text-gap" role="alert">{error}</p>}
          <button type="button" className="btn btn-primary btn-xl" onClick={() => continueFromAmounts('current')}>
            Continue
          </button>
        </section>
      )}

      {step === 3 && (
        <section className="grid gap-4">
          <h1 className="h-title m-0">{TARGET_LABEL[kind]}</h1>
          <MoneyField label="Your target in US dollars" valueMinor={state.draft.targetMinor} period={period} salaryScale={kind === 'raise' || kind === 'offer'} onChange={(v) => update({ targetMinor: v })} autoFocus />
          {state.draft.currentMinor && (
            <div className="flex flex-wrap gap-2" aria-label="Quick targets">
              {(objective === 'maximize' ? [1_000, 1_500, 2_000] : [-500, -1_000]).map((bp) => {
                const candidate = applyMoneyPercent({ amountMinor: state.draft.currentMinor!, currency: 'USD', period, basis: state.draft.moneyBasis ?? 'unspecified' }, bp);
                return (
                  <button key={bp} type="button" className="chip cursor-pointer bg-raised" onClick={() => update({ targetMinor: candidate.value.amountMinor })} title={candidate.formula}>
                    {bp > 0 ? '+' : '−'}
                    {Math.abs(bp) / 100}% = {formatMoney(candidate.value.amountMinor, period)}
                  </button>
                );
              })}
            </div>
          )}
          {error && <p className="m-0 text-gap" role="alert">{error}</p>}
          <button type="button" className="btn btn-primary btn-xl" onClick={() => continueFromAmounts('target')}>
            Continue
          </button>
        </section>
      )}

      {step === 4 && (
        <section className="grid gap-4">
          <h1 className="h-title m-0">What range have you seen for this?</h1>
          <p className="m-0 text-[14px] leading-5 text-muted">
            {objective === 'maximize' ? 'The high end becomes the ceiling of the simulation. It is your range, not a promise of what anyone pays.' : 'The low end becomes the floor of the simulation. It is your range, not a market estimate.'}
          </p>
          {!state.marketUnknown && (
            <>
              <MoneyField label="Low end" valueMinor={state.draft.marketLowMinor} period={period} salaryScale={kind === 'raise' || kind === 'offer'} onChange={(v) => update({ marketLowMinor: v })} />
              <MoneyField label="High end" valueMinor={state.draft.marketHighMinor} period={period} salaryScale={kind === 'raise' || kind === 'offer'} onChange={(v) => update({ marketHighMinor: v })} />
            </>
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
            <div className="card grid gap-3 p-4">
              <div className="label">Practice assumption — not a market estimate</div>
              <p className="m-0 text-[15px]">
                Practise between <span className="num font-semibold">{formatMoney(practiceRange.lowMinor, period)}</span> and{' '}
                <span className="num font-semibold">{formatMoney(practiceRange.highMinor, period)}</span>, your current amount and your target.
              </p>
              <label className="flex items-start gap-3 text-[15px]">
                <input
                  type="checkbox"
                  className="mt-1 h-5 w-5"
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
          {error && <p className="m-0 text-gap" role="alert">{error}</p>}
          <button type="button" className="btn btn-primary btn-xl" onClick={continueFromRange}>
            Continue
          </button>
        </section>
      )}

      {step === 5 && (
        <section className="grid gap-4">
          <h1 className="h-title m-0">What response worries you most?</h1>
          <p className="m-0 text-[14px] text-muted">Optional. It shapes the objections, never the numbers.</p>
          <textarea className="input min-h-[96px]" maxLength={500} placeholder="They will say the budget is frozen." value={state.draft.fear ?? ''} onChange={(e) => update({ fear: e.target.value })} />
          <label className="grid gap-2">
            <span className="text-[15px] font-semibold">When is the conversation? (optional)</span>
            <input type="date" className="input max-w-[220px]" value={state.draft.conversationDate ?? ''} onChange={(e) => update({ conversationDate: e.target.value || null })} />
          </label>
          <label className="grid gap-2">
            <span className="text-[15px] font-semibold">Anything else about the situation? (optional)</span>
            <textarea className="input min-h-[72px]" maxLength={4000} value={state.draft.description ?? ''} onChange={(e) => update({ description: e.target.value })} />
          </label>
          <button type="button" className="btn btn-primary btn-xl" onClick={() => go(6)}>
            Continue
          </button>
        </section>
      )}

      {step === 6 && (
        <section className="grid gap-4">
          <div className="card grid gap-2 p-4">
            <div className="label">Coach note</div>
            <p className="m-0" style={{ font: '700 20px/26px var(--font-display)' }}>
              {COACH_NOTES[kind]!.big}
            </p>
            <p className="m-0 text-[14px] leading-5 text-muted">{COACH_NOTES[kind]!.sub}</p>
          </div>
          {error && <p className="m-0 text-gap" role="alert">{error}</p>}
          <button type="button" className="btn btn-primary btn-xl" onClick={finish}>
            Continue
          </button>
        </section>
      )}
    </div>
  );
}
