import { cn } from '@/components/ui/cn';

/**
 * The Holdline mark, "Crossline": two posts (the two sides of the table) and one line that runs
 * through both and past them. Reads as an H; the line is held level across the gap.
 * Options and the reasoning live in docs/brand/logo-options/.
 */
export function LogoMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} className={cn('shrink-0', className)} aria-hidden>
      <rect width="32" height="32" rx="8" fill="var(--hold)" />
      <rect x="9" y="8" width="4" height="16" rx="2" fill="var(--on-hold)" />
      <rect x="19" y="8" width="4" height="16" rx="2" fill="var(--on-hold)" />
      <rect x="4.5" y="13.5" width="23" height="3" rx="1.5" fill="var(--on-hold)" />
    </svg>
  );
}

export function Logo({ size = 28, className, wordmarkClassName }: { size?: number; className?: string; wordmarkClassName?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <LogoMark size={size} />
      <span className={cn('font-display text-[19px] font-bold leading-none tracking-[-0.04em]', wordmarkClassName)}>Holdline</span>
    </span>
  );
}
