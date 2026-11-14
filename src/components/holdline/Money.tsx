import type { Period } from '@/contracts/domain';
import { formatMoney } from '@/domain/money';

/** Money figure in the display face with tabular digits. Null renders as an explicit unknown. */
export function Money({ amountMinor, period, className = '', unknownLabel = 'Unknown' }: { amountMinor: number | null | undefined; period?: Period | null; className?: string; unknownLabel?: string }) {
  if (amountMinor === null || amountMinor === undefined) return <span className={`num text-muted ${className}`}>{unknownLabel}</span>;
  return <span className={`num ${className}`}>{formatMoney(amountMinor, period)}</span>;
}
