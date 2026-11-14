import { cn } from './cn';

/**
 * Endless ticker. Two identical tracks slide by their own width (linear: constant motion).
 * The copy is hidden from assistive tech; reduced motion shows one static, wrapping track.
 */
export function Marquee({
  children,
  className,
  duration = 40,
  gap = 40,
  reverse = false,
  label,
}: {
  children: React.ReactNode;
  className?: string;
  duration?: number;
  gap?: number;
  reverse?: boolean;
  label?: string;
}) {
  return (
    <div
      className={cn('marquee', className)}
      data-reverse={reverse}
      style={{ ['--marquee-duration' as string]: `${duration}s`, ['--marquee-gap' as string]: `${gap}px` }}
      role={label ? 'region' : undefined}
      aria-label={label}
    >
      <div className="marquee-track">{children}</div>
      <div className="marquee-track" aria-hidden="true">
        {children}
      </div>
    </div>
  );
}
