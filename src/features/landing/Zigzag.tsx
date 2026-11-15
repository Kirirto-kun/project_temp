import { cn } from '@/components/ui/cn';

/**
 * Angular zigzag ribbons behind violet blocks. Pure decoration: hidden from assistive tech,
 * drifting slowly (CSS, compositor-only) and still under reduced motion.
 */
export function Zigzag({ className, tone = 'dark' }: { className?: string; tone?: 'dark' | 'light' }) {
  return (
    <svg
      aria-hidden
      className={cn('zigzag pointer-events-none absolute inset-0 h-full w-full', className)}
      viewBox="0 0 1440 720"
      preserveAspectRatio="xMidYMid slice"
      fill="none"
    >
      <g className="zigzag-drift" stroke={tone === 'dark' ? 'var(--violet-700)' : 'var(--violet-500)'} strokeWidth="96" strokeLinejoin="miter" strokeLinecap="butt" opacity={tone === 'dark' ? 0.55 : 0.4}>
        <path d="M-160 600 L120 300 L380 600 L640 300 L900 600 L1160 300 L1420 600 L1680 300" />
      </g>
      <g className="zigzag-drift zigzag-drift-slow" stroke={tone === 'dark' ? 'var(--violet-800)' : 'var(--violet-400)'} strokeWidth="56" strokeLinejoin="miter" opacity={tone === 'dark' ? 0.35 : 0.3}>
        <path d="M-120 140 L180 -60 L460 160 L760 -40 L1040 170 L1340 -50 L1620 150" />
      </g>
    </svg>
  );
}
