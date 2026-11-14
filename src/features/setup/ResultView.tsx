'use client';

import Link from 'next/link';
import { objectiveForKind, type StandardKind } from '@/contracts/domain';
import { formatMoney, getQuizPreview, periodLabel } from '@/domain/money';
import { OfferBar } from '@/components/holdline/OfferBar';
import { useDraft } from './useDraft';

export function ResultView() {
  const [state] = useDraft();
  if (!state) return <p className="text-muted">Loading…</p>;
  const d = state.draft;
  if (!d.kind || d.kind === 'custom' || !d.currentMinor || !d.targetMinor || !d.period) {
    return (
      <div className="grid gap-4">
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
  return (
    <div className="mx-auto grid max-w-[560px] gap-6">
      <div>
        <p className="eyebrow m-0">Your round is ready</p>
        <h1 className="h-title m-0 mt-2">
          {kind === 'raise' ? 'A raise' : kind === 'offer' ? 'A job offer' : kind === 'rent' ? 'Rent' : 'A bill'}, with your {(d.counterpartRole ?? 'counterpart').toLowerCase()}
        </h1>
      </div>
      <OfferBar objective={objective} period={d.period} currentMinor={d.currentMinor} offerMinor={null} targetMinor={d.targetMinor} />
      <div className="card grid gap-2 p-4">
        <div className="label">Gap to your own target</div>
        <div className="figure-xl text-gap">{formatMoney(preview.gapMinor, d.period)}</div>
        <p className="m-0 text-[14px] leading-5 text-muted">
          {objective === 'maximize'
            ? `${formatMoney(d.targetMinor, d.period)} − ${formatMoney(d.currentMinor, d.period)}`
            : `${formatMoney(d.currentMinor, d.period)} − ${formatMoney(d.targetMinor, d.period)}`}
          {preview.annualizedGapMinor !== null && d.period === 'month' && ` · ${formatMoney(preview.annualizedGapMinor)} per year (× 12)`}
          {d.period === 'one_time' && ' · one-time'}
        </p>
        <p className="m-0 text-[14px] leading-5 text-muted">This is the distance to the target you set, not a proven loss. The round measures what you actually reach.</p>
      </div>
      {d.marketLowMinor && d.marketHighMinor && (
        <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2 text-[14px] leading-5">
          <dt className="text-muted">{d.rangeSource === 'practice_assumption' ? 'Practice bounds' : 'Your range'}</dt>
          <dd className="m-0 text-right">
            <span className="num">{formatMoney(d.marketLowMinor, d.period)}</span> – <span className="num">{formatMoney(d.marketHighMinor, d.period)}</span>
          </dd>
          {d.rangeSource === 'practice_assumption' && (
            <>
              <dt className="text-muted">Label</dt>
              <dd className="m-0 text-right">Practice assumption — not a market estimate</dd>
            </>
          )}
          <dt className="text-muted">Basis</dt>
          <dd className="m-0 text-right">{d.moneyBasis === 'gross' ? 'Before tax' : d.moneyBasis === 'net' ? 'After tax' : 'Not specified'} · {periodLabel(d.period)}</dd>
          <dt className="text-muted">Their limit</dt>
          <dd className="m-0 text-right">Hidden until the debrief</dd>
        </dl>
      )}
      {missing.length > 0 ? (
        <div className="card grid gap-3 p-4">
          <p className="m-0">A few details are still missing: {missing.join(', ')}.</p>
          <Link href={state.intake ? `/intake/${state.intake.intakeId}` : '/quiz'} className="btn btn-primary">
            Complete the profile
          </Link>
        </div>
      ) : (
        <Link href="/opponents" className="btn btn-primary btn-xl">
          Choose your counterpart
        </Link>
      )}
      <p className="m-0 text-center text-[12px] leading-4 text-muted">The round is free.</p>
    </div>
  );
}
