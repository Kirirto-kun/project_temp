import type { Debrief } from '@/contracts/voice';
import { TENSION_FORMULA_V1 } from '@/contracts/voice';
import { formatMoney } from '@/domain/money';
import { OfferBar } from '@/components/holdline/OfferBar';
import { TurnLedger } from '@/components/holdline/TurnLedger';
import { WindowCard } from '@/components/holdline/WindowCard';

function VoiceSection({ debrief }: { debrief: Debrief }) {
  const v = debrief.voice;
  const status =
    v.status === 'pending'
      ? 'Your voice is still being analysed. The money result above is final.'
      : v.status === 'failed'
        ? `Voice analysis failed${v.reason ? `: ${v.reason}` : '.'}`
        : v.status === 'unavailable'
          ? v.reason ?? 'No voice data for this round.'
          : v.reason ?? 'Measured against your calibration.';
  return (
    <section className="grid gap-3" aria-labelledby="voice-title">
      <h2 id="voice-title" className="m-0 text-[22px] font-semibold leading-7">
        Voice
      </h2>
      <p className="m-0 text-[14px] leading-5 text-muted" role={v.status === 'pending' ? 'status' : undefined}>
        {status}
      </p>
      <dl className="m-0 grid gap-2 text-[14px] leading-5">
        <div>
          <dt className="label">Measurements</dt>
          <dd className="m-0">Pace (words per minute), pauses, the pause before your first amount, filler words (um, uh, er, erm), pitch in Hz and a loudness dip on the amount.</dd>
        </div>
        <div>
          <dt className="label">Index</dt>
          <dd className="m-0">
            Tension index v1, only with a valid calibration. <span className="mono text-[12px]">{TENSION_FORMULA_V1}</span>. It shows deviation from your own normal, not an emotion.
          </dd>
        </div>
        <div>
          <dt className="label">Model assessment</dt>
          <dd className="m-0">Persuasion score, written by a language model from the rubric: argument, number with a reason, no apologising, no concession without a reason.</dd>
        </div>
      </dl>
    </section>
  );
}

/** Presentational debrief: money first, then the ledger, voice and the labelled model score. */
export function DebriefReport({ debrief, example = false, actions }: { debrief: Debrief; example?: boolean; actions?: React.ReactNode }) {
  const period = debrief.period;
  const agreed = debrief.agreedMinor;
  const limitWord = debrief.objective === 'maximize' ? 'ceiling' : 'floor';
  return (
    <div className="grid gap-8">
      <header className="grid gap-2">
        <p className="eyebrow m-0">{example ? 'Example · synthetic round' : 'Debrief'}</p>
        <h1 className="h-section m-0">{debrief.summary}</h1>
        {debrief.rangeSource === 'practice_assumption' && <p className="m-0 text-[14px] text-muted">Practice assumption — the limit came from your own current amount and target, not from market data.</p>}
        {debrief.inputMode === 'example' && !example && <p className="m-0 text-[14px] text-muted">Example scenario, not your personal numbers.</p>}
      </header>

      <div className="grid gap-6 min-[900px]:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <WindowCard file="debrief.log" step={debrief.outcome}>
          {agreed !== null && debrief.leftOnTableMinor !== null ? (
            <>
              <div className="label">Left on the table</div>
              <div className={`figure-xl mt-1 ${debrief.leftOnTableMinor > 0 ? 'text-gap' : 'text-won'}`}>{formatMoney(debrief.leftOnTableMinor, period)}</div>
              <p className="m-0 mt-2 text-[14px] leading-5 text-muted">
                {debrief.objective === 'maximize'
                  ? `${formatMoney(debrief.reservationAmountMinor, period)} ${limitWord} − ${formatMoney(agreed, period)} agreed`
                  : `${formatMoney(agreed, period)} agreed − ${formatMoney(debrief.reservationAmountMinor, period)} ${limitWord}`}
                , against your range.
                {debrief.leftOnTableAnnualizedMinor !== null && period === 'month' && ` About ${formatMoney(debrief.leftOnTableAnnualizedMinor)} per year (× 12).`}
              </p>
              {debrief.gainMinor !== null && debrief.gainMinor > 0 && (
                <p className="m-0 mt-2 text-[14px]">
                  <span className="num font-semibold text-won">+{formatMoney(debrief.gainMinor, period)}</span> gained in the simulation from where you started.
                </p>
              )}
            </>
          ) : (
            <>
              <div className="label">No agreement</div>
              <p className="m-0 mt-2 text-[15px] leading-6">
                There is no deal to compare, so nothing is counted as earned or lost.
                {debrief.finalOfferMinor !== null && ` The last offer on the table was ${formatMoney(debrief.finalOfferMinor, period)}.`}
              </p>
            </>
          )}
        </WindowCard>
        <div className="card p-4">
          <OfferBar
            objective={debrief.objective}
            period={period}
            currentMinor={debrief.initialOfferMinor}
            offerMinor={debrief.finalOfferMinor}
            targetMinor={debrief.targetMinor}
            reservationAmountMinor={debrief.reservationAmountMinor}
            agreedMinor={agreed}
          />
          <p className="m-0 mt-3 text-[13px] leading-[18px] text-muted">The {limitWord} is a scenario setting from the range you entered. It says nothing about what a real {debrief.counterpartRole.toLowerCase()} would pay.</p>
        </div>
      </div>

      {actions}

      <section className="grid gap-3" aria-labelledby="ledger-title">
        <h2 id="ledger-title" className="m-0 text-[22px] font-semibold leading-7">
          Where the conversation turned
        </h2>
        <TurnLedger rows={debrief.rows} period={period} />
      </section>

      {debrief.persuasionScore && (
        <section className="card grid gap-2 p-4" aria-labelledby="score-title">
          <div id="score-title" className="label">
            Model assessment · persuasion
          </div>
          <div className="num text-[32px] font-bold">{debrief.persuasionScore.value} / 100</div>
          <p className="m-0 text-[14px] leading-5">{debrief.persuasionScore.rationale}</p>
          <p className="m-0 text-[12px] text-muted">Written by a language model from a fixed rubric. Not a measurement.</p>
        </section>
      )}

      <VoiceSection debrief={debrief} />
    </div>
  );
}
