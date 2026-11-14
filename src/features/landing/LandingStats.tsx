'use client';

import { useMemo } from 'react';
import { useHydrated } from '@/client/use-hydrated';
import Link from 'next/link';
import { formatMoney, periodLabel } from '@/domain/money';
import { loadPlan, simulatedGains } from '@/client/storage/plan';
import type { Period } from '@/contracts/domain';

/**
 * Proof in numbers. Holdline has no published statistics yet, so this block only shows the
 * visitor's own simulated results; with none, it points to the labelled example.
 */
export function LandingStats() {
  const hydrated = useHydrated();
  const gains: { period: Period; totalMinor: number; rounds: number }[] | null = useMemo(() => (hydrated ? simulatedGains(loadPlan().results) : null), [hydrated]);
  if (!gains || gains.length === 0) {
    return (
      <section className="pt-12" aria-labelledby="proof">
        <h2 id="proof" className="h-section m-0 mb-4">
          Your numbers, not ours
        </h2>
        <p className="m-0 max-w-[60ch] text-muted">
          We show no market statistics without a source. After your first round, your own results appear here. Until then, open the{' '}
          <Link href="/example">example debrief</Link>, clearly marked as an example.
        </p>
      </section>
    );
  }
  return (
    <section className="pt-12" aria-labelledby="proof">
      <h2 id="proof" className="h-section m-0 mb-6">
        Your rounds so far
      </h2>
      <div className="grid gap-4 sm:grid-cols-3">
        {gains.map((g) => (
          <div key={g.period}>
            <div className="label">Gained in simulation · {periodLabel(g.period)}</div>
            <div className="figure-xl mt-1 text-won">+{formatMoney(g.totalMinor)}</div>
            <div className="mt-2 text-[13px] leading-[18px] text-muted">
              Best attempt of {g.rounds} round{g.rounds === 1 ? '' : 's'}, against your own ranges. Stored only in this browser.
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
