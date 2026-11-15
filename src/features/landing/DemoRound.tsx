'use client';

import { AnimatePresence, motion, useInView, useReducedMotion } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatedMoney } from '@/components/holdline/AnimatedMoney';
import { Avatar } from '@/components/holdline/Avatar';
import { Meter } from '@/components/holdline/Meter';

type Role = 'you' | 'them';
interface Frame {
  /** Delay before this frame, in ms. */
  wait: number;
  say?: { role: Role; text: string };
  typing?: Role | null;
  offer?: number;
  trust?: number;
  patience?: number;
  agreed?: boolean;
}

/** A scripted round that explains the product. Numbers are illustrative, labelled as an example. */
const SCRIPT: Frame[] = [
  { wait: 0, say: { role: 'them', text: 'Thanks for making time. What did you want to talk about?' }, offer: 9_800_000, trust: 52, patience: 72 },
  { wait: 1300, typing: 'you' },
  { wait: 1100, say: { role: 'you', text: 'My pay. I’m asking for $112,000.' }, typing: null },
  { wait: 900, typing: 'them' },
  { wait: 1200, say: { role: 'them', text: 'That’s a big jump. The budget is fixed this cycle.' }, typing: null, trust: 47, patience: 66 },
  { wait: 1400, typing: 'you' },
  { wait: 1200, say: { role: 'you', text: 'I took over payments in spring and cut incidents in half.' }, typing: null, trust: 63 },
  { wait: 900, typing: 'them' },
  { wait: 1300, say: { role: 'them', text: 'That’s fair. I can move to $104,000.' }, typing: null, offer: 10_400_000, patience: 61 },
  { wait: 1500, typing: 'you' },
  { wait: 1100, say: { role: 'you', text: 'Meet me at $110,000 and I’ll own the Q3 migration.' }, typing: null, trust: 68 },
  { wait: 900, typing: 'them' },
  { wait: 1300, say: { role: 'them', text: 'Deal at $108,000.' }, typing: null, offer: 10_800_000, agreed: true },
];
const HOLD_END_MS = 3200;

interface View {
  lines: { id: number; role: Role; text: string }[];
  typing: Role | null;
  offer: number;
  trust: number;
  patience: number;
  prevTrust: number;
  prevPatience: number;
  agreed: boolean;
}

function viewAt(step: number): View {
  const view: View = { lines: [], typing: null, offer: 0, trust: 0, patience: 0, prevTrust: 0, prevPatience: 0, agreed: false };
  SCRIPT.slice(0, step + 1).forEach((f, i) => {
    if (f.say) view.lines.push({ id: i, ...f.say });
    if (f.typing !== undefined) view.typing = f.typing;
    if (f.offer !== undefined) view.offer = f.offer;
    if (f.trust !== undefined) {
      view.prevTrust = view.trust || f.trust;
      view.trust = f.trust;
    }
    if (f.patience !== undefined) {
      view.prevPatience = view.patience || f.patience;
      view.patience = f.patience;
    }
    if (f.agreed) view.agreed = true;
  });
  return view;
}

/**
 * The hero's product shot: a round that plays itself. It only runs while on screen, restarts after
 * a pause at the end, and under reduced motion shows the finished round without movement.
 */
export function DemoRound() {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { margin: '-80px' });
  // Open mid-conversation so the first frame already reads as a round.
  const [step, setStep] = useState(4);
  const finalStep = SCRIPT.length - 1;
  const shown = reduce ? finalStep : step;

  useEffect(() => {
    if (reduce || !inView) return;
    const atEnd = step >= finalStep;
    const timer = setTimeout(() => setStep(atEnd ? 0 : step + 1), atEnd ? HOLD_END_MS : SCRIPT[step + 1]!.wait);
    return () => clearTimeout(timer);
  }, [step, inView, reduce, finalStep]);

  const view = useMemo(() => viewAt(shown), [shown]);
  const seconds = 300 - Math.round((shown / finalStep) * 128);

  return (
    <div ref={ref} className="overflow-hidden rounded-[28px] bg-raised text-ink shadow-[var(--shadow-lift)]" aria-label="Example round, animated" role="img">
      <div className="flex items-center gap-3 border-b border-line bg-paper-subtle px-4 py-3 sm:px-5">
        <Avatar avatarId="maya-chen" size={40} speaking={view.typing === 'them'} />
        <div className="mr-auto min-w-0 leading-tight">
          <div className="truncate text-[15px] font-semibold">Maya Chen</div>
          <div className="truncate text-[12.5px] text-muted">Engineering manager · Budget guard</div>
        </div>
        <span className="badge badge-hold hidden sm:inline-flex">
          <span className="live-dot" aria-hidden /> Example round
        </span>
        <span className="mono rounded-full bg-sunken px-2.5 py-1 text-[12.5px] text-ink-soft">
          {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}
        </span>
      </div>

      <div className="grid md:grid-cols-[minmax(0,1fr)_280px]">
        <div className="demo-chat relative flex h-[300px] flex-col justify-end gap-2.5 overflow-hidden px-4 pb-4 sm:h-[330px] sm:px-5">
          <AnimatePresence initial={false} mode="popLayout">
            {view.lines.map((line) => (
              <motion.div
                key={`${line.id}-${line.text}`}
                layout={!reduce}
                initial={reduce ? false : { opacity: 0, y: 10, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, transition: { duration: 0.2 } }}
                transition={{ type: 'spring', duration: 0.45, bounce: 0.12 }}
                className={`max-w-[85%] px-4 py-2.5 text-[14.5px] leading-[1.45] ${line.role === 'you' ? 'bubble-you self-end' : 'bubble-them self-start'}`}
                style={{ transformOrigin: line.role === 'you' ? 'bottom right' : 'bottom left' }}
              >
                {line.text}
              </motion.div>
            ))}
            {view.typing && (
              <motion.div
                key={`typing-${view.typing}-${shown}`}
                layout={!reduce}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, transition: { duration: 0.12 } }}
                transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
                className={`dots w-fit px-4 py-3.5 ${view.typing === 'you' ? 'bubble-you self-end [&_span]:!bg-white/80' : 'bubble-them self-start'}`}
              >
                <span />
                <span />
                <span />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="grid content-start gap-5 border-t border-line p-4 sm:p-5 md:border-l md:border-t-0">
          <div>
            <div className="label">{view.agreed ? 'Agreed' : 'On the table'}</div>
            <div className={`mt-1 text-[34px] font-extrabold leading-none tracking-[-0.04em] transition-colors duration-300 ${view.agreed ? 'text-won' : ''}`}>
              <AnimatedMoney amountMinor={view.offer} period="year" />
            </div>
            <div className="mt-1.5 text-[12.5px] text-muted">Your target $112,000/year</div>
          </div>
          <Meter label="Trust" value={view.trust} delta={view.trust - view.prevTrust} />
          <Meter label="Patience" value={view.patience} delta={view.patience - view.prevPatience} tone="ink" />
        </div>
      </div>
    </div>
  );
}
