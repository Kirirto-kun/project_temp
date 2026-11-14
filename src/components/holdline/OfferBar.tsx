import type { Objective, Period } from '@/contracts/domain';
import { formatMoney } from '@/domain/money';

interface Bar {
  label: string;
  amountMinor: number;
  color: string;
  pattern?: boolean;
}

/**
 * The signature offer bar: horizontal bars on one scale. The scenario limit is shown only
 * when the caller has it (after the debrief); it is never reconstructed from hidden fields.
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
  if (reservationAmountMinor !== undefined && reservationAmountMinor !== null) bars.push({ label: objective === 'maximize' ? 'Scenario ceiling' : 'Scenario floor', amountMinor: reservationAmountMinor, color: 'var(--ink)', pattern: true });
  bars.push({ label: 'Your target', amountMinor: targetMinor, color: 'var(--hold)' });
  if (agreedMinor !== undefined && agreedMinor !== null) bars.push({ label: 'Agreed', amountMinor: agreedMinor, color: 'var(--won)' });
  else if (offerMinor !== null) bars.push({ label: 'On the table', amountMinor: offerMinor, color: 'var(--muted)' });
  bars.push({ label: objective === 'maximize' ? 'Where you started' : 'Starting price', amountMinor: currentMinor, color: 'var(--line)' });

  const max = Math.max(...bars.map((b) => b.amountMinor)) * 1.04;
  const gap =
    reservationAmountMinor !== undefined && reservationAmountMinor !== null && agreedMinor !== undefined && agreedMinor !== null
      ? objective === 'maximize'
        ? Math.max(0, reservationAmountMinor - agreedMinor)
        : Math.max(0, agreedMinor - reservationAmountMinor)
      : 0;

  return (
    <figure className="m-0 flex flex-col gap-3" aria-label="Offer bar">
      {bars.map((bar) => {
        const width = (bar.amountMinor / max) * 100;
        const isAgreed = bar.label === 'Agreed';
        const gapWidth = isAgreed && gap > 0 ? (gap / max) * 100 : 0;
        return (
          <div key={bar.label}>
            <div className="mb-1 flex items-baseline justify-between gap-3">
              <span className="label">{bar.label}</span>
              <span className="num text-[15px] font-semibold">{formatMoney(bar.amountMinor, period)}</span>
            </div>
            <div className="flex h-6">
              <div
                className="rounded-[4px]"
                style={{
                  width: `${objective === 'minimize' && isAgreed ? width - gapWidth : width}%`,
                  background: bar.color,
                  backgroundImage: bar.pattern ? 'radial-gradient(circle, var(--paper) 1.5px, transparent 2px)' : undefined,
                  backgroundSize: bar.pattern ? '14px 12px' : undefined,
                }}
              />
              {gapWidth > 0 && <div className="rounded-[4px]" style={{ width: `${gapWidth}%`, background: 'var(--gap)' }} aria-hidden />}
            </div>
          </div>
        );
      })}
      {gap > 0 && (
        <figcaption className="text-[14px] text-muted">
          Amber: <span className="num font-semibold text-gap">{formatMoney(gap, period)} left</span> against your range.
        </figcaption>
      )}
    </figure>
  );
}
