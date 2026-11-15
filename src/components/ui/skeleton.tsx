import { cn } from './cn';

export function Skeleton({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return <div className={cn('skeleton', className)} style={style} aria-hidden />;
}

/** A calm placeholder for a screen that is loading; announces itself once to screen readers. */
export function ScreenSkeleton({ label = 'Loading…', variant = 'form' }: { label?: string; variant?: 'form' | 'chat' | 'report' }) {
  return (
    <div className="fade-in mx-auto grid w-full max-w-[640px] gap-5" role="status" style={{ ['--delay' as string]: '120ms' }}>
      <span className="sr-only">{label}</span>
      <Skeleton className="h-4 w-28 rounded-full" />
      <Skeleton className="h-10 w-4/5 rounded-2xl" />
      {variant === 'chat' ? (
        <>
          <Skeleton className="h-36 w-full rounded-[20px]" />
          <Skeleton className="h-14 w-3/4 rounded-[20px]" />
          <Skeleton className="ml-auto h-14 w-2/3 rounded-[20px]" />
        </>
      ) : variant === 'report' ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-48 rounded-[20px]" />
          <Skeleton className="h-48 rounded-[20px]" />
        </div>
      ) : (
        <>
          <Skeleton className="h-14 w-full rounded-2xl" />
          <Skeleton className="h-14 w-full rounded-2xl" />
          <Skeleton className="h-14 w-2/3 rounded-2xl" />
        </>
      )}
    </div>
  );
}
