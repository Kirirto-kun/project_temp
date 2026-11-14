'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { Objective, Period } from '@/contracts/domain';
import { ApiClientError } from '@/client/api/client';
import { createCustomScenario, createSession } from '@/client/api/session';
import { AVATAR_CARDS } from '@/content/avatars';
import { MoneyField } from '@/features/quiz/MoneyField';

export function CustomScenarioForm() {
  const router = useRouter();
  const [description, setDescription] = useState('');
  const [objective, setObjective] = useState<Objective>('maximize');
  const [period, setPeriod] = useState<Period>('month');
  const [current, setCurrent] = useState<number | undefined>();
  const [target, setTarget] = useState<number | undefined>();
  const [low, setLow] = useState<number | undefined>();
  const [high, setHigh] = useState<number | undefined>();
  const [role, setRole] = useState('Client');
  const [avatarId, setAvatarId] = useState(AVATAR_CARDS[0]!.avatarId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    if (!current || !target || !low || !high) return setError('Enter all four amounts.');
    setBusy(true);
    try {
      const { scenarioId } = await createCustomScenario(
        {
          kind: 'custom',
          objective,
          description,
          counterpartRole: role,
          conversationDate: null,
          currentMinor: current,
          targetMinor: target,
          marketLowMinor: low,
          marketHighMinor: high,
          period,
          fear: '',
          avatarId,
          currency: 'USD',
          moneyBasis: 'unspecified',
          inputMode: 'personal',
          rangeSource: 'user_provided',
        },
        description,
      );
      const session = await createSession({ customScenarioId: scenarioId, baselineId: null });
      router.push(`/session/${session.id}`);
    } catch (err) {
      setBusy(false);
      setError(err instanceof ApiClientError ? (err.fields?.[0]?.message ?? err.message) : 'Could not create the scenario.');
    }
  }

  return (
    <div className="mx-auto grid max-w-[560px] gap-5">
      <header>
        <p className="eyebrow m-0">Conversation pack</p>
        <h1 className="h-screen m-0 mt-2">Describe your own conversation</h1>
        <p className="m-0 mt-2 text-[14px] text-muted">For example a freelance rate, a car price or a card interest rate. The limits still come only from your numbers.</p>
      </header>
      <label className="grid gap-2">
        <span className="text-[15px] font-semibold">The situation</span>
        <textarea className="input min-h-[120px]" maxLength={4000} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="I want to raise my day rate with a client I have worked with for two years…" />
      </label>
      <label className="grid gap-2">
        <span className="text-[15px] font-semibold">Who is the counterpart?</span>
        <input className="input" value={role} maxLength={60} onChange={(e) => setRole(e.target.value)} />
      </label>
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Direction">
        <button type="button" role="radio" aria-checked={objective === 'maximize'} className="option" onClick={() => setObjective('maximize')}>
          I want more
        </button>
        <button type="button" role="radio" aria-checked={objective === 'minimize'} className="option" onClick={() => setObjective('minimize')}>
          I want to pay less
        </button>
      </div>
      <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Period">
        {(['year', 'month', 'one_time'] as Period[]).map((p) => (
          <button key={p} type="button" role="radio" aria-checked={period === p} className="option justify-center" onClick={() => setPeriod(p)}>
            {p === 'year' ? 'Per year' : p === 'month' ? 'Per month' : 'One-time'}
          </button>
        ))}
      </div>
      <MoneyField label="Current amount" valueMinor={current} period={period} onChange={setCurrent} />
      <MoneyField label="Your target" valueMinor={target} period={period} onChange={setTarget} />
      <MoneyField label="Range: low end" valueMinor={low} period={period} onChange={setLow} />
      <MoneyField label="Range: high end" valueMinor={high} period={period} onChange={setHigh} />
      <label className="grid gap-2">
        <span className="text-[15px] font-semibold">Illustration</span>
        <select className="input" value={avatarId} onChange={(e) => setAvatarId(e.target.value)}>
          {AVATAR_CARDS.map((c) => (
            <option key={c.avatarId} value={c.avatarId}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      {error && (
        <p className="m-0 text-gap" role="alert">
          {error}
        </p>
      )}
      <button type="button" className="btn btn-primary btn-xl" disabled={busy || description.trim().length < 20} onClick={() => void submit()}>
        {busy ? 'Writing your scenario…' : 'Create and start'}
      </button>
      <p className="m-0 text-[12px] text-muted">Uses one scenario credit, only when the scenario is created successfully.</p>
    </div>
  );
}
