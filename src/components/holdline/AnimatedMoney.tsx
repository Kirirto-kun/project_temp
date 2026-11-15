'use client';

import NumberFlow from '@number-flow/react';
import type { Period } from '@/contracts/domain';
import { periodSuffix } from '@/domain/money';
import { cn } from '@/components/ui/cn';

/**
 * Money that rolls its digits when the value changes (NumberFlow). Same output format as
 * formatMoney: whole dollars without cents, otherwise two decimals. Null stays an explicit unknown.
 * NumberFlow honours prefers-reduced-motion by itself.
 */
export function AnimatedMoney({ amountMinor, period, className, unknownLabel = 'Unknown' }: { amountMinor: number | null | undefined; period?: Period | null; className?: string; unknownLabel?: string }) {
  if (amountMinor === null || amountMinor === undefined) return <span className={cn('num text-muted', className)}>{unknownLabel}</span>;
  const cents = Math.abs(amountMinor) % 100 !== 0;
  return (
    <NumberFlow
      className={cn('num', className)}
      value={amountMinor / 100}
      locales="en-US"
      format={{ style: 'currency', currency: 'USD', minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 }}
      suffix={periodSuffix(period)}
      willChange
    />
  );
}
