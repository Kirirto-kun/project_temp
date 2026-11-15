'use client';

import { CalendarDays, Check, Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { useMemo, useState } from 'react';
import { useHydrated } from '@/client/use-hydrated';
import type { ScenarioKind } from '@/contracts/domain';
import { formatMoney, periodLabel } from '@/domain/money';
import { loadPlan, savePlan, simulatedGains, type PlanState } from '@/client/storage/plan';
import { safeStorage } from '@/client/storage/safe-storage';
import { cn } from '@/components/ui/cn';
import { ScreenSkeleton } from '@/components/ui/skeleton';

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

  if (!plan) return <ScreenSkeleton variant="report" />;
  const gains = simulatedGains(plan.results);
  const upcoming = plan.conversations.slice().sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999'));

  return (
    <div className="grid gap-12">
      <header className="grid gap-4">
        <p className="eyebrow m-0">Plan</p>
        <h1 className="h-section m-0">
          Your money <span className="serif text-hold-text">conversations</span>
        </h1>
        <p className="lede m-0">A queue of the conversations coming up, and what you reached in practice. Stored only in this browser.</p>
        {!storageOk && <p className="callout callout-warn m-0">This browser blocks local storage, so the plan will not be kept after you leave.</p>}
      </header>

      <section className="grid gap-4 sm:grid-cols-3" aria-label="Gained in simulation">
        {gains.length === 0 ? (
          <div className="panel flex flex-wrap items-center justify-between gap-4 p-6 sm:col-span-3">
            <p className="m-0 text-muted">No finished rounds yet. Results appear here after your first debrief.</p>
            <Link href="/intake" className="btn btn-primary btn-sm">
              Start a round
            </Link>
          </div>
        ) : (
          gains.map((g) => (
            <div key={g.period} className="rounded-[24px] bg-won-tint p-6">
              <div className="label">Gained in simulation · {periodLabel(g.period)}</div>
              <div className="figure-xl mt-2 text-won">+{formatMoney(g.totalMinor)}</div>
              <p className="m-0 mt-2 text-[13px] text-muted">
                Best attempt per round, {g.rounds} round{g.rounds === 1 ? '' : 's'}. Against your own ranges; not real earnings.
              </p>
            </div>
          ))
        )}
      </section>

      <section className="grid gap-4" aria-labelledby="queue">
        <h2 id="queue" className="m-0 text-[28px] font-bold leading-[1.1] tracking-[-0.035em]">
          Coming up
        </h2>
        <form
          className="card grid gap-4 p-5 sm:grid-cols-[minmax(0,1fr)_180px_170px_auto] sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            if (!description.trim()) return;
            persist({
              ...plan,
              conversations: [...plan.conversations, { id: crypto.randomUUID(), kind, date: date || null, description: description.trim().slice(0, 200), lastSessionId: null, status: 'planned' }],
            });
            toast.success('Added to your plan', { description: description.trim().slice(0, 80) });
            setDescription('');
            setDate('');
          }}
        >
          <label className="grid gap-1.5">
            <span className="label">What</span>
            <input className="input" placeholder="Annual review with my manager" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={200} />
          </label>
          <label className="grid gap-1.5">
            <span className="label">Type</span>
            <select className="input" value={kind} onChange={(e) => setKind(e.target.value as ScenarioKind)}>
              {KINDS.map((k) => (
                <option key={k.kind} value={k.kind}>
                  {k.label}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1.5">
            <span className="label">Date</span>
            <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <button type="submit" className="btn btn-primary min-h-12" disabled={!description.trim()}>
            <Plus size={18} strokeWidth={2} aria-hidden /> Add to plan
          </button>
        </form>
        {upcoming.length === 0 ? (
          <p className="m-0 text-[15px] text-muted">Nothing planned yet. Add the next conversation you are expecting.</p>
        ) : (
          <ul className="m-0 grid list-none gap-2.5 p-0">
            {upcoming.map((c) => (
              <li key={c.id} className={cn('card pop-in flex flex-wrap items-center gap-3 p-4 sm:gap-4', c.status === 'done' && 'opacity-60')}>
                <span className="mono flex items-center gap-1.5 rounded-full bg-sunken px-3 py-1.5 text-[12.5px] text-ink-soft">
                  <CalendarDays size={14} strokeWidth={2} aria-hidden /> {c.date ?? 'no date'}
                </span>
                <span className={cn('mr-auto min-w-0 text-[15.5px] font-medium', c.status === 'done' && 'line-through')}>{c.description}</span>
                <span className={cn('badge', c.status === 'done' ? 'badge-won' : 'badge-hold')}>{c.status}</span>
                <div className="flex gap-1">
                  <Link href="/quiz" className="btn btn-secondary btn-sm">
                    Practise
                  </Link>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      persist({ ...plan, conversations: plan.conversations.map((x) => (x.id === c.id ? { ...x, status: 'done' } : x)) });
                      toast.success('Marked as done');
                    }}
                  >
                    <Check size={15} strokeWidth={2} aria-hidden /> Mark done
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm btn-icon !w-9"
                    aria-label={`Remove ${c.description}`}
                    onClick={() => {
                      persist({ ...plan, conversations: plan.conversations.filter((x) => x.id !== c.id) });
                      toast('Removed from your plan', { action: { label: 'Undo', onClick: () => persist(plan) } });
                    }}
                  >
                    <Trash2 size={15} strokeWidth={2} aria-hidden />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {plan.results.length > 0 && (
        <section className="grid gap-4" aria-labelledby="rounds">
          <h2 id="rounds" className="m-0 text-[28px] font-bold leading-[1.1] tracking-[-0.035em]">
            Recent rounds
          </h2>
          <ul className="card m-0 grid list-none overflow-hidden p-0">
            {plan.results
              .slice(-10)
              .reverse()
              .map((r) => (
                <li key={r.sessionId} className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3.5 last:border-b-0">
                  <span className="mono text-[12.5px] text-muted">{r.finishedAt.slice(0, 10)}</span>
                  <span className="mr-auto font-medium capitalize">{r.kind}</span>
                  <span className={cn('num text-[14.5px] font-semibold', r.leftOnTableMinor ? 'text-gap' : 'text-muted')}>{r.leftOnTableMinor !== null ? `${formatMoney(r.leftOnTableMinor, r.period)} left` : 'No agreement'}</span>
                  <Link href={`/debrief/${r.sessionId}`} className="btn btn-ghost btn-sm">
                    Debrief
                  </Link>
                </li>
              ))}
          </ul>
        </section>
      )}
    </div>
  );
}
