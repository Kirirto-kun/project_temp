import type { Objective, Period } from '@/contracts/domain';
import { formatMoney } from '@/domain/money';

interface Bar {
  key: 'limit' | 'target' | 'agreed' | 'table' | 'start';
  label: string;
  amountMinor: number;
}

/** Reading-order stagger with shrinking gaps, so the group lands as one wave. */
const DELAYS = [0, 60, 105, 135];

const FILL: Record<Bar['key'], string> = {
  limit: 'repeating-linear-gradient(-45deg, var(--ink) 0 6px, color-mix(in srgb, var(--ink) 78%, transparent) 6px 12px)',
  target: 'var(--hold)',
  agreed: 'var(--won)',
  table: 'var(--violet-300)',
  start: 'var(--line-strong)',
};

/**
 * The signature offer bar: horizontal bars on one scale. The scenario limit is shown only
 * when the caller has it (after the debrief); it is never reconstructed from hidden fields.
 * Bars reveal left to right with clip-path, a short stagger in reading order.
 */
export function OfferBar({
  objective,
  period,
  currentMinor,
  offerMinor,
  targetMinor,
  reservationAmountMinor,
  agreedMinor,
}: {
  objective: Objective;
  period: Period;
  currentMinor: number;
  offerMinor: number | null;
  targetMinor: number;
  reservationAmountMinor?: number | null;
  agreedMinor?: number | null;
}) {
  const bars: Bar[] = [];
  if (reservationAmountMinor !== undefined && reservationAmountMinor !== null) bars.push({ key: 'limit', label: objective === 'maximize' ? 'Scenario ceiling' : 'Scenario floor', amountMinor: reservationAmountMinor });
  bars.push({ key: 'target', label: 'Your target', amountMinor: targetMinor });
  if (agreedMinor !== undefined && agreedMinor !== null) bars.push({ key: 'agreed', label: 'Agreed', amountMinor: agreedMinor });
  else if (offerMinor !== null) bars.push({ key: 'table', label: 'On the table', amountMinor: offerMinor });
  bars.push({ key: 'start', label: objective === 'maximize' ? 'Where you started' : 'Starting price', amountMinor: currentMinor });

  const max = Math.max(...bars.map((b) => b.amountMinor)) * 1.04;
  const gap =
    reservationAmountMinor !== undefined && reservationAmountMinor !== null && agreedMinor !== undefined && agreedMinor !== null
      ? objective === 'maximize'
        ? Math.max(0, reservationAmountMinor - agreedMinor)
        : Math.max(0, agreedMinor - reservationAmountMinor)
      : 0;

  return (
    <figure className="m-0 flex flex-col gap-4" aria-label="Offer bar">
      {bars.map((bar, i) => {
        const width = (bar.amountMinor / max) * 100;
        const isAgreed = bar.key === 'agreed';
        const gapWidth = isAgreed && gap > 0 ? (gap / max) * 100 : 0;
        return (
          <div key={bar.key}>
            <div className="mb-1.5 flex items-baseline justify-between gap-3">
              <span className="label">{bar.label}</span>
              <span className="num text-[15px] font-semibold">{formatMoney(bar.amountMinor, period)}</span>
            </div>
            <div className="bar-reveal flex h-3 gap-[3px]" style={{ ['--delay' as string]: `${DELAYS[i] ?? 150}ms` }}>
              <div className="rounded-full" style={{ width: `${objective === 'minimize' && isAgreed ? width - gapWidth : width}%`, background: FILL[bar.key] }} />
              {gapWidth > 0 && <div className="rounded-full" style={{ width: `${gapWidth}%`, background: 'var(--gap)' }} aria-hidden />}
            </div>
          </div>
        );
      })}
      {gap > 0 && (
        <figcaption className="flex flex-wrap items-center gap-2 text-[14px] text-muted">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-gap" aria-hidden />
          <span className="num font-semibold text-gap">{formatMoney(gap, period)} left</span> against your range.
        </figcaption>
      )}
    </figure>
  );
}
