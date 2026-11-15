import { cn } from '@/components/ui/cn';

/**
 * Patience / trust meter, 0–100. Below 25 the value turns amber and says "low".
 * The fill moves with transform (scaleX) so it never triggers layout; the delta re-pops on every change.
 */
export function Meter({ label, value, delta, tone = 'hold' }: { label: string; value: number; delta?: number | null; tone?: 'hold' | 'ink' }) {
  const low = value < 25;
  const clamped = Math.max(0, Math.min(100, value));
  const fill = low ? 'var(--gap)' : tone === 'ink' ? 'var(--ink)' : 'var(--hold)';
  return (
    <div className="grid gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="label">{label}</span>
        <span className={cn('num flex items-baseline gap-1.5 text-[17px] font-semibold leading-6', low && 'text-gap')}>
          {clamped}
          {low && <span className="text-[12px] font-semibold uppercase tracking-[0.04em]"> low</span>}
          {delta ? (
            <span key={`${label}-${clamped}-${delta}`} className={cn('pop-in rounded-full px-1.5 text-[12px] font-semibold leading-5', delta > 0 ? 'bg-won-tint text-won' : 'bg-gap-tint text-gap')}>
              {delta > 0 ? `+${delta}` : delta}
            </span>
          ) : null}
        </span>
      </div>
      <div className="meter-track" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={clamped} aria-valuetext={`${clamped}${low ? ', low' : ''}`}>
        <div className="meter-fill" style={{ transform: `scaleX(${clamped / 100})`, background: fill }} />
      </div>
    </div>
  );
}
