'use client';

import { useState } from 'react';
import type { OfferAnalysis } from '@/contracts/api';
import { formatMoney } from '@/domain/money';
import { ApiClientError } from '@/client/api/client';
import { analyzeOffer } from '@/client/api/session';

function Part({ label, part, period }: { label: string; part: OfferAnalysis['base']; period: OfferAnalysis['period'] }) {
  return (
    <div className="border-b border-line py-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="label">{label}</span>
        <span className="num text-[18px] font-semibold">{part.amountMinor !== null ? formatMoney(part.amountMinor, label === 'Sign-on' ? null : period) : 'Not stated'}</span>
      </div>
      {part.sourceText && <p className="m-0 mt-1 text-[13px] italic text-muted">“{part.sourceText}”</p>}
      {part.amountMinor !== null && <p className="m-0 mt-1 text-[12px] text-muted">{part.guaranteed ? 'Guaranteed' : 'Not guaranteed'}</p>}
    </div>
  );
}

export function OfferForm() {
  const [text, setText] = useState('');
  const [analysis, setAnalysis] = useState<OfferAnalysis | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      setAnalysis(await analyzeOffer(text));
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not analyse the offer.');
    }
    setBusy(false);
  }

  return (
    <div className="mx-auto grid max-w-[640px] gap-5">
      <header>
        <p className="eyebrow m-0">Conversation pack</p>
        <h1 className="h-screen m-0 mt-2">Read a real offer</h1>
        <p className="m-0 mt-2 text-[14px] text-muted">Paste the offer text. Every amount is read from the text itself; anything not stated stays unknown. This is not a financial forecast.</p>
      </header>
      <textarea className="input min-h-[200px]" maxLength={20_000} value={text} onChange={(e) => setText(e.target.value)} aria-label="Offer text" />
      <button type="button" className="btn btn-primary btn-xl" disabled={busy || text.trim().length < 20} onClick={() => void submit()}>
        {busy ? 'Reading…' : 'Analyse the offer'}
      </button>
      {error && (
        <p className="m-0 text-gap" role="alert">
          {error}
        </p>
      )}
      {analysis && (
        <section className="card p-4" aria-label="Offer analysis">
          <Part label="Base" part={analysis.base} period={analysis.period} />
          <Part label="Bonus" part={analysis.bonus} period={analysis.period} />
          <Part label="Equity" part={analysis.equity} period={analysis.period} />
          <Part label="Sign-on" part={analysis.signOn} period={analysis.period} />
          <div className="pt-3">
            <div className="label">First-year guaranteed cash</div>
            <div className="num text-[24px] font-bold">{analysis.guaranteedTotalMinor !== null ? formatMoney(analysis.guaranteedTotalMinor) : 'Unknown'}</div>
            <p className="m-0 text-[13px] text-muted">Base + guaranteed bonus + sign-on, computed by code. Equity and target bonuses are not added.</p>
          </div>
          <ul className="m-0 mt-3 grid gap-1 pl-5 text-[14px]">
            {analysis.unknowns.map((u) => (
              <li key={u}>{u}</li>
            ))}
          </ul>
          <div className="label mt-4">Questions to ask</div>
          <ul className="m-0 mt-1 grid gap-1 pl-5 text-[14px]">
            {analysis.questionsToAsk.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
