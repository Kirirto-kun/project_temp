import { cn } from '@/components/ui/cn';

/** The Holdline mark: a number that steps up and holds the line. */
export function LogoMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} className={cn('shrink-0', className)} aria-hidden>
      <rect width="32" height="32" rx="9" fill="var(--violet-600)" />
      <path d="M6.5 20.5h5.5l3.6-8h7.4" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="25.6" cy="12.5" r="2.4" fill="var(--spark)" />
    </svg>
  );
}

export function Logo({ size = 28, className, wordmarkClassName }: { size?: number; className?: string; wordmarkClassName?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <LogoMark size={size} />
      <span className={cn('text-[19px] font-bold leading-none tracking-[-0.045em]', wordmarkClassName)}>Holdline</span>
    </span>
  );
}
