'use client';

import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { useMemo } from 'react';
import { useHydrated } from '@/client/use-hydrated';
import { formatMoney, periodLabel } from '@/domain/money';
import { loadPlan, simulatedGains } from '@/client/storage/plan';
import type { Period } from '@/contracts/domain';

/**
 * Proof in numbers. Holdline has no published statistics yet, so this block only shows the
 * visitor's own simulated results; with none, it points to the labelled example.
 */
export function LandingStats({ exampleLeftMinor, examplePeriod }: { exampleLeftMinor: number | null; examplePeriod: Period }) {
  const hydrated = useHydrated();
  const gains: { period: Period; totalMinor: number; rounds: number }[] | null = useMemo(() => (hydrated ? simulatedGains(loadPlan().results) : null), [hydrated]);
  const has = gains !== null && gains.length > 0;
  return (
    <section className="page-col" aria-labelledby="proof">
      <div className="grid gap-8 rounded-[32px] bg-raised p-6 shadow-[var(--shadow-raise)] sm:p-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:items-center">
        <div>
          <p className="eyebrow m-0">Proof</p>
          <h2 id="proof" className="m-0 mt-4 text-[clamp(30px,4vw,48px)] font-extrabold leading-[1] tracking-[-0.045em]">
            {has ? (
              'Your rounds so far'
            ) : (
              <>
                Your numbers, <span className="serif text-hold-text">not</span> ours.
              </>
            )}
          </h2>
          <p className="lede m-0 mt-4">
            {has
              ? 'Best attempt per round, against your own ranges. Stored only in this browser; not real earnings.'
              : 'We show no market statistics without a source. After your first round, your own results appear here.'}
          </p>
        </div>
        {has ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {gains.map((g) => (
              <div key={g.period} className="rounded-[22px] bg-won-tint p-5">
                <div className="label">Gained in simulation · {periodLabel(g.period)}</div>
                <div className="figure-xl mt-2 text-won">+{formatMoney(g.totalMinor)}</div>
                <div className="mt-2 text-[13px] leading-[18px] text-muted">
                  Best attempt of {g.rounds} round{g.rounds === 1 ? '' : 's'}.
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Link
            href="/example"
            className="group grid gap-4 rounded-[24px] bg-paper-subtle p-6 text-ink no-underline shadow-[inset_0_0_0_1px_var(--line)] transition-shadow duration-200 hover:shadow-[inset_0_0_0_1px_var(--violet-300)]"
          >
            <span className="flex items-center justify-between">
              <span className="badge">Example</span>
              <ArrowRight size={18} strokeWidth={2} className="text-hold-text transition-transform duration-200 ease-[var(--ease-out)] group-hover:translate-x-1" aria-hidden />
            </span>
            <span className="text-[15px] text-muted">A synthetic raise, debriefed by the same engine as a live round</span>
            {exampleLeftMinor !== null && (
              <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="figure-xl text-gap">{formatMoney(exampleLeftMinor)}</span>
                <span className="text-[15px] font-medium text-ink-soft">left on the table {periodLabel(examplePeriod)}, against the range</span>
              </span>
            )}
          </Link>
        )}
      </div>
    </section>
  );
}
