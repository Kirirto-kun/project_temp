import { AudioLines, Gauge, Sparkles } from 'lucide-react';
import type { Debrief } from '@/contracts/voice';
import { TENSION_FORMULA_V1 } from '@/contracts/voice';
import { formatMoney } from '@/domain/money';
import { OfferBar } from '@/components/holdline/OfferBar';
import { TurnLedger } from '@/components/holdline/TurnLedger';
import { WindowCard } from '@/components/holdline/WindowCard';

const RING = 2 * Math.PI * 42;

function ScoreRing({ value }: { value: number }) {
  const offset = RING * (1 - Math.max(0, Math.min(100, value)) / 100);
  return (
    <div className="relative grid h-[104px] w-[104px] shrink-0 place-items-center" aria-hidden>
      <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90">
        <circle cx="50" cy="50" r="42" fill="none" stroke="var(--sunken)" strokeWidth="8" />
        <circle cx="50" cy="50" r="42" fill="none" stroke="var(--hold)" strokeWidth="8" strokeLinecap="round" strokeDasharray={RING} className="ring-draw" style={{ strokeDashoffset: offset, ['--ring-from' as string]: RING }} />
      </svg>
      <span className="num text-[28px] font-extrabold tracking-[-0.04em]">{value}</span>
    </div>
  );
}

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
  const cards = [
    { icon: AudioLines, title: 'Measurements', text: 'Pace (words per minute), pauses, the pause before your first amount, filler words (um, uh, er, erm), pitch in Hz and a loudness dip on the amount.' },
    { icon: Gauge, title: 'Index', text: null },
    { icon: Sparkles, title: 'Model assessment', text: 'Persuasion score, written by a language model from the rubric: argument, number with a reason, no apologising, no concession without a reason.' },
  ];
  return (
    <section className="grid gap-5" aria-labelledby="voice-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-2">
          <p className="eyebrow m-0">Delivery</p>
          <h2 id="voice-title" className="m-0 text-[28px] font-bold leading-[1.1] tracking-[-0.035em]">
            Voice
          </h2>
        </div>
        <span className={`badge ${v.status === 'ready' ? 'badge-won' : v.status === 'pending' ? 'badge-hold' : ''}`}>
          {v.status === 'pending' && <span className="live-dot" aria-hidden />}
          {v.status}
        </span>
      </div>
      <p className="callout m-0" role={v.status === 'pending' ? 'status' : undefined}>
        {status}
      </p>
      <dl className="m-0 grid gap-3 sm:grid-cols-3">
        {cards.map(({ icon: Icon, title, text }) => (
          <div key={title} className="card grid content-start gap-2 p-5">
            <dt className="flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-hold-tint text-hold-text">
                <Icon size={16} strokeWidth={2} aria-hidden />
              </span>
              <span className="label text-ink-soft">{title}</span>
            </dt>
            <dd className="m-0 text-[14px] leading-6 text-ink-soft">
              {text ?? (
                <>
                  Tension index v1, only with a valid calibration. It shows deviation from your own normal, not an emotion.
                  <code className="mono mt-3 block whitespace-pre-wrap break-words rounded-[12px] bg-sunken p-3 text-[11.5px] leading-[1.6] text-ink-soft">{TENSION_FORMULA_V1}</code>
                </>
              )}
            </dd>
          </div>
        ))}
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
    <div className="grid gap-12">
      <header className="rise grid gap-4">
        <p className="eyebrow m-0">{example ? 'Example · synthetic round' : 'Debrief'}</p>
        <h1 className="m-0 max-w-[22ch] text-[clamp(32px,5vw,56px)] font-extrabold leading-[1.02] tracking-[-0.045em] [text-wrap:balance]">{debrief.summary}</h1>
        {debrief.rangeSource === 'practice_assumption' && <p className="m-0 text-[14px] text-muted">Practice assumption — the limit came from your own current amount and target, not from market data.</p>}
        {debrief.inputMode === 'example' && !example && <p className="m-0 text-[14px] text-muted">Example scenario, not your personal numbers.</p>}
      </header>

      <div className="grid gap-5 min-[900px]:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <WindowCard file="debrief.log" step={debrief.outcome} className="rise" style={{ ['--delay' as string]: '80ms' }}>
          {agreed !== null && debrief.leftOnTableMinor !== null ? (
            <div className="grid gap-3">
              <div className="label">Left on the table</div>
              <div className={`text-[clamp(40px,5.6vw,64px)] font-extrabold leading-[0.95] tracking-[-0.05em] [font-variant-numeric:tabular-nums] ${debrief.leftOnTableMinor > 0 ? 'text-gap' : 'text-won'}`}>
                {formatMoney(debrief.leftOnTableMinor, period)}
              </div>
              <p className="m-0 text-[14px] leading-6 text-muted">
                {debrief.objective === 'maximize'
                  ? `${formatMoney(debrief.reservationAmountMinor, period)} ${limitWord} − ${formatMoney(agreed, period)} agreed`
                  : `${formatMoney(agreed, period)} agreed − ${formatMoney(debrief.reservationAmountMinor, period)} ${limitWord}`}
                , against your range.
                {debrief.leftOnTableAnnualizedMinor !== null && period === 'month' && ` About ${formatMoney(debrief.leftOnTableAnnualizedMinor)} per year (× 12).`}
              </p>
              {debrief.gainMinor !== null && debrief.gainMinor > 0 && (
                <p className="m-0 flex flex-wrap items-center gap-2 text-[14px]">
                  <span className="badge badge-won h-7 px-2.5 text-[12px]">+{formatMoney(debrief.gainMinor, period)}</span> gained in the simulation from where you started.
                </p>
              )}
            </div>
          ) : (
            <div className="grid gap-3">
              <div className="label">No agreement</div>
              <p className="m-0 text-[17px] leading-7">
                There is no deal to compare, so nothing is counted as earned or lost.
                {debrief.finalOfferMinor !== null && ` The last offer on the table was ${formatMoney(debrief.finalOfferMinor, period)}.`}
              </p>
            </div>
          )}
        </WindowCard>
        <div className="card rise p-5 sm:p-6" style={{ ['--delay' as string]: '140ms' }}>
          <OfferBar
            objective={debrief.objective}
            period={period}
            currentMinor={debrief.initialOfferMinor}
            offerMinor={debrief.finalOfferMinor}
            targetMinor={debrief.targetMinor}
            reservationAmountMinor={debrief.reservationAmountMinor}
            agreedMinor={agreed}
          />
          <p className="m-0 mt-4 border-t border-line pt-4 text-[13px] leading-5 text-muted">
            The {limitWord} is a scenario setting from the range you entered. It says nothing about what a real {debrief.counterpartRole.toLowerCase()} would pay.
          </p>
        </div>
      </div>

      {actions}

      <section className="grid gap-5" aria-labelledby="ledger-title">
        <div className="grid gap-2">
          <p className="eyebrow m-0">Move by move</p>
          <h2 id="ledger-title" className="m-0 text-[28px] font-bold leading-[1.1] tracking-[-0.035em]">
            Where the conversation turned
          </h2>
        </div>
        <TurnLedger rows={debrief.rows} period={period} />
      </section>

      {debrief.persuasionScore && (
        <section className="card flex flex-wrap items-center gap-6 p-6" aria-labelledby="score-title">
          <ScoreRing value={debrief.persuasionScore.value} />
          <div className="grid min-w-[240px] flex-1 gap-2">
            <div id="score-title" className="label">
              Model assessment · persuasion
            </div>
            <div className="num text-[26px] font-bold tracking-[-0.03em]">{debrief.persuasionScore.value} / 100</div>
            <p className="m-0 text-[14.5px] leading-6">{debrief.persuasionScore.rationale}</p>
            <p className="m-0 text-[12.5px] text-muted">Written by a language model from a fixed rubric. Not a measurement.</p>
          </div>
        </section>
      )}

      <VoiceSection debrief={debrief} />
    </div>
  );
}
