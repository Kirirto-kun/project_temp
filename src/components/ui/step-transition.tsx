'use client';

import { AnimatePresence, motion, useIsPresent, useReducedMotion, type Variants } from 'motion/react';

const EASE_OUT = [0.23, 1, 0.32, 1] as const;

const variants: Variants = {
  enter: (dir: number) => ({ opacity: 0, x: dir * 28, filter: 'blur(4px)' }),
  center: { opacity: 1, x: 0, filter: 'blur(0px)', transition: { duration: 0.3, ease: EASE_OUT } },
  exit: (dir: number) => ({ opacity: 0, x: dir * -28, filter: 'blur(4px)', transition: { duration: 0.18, ease: EASE_OUT } }),
};

const reducedVariants: Variants = {
  enter: { opacity: 0 },
  center: { opacity: 1, transition: { duration: 0.2 } },
  exit: { opacity: 0, transition: { duration: 0.12 } },
};

function Panel({ children, className, direction }: { children: React.ReactNode; className?: string; direction: 1 | -1 }) {
  const present = useIsPresent();
  const reduce = useReducedMotion();
  return (
    <motion.div
      variants={reduce ? reducedVariants : variants}
      custom={direction}
      initial="enter"
      animate="center"
      exit="exit"
      className={className}
      // A leaving step can't be clicked, focused or found by assistive tech while it fades out.
      aria-hidden={present ? undefined : true}
      inert={!present}
    >
      {children}
    </motion.div>
  );
}

/**
 * Swaps funnel steps in place. Forward slides content to the left, back to the right; the old step
 * leaves while the new one enters (popLayout), with a short blur to read as one motion.
 * Direction travels through `custom` so the exiting step uses the new direction.
 */
export function StepTransition({ stepKey, direction, children, className }: { stepKey: string | number; direction: 1 | -1; children: React.ReactNode; className?: string }) {
  return (
    <div className="relative">
      <AnimatePresence mode="popLayout" initial={false} custom={direction}>
        <Panel key={stepKey} className={className} direction={direction}>
          {children}
        </Panel>
      </AnimatePresence>
    </div>
  );
}
