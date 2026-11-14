'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useHydrated } from '@/client/use-hydrated';
import type { ScenarioKind } from '@/contracts/domain';
import { formatMoney, periodLabel } from '@/domain/money';
import { loadPlan, savePlan, simulatedGains, type PlanState } from '@/client/storage/plan';
import { safeStorage } from '@/client/storage/safe-storage';

const KINDS: { kind: ScenarioKind; label: string }[] = [
  { kind: 'raise', label: 'A raise' },
  { kind: 'offer', label: 'A job offer' },
  { kind: 'rent', label: 'Rent' },
  { kind: 'bill', label: 'A bill or rate' },
];

export function PlanScreen() {
  const hydrated = useHydrated();
  const initialPlan = useMemo(() => (hydrated ? loadPlan() : null), [hydrated]);
  const [edited, setPlan] = useState<PlanState | null>(null);
  const plan = edited ?? initialPlan;
  const [writeFailed, setWriteFailed] = useState(false);
  const storageOk = !writeFailed && (!hydrated || safeStorage('local') !== null);
  const [kind, setKind] = useState<ScenarioKind>('raise');
  const [date, setDate] = useState('');
  const [description, setDescription] = useState('');

  function persist(next: PlanState) {
    setPlan(next);
    setWriteFailed(!savePlan(next));
  }

  if (!plan) return <p className="text-muted">Loading…</p>;
  const gains = simulatedGains(plan.results);

  return (
    <div className="grid gap-8">
      <header>
        <p className="eyebrow m-0">Plan</p>
        <h1 className="h-section m-0 mt-2">Your money conversations</h1>
        <p className="m-0 mt-2 max-w-[60ch] text-muted">A queue of the conversations coming up, and what you reached in practice. Stored only in this browser.</p>
        {!storageOk && <p className="m-0 mt-2 text-gap">This browser blocks local storage, so the plan will not be kept after you leave.</p>}
      </header>

      <section className="grid gap-4 sm:grid-cols-3" aria-label="Gained in simulation">
        {gains.length === 0 ? (
          <p className="m-0 text-muted sm:col-span-3">No finished rounds yet. Results appear here after your first debrief.</p>
        ) : (
          gains.map((g) => (
            <div key={g.period} className="card p-4">
              <div className="label">Gained in simulation · {periodLabel(g.period)}</div>
              <div className="figure-xl mt-1 text-won">+{formatMoney(g.totalMinor)}</div>
              <p className="m-0 mt-2 text-[13px] text-muted">
                Best attempt per round, {g.rounds} round{g.rounds === 1 ? '' : 's'}. Against your own ranges; not real earnings.
              </p>
            </div>
          ))
        )}
      </section>

      <section className="grid gap-3" aria-labelledby="queue">
        <h2 id="queue" className="m-0 text-[22px] font-semibold leading-7">
          Coming up
        </h2>
        <form
          className="card grid gap-3 p-4 sm:grid-cols-[1fr_auto_auto]"
          onSubmit={(e) => {
            e.preventDefault();
            if (!description.trim()) return;
            persist({
              ...plan,
              conversations: [...plan.conversations, { id: crypto.randomUUID(), kind, date: date || null, description: description.trim().slice(0, 200), lastSessionId: null, status: 'planned' }],
            });
            setDescription('');
            setDate('');
          }}
        >
          <label className="grid gap-1">
            <span className="label">What</span>
            <input className="input" placeholder="Annual review with my manager" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={200} />
          </label>
          <label className="grid gap-1">
            <span className="label">Type</span>
            <select className="input" value={kind} onChange={(e) => setKind(e.target.value as ScenarioKind)}>
              {KINDS.map((k) => (
                <option key={k.kind} value={k.kind}>
                  {k.label}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1">
            <span className="label">Date</span>
            <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <button type="submit" className="btn btn-primary sm:col-span-3 sm:w-fit">
            Add to plan
          </button>
        </form>
        <ul className="m-0 grid list-none gap-2 p-0">
          {plan.conversations
            .slice()
            .sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999'))
            .map((c) => (
              <li key={c.id} className="card flex flex-wrap items-center gap-3 p-4">
                <span className="mono text-[13px] text-muted">{c.date ?? 'no date'}</span>
                <span className="mr-auto">{c.description}</span>
                <span className="label">{c.status}</span>
                <Link href="/quiz" className="btn btn-secondary">
                  Practise
                </Link>
                <button type="button" className="btn btn-ghost" onClick={() => persist({ ...plan, conversations: plan.conversations.map((x) => (x.id === c.id ? { ...x, status: 'done' } : x)) })}>
                  Mark done
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => persist({ ...plan, conversations: plan.conversations.filter((x) => x.id !== c.id) })}>
                  Remove
                </button>
              </li>
            ))}
        </ul>
      </section>

      {plan.results.length > 0 && (
        <section className="grid gap-3" aria-labelledby="rounds">
          <h2 id="rounds" className="m-0 text-[22px] font-semibold leading-7">
            Recent rounds
          </h2>
          <ul className="m-0 grid list-none gap-2 p-0">
            {plan.results
              .slice(-10)
              .reverse()
              .map((r) => (
                <li key={r.sessionId} className="flex flex-wrap items-center gap-3 border-b border-line py-2">
                  <span className="mono text-[13px] text-muted">{r.finishedAt.slice(0, 10)}</span>
                  <span className="mr-auto">{r.kind}</span>
                  <span className={r.leftOnTableMinor ? 'num text-gap' : 'num text-muted'}>{r.leftOnTableMinor !== null ? `${formatMoney(r.leftOnTableMinor, r.period)} left` : 'No agreement'}</span>
                  <Link href={`/debrief/${r.sessionId}`}>Debrief</Link>
                </li>
              ))}
          </ul>
        </section>
      )}
    </div>
  );
}
