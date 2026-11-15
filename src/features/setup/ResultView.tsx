'use client';

import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { objectiveForKind, type StandardKind } from '@/contracts/domain';
import { formatMoney, getQuizPreview, periodLabel } from '@/domain/money';
import { OfferBar } from '@/components/holdline/OfferBar';
import { ScreenSkeleton } from '@/components/ui/skeleton';
import { useDraft } from './useDraft';

export function ResultView() {
  const [state] = useDraft();
  if (!state) return <ScreenSkeleton variant="report" />;
  const d = state.draft;
  if (!d.kind || d.kind === 'custom' || !d.currentMinor || !d.targetMinor || !d.period) {
    return (
      <div className="mx-auto grid max-w-[560px] justify-items-start gap-5">
        <p className="eyebrow m-0">Your round</p>
        <h1 className="h-title m-0">Nothing to show yet</h1>
        <p className="m-0 text-muted">Start with the coach or the quick form, then come back here.</p>
        <div className="flex flex-wrap gap-3">
          <Link href="/intake" className="btn btn-primary">
            Talk to the coach
          </Link>
          <Link href="/quiz" className="btn btn-secondary">
            Use the quick form
          </Link>
        </div>
      </div>
    );
  }
  const kind = d.kind as StandardKind;
  const objective = objectiveForKind(kind);
  const preview = getQuizPreview({ kind, currentMinor: d.currentMinor, targetMinor: d.targetMinor, period: d.period });
  const missing = state.intake?.missingFields.filter((f) => f !== 'avatarId') ?? [];
  const title = kind === 'raise' ? 'A raise' : kind === 'offer' ? 'A job offer' : kind === 'rent' ? 'Rent' : 'A bill';
  return (
    <div className="mx-auto grid max-w-[640px] gap-6">
      <header className="rise grid gap-3">
        <p className="eyebrow m-0">Your round is ready</p>
        <h1 className="h-title m-0">
          {title}, with your {(d.counterpartRole ?? 'counterpart').toLowerCase()}
        </h1>
      </header>

      <section className="on-violet rise relative grid gap-3 overflow-hidden rounded-[28px] p-6 sm:p-8" style={{ ['--delay' as string]: '80ms' }} aria-label="Gap to your own target">
        <div className="pointer-events-none absolute -right-10 -top-16 h-56 w-56 rounded-full bg-violet-500/50 blur-2xl" aria-hidden />
        <div className="relative text-[12px] font-medium uppercase tracking-[0.08em] text-white/75">Gap to your own target</div>
        <div className="figure-xl relative text-white">{formatMoney(preview.gapMinor, d.period)}</div>
        <p className="relative m-0 text-[14px] leading-6 text-white/80">
          {objective === 'maximize'
            ? `${formatMoney(d.targetMinor, d.period)} − ${formatMoney(d.currentMinor, d.period)}`
            : `${formatMoney(d.currentMinor, d.period)} − ${formatMoney(d.targetMinor, d.period)}`}
          {preview.annualizedGapMinor !== null && d.period === 'month' && ` · ${formatMoney(preview.annualizedGapMinor)} per year (× 12)`}
          {d.period === 'one_time' && ' · one-time'}
        </p>
        <p className="relative m-0 text-[13.5px] leading-5 text-white/70">This is the distance to the target you set, not a proven loss. The round measures what you actually reach.</p>
      </section>

      <div className="card p-5 sm:p-6">
        <OfferBar objective={objective} period={d.period} currentMinor={d.currentMinor} offerMinor={null} targetMinor={d.targetMinor} />
        {d.marketLowMinor && d.marketHighMinor && (
          <dl className="m-0 mt-6 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-3 border-t border-line pt-5 text-[14px] leading-5">
            <dt className="text-muted">{d.rangeSource === 'practice_assumption' ? 'Practice bounds' : 'Your range'}</dt>
            <dd className="m-0 text-right font-medium">
              <span className="num">{formatMoney(d.marketLowMinor, d.period)}</span> – <span className="num">{formatMoney(d.marketHighMinor, d.period)}</span>
            </dd>
            {d.rangeSource === 'practice_assumption' && (
              <>
                <dt className="text-muted">Label</dt>
                <dd className="m-0 text-right">Practice assumption — not a market estimate</dd>
              </>
            )}
            <dt className="text-muted">Basis</dt>
            <dd className="m-0 text-right">
              {kind === 'raise' || kind === 'offer' ? `${d.moneyBasis === 'gross' ? 'Before tax' : d.moneyBasis === 'net' ? 'After tax' : 'Not specified'} · ` : ''}
              {periodLabel(d.period)}
            </dd>
            <dt className="text-muted">Their limit</dt>
            <dd className="m-0 text-right">
              <span className="badge">Hidden until the debrief</span>
            </dd>
          </dl>
        )}
      </div>

      <div className="funnel-actions">
        {missing.length > 0 ? (
          <div className="card grid gap-3 p-5">
            <p className="m-0">A few details are still missing: {missing.join(', ')}.</p>
            <Link href={state.intake ? `/intake/${state.intake.intakeId}` : '/quiz'} className="btn btn-primary">
              Complete the profile
            </Link>
          </div>
        ) : (
          <Link href="/opponents" className="btn btn-primary btn-xl !max-w-none sm:!w-full">
            Choose your counterpart <ArrowRight size={18} strokeWidth={2} className="arrow" aria-hidden />
          </Link>
        )}
        <p className="m-0 text-center text-[12.5px] leading-4 text-muted">The round is free.</p>
      </div>
    </div>
  );
}
