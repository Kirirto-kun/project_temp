'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { ConfigResponse, EntitlementResponse } from '@/contracts/api';
import { formatMoney } from '@/domain/money';
import { ApiClientError } from '@/client/api/client';
import { getConfig, getEntitlement, startCheckout } from '@/client/api/session';

export function PricingScreen() {
  const params = useSearchParams();
  const [config, setConfig] = useState<ConfigResponse | null>(null);
  const [entitlement, setEntitlement] = useState<EntitlementResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const returned = params.get('checkout') === 'success';

  useEffect(() => {
    getConfig().then(setConfig).catch(() => setConfig(null));
    let attempts = 0;
    let cancelled = false;
    async function poll() {
      const value = await getEntitlement().catch(() => null);
      if (cancelled) return;
      setEntitlement(value);
      if (returned && value?.status === 'pending' && attempts < 20) {
        attempts += 1;
        setTimeout(poll, 3_000);
      }
    }
    void poll();
    return () => {
      cancelled = true;
    };
  }, [returned]);

  async function buy() {
    setBusy(true);
    setError(null);
    try {
      const checkout = await startCheckout();
      window.location.assign(checkout.checkoutUrl);
    } catch (err) {
      setBusy(false);
      setError(err instanceof ApiClientError ? err.message : 'Checkout is not available right now.');
    }
  }

  const product = config?.paidProduct ?? null;
  return (
    <div className="mx-auto grid max-w-[560px] gap-6">
      <header>
        <p className="eyebrow m-0">Pricing</p>
        <h1 className="h-title m-0 mt-2">Practice is free. Your own scenario is a pack.</h1>
      </header>
      <div className="card grid gap-2 p-4">
        <div className="label">Free</div>
        <p className="m-0">The coach call, the quick form, every standard round, replays and the debrief, within a daily limit.</p>
      </div>
      <div className="card grid gap-3 p-4" style={{ borderColor: 'var(--hold)' }}>
        <div className="flex items-baseline justify-between gap-3">
          <b className="text-[16px]">Conversation pack</b>
          <span className="num text-[18px] font-semibold">{product ? formatMoney(product.priceMinor) : '—'}</span>
        </div>
        <ul className="m-0 grid gap-1 pl-5 text-[15px]">
          <li>One scenario written from your own description</li>
          <li>One analysis of a real offer you paste in</li>
        </ul>
        <p className="m-0 text-[13px] text-muted">One-time payment. No subscription, no renewal. Access is tied to this browser.</p>
        {entitlement?.status === 'active' ? (
          <div className="grid gap-2">
            <p className="m-0 text-won">
              Active: {entitlement.customScenariosRemaining} scenario and {entitlement.offerAnalysesRemaining} offer analysis left.
            </p>
            <div className="flex flex-wrap gap-2">
              <Link href="/custom" className="btn btn-primary">
                Write my scenario
              </Link>
              <Link href="/offer" className="btn btn-secondary">
                Analyse an offer
              </Link>
            </div>
          </div>
        ) : entitlement?.status === 'pending' ? (
          <p className="m-0 text-muted" role="status">
            Waiting for the payment confirmation…
          </p>
        ) : product ? (
          <button type="button" className="btn btn-primary btn-xl" onClick={() => void buy()} disabled={busy}>
            {busy ? 'Opening checkout…' : `Buy for ${formatMoney(product.priceMinor)}`}
          </button>
        ) : (
          <p className="m-0 text-muted">Payments are not enabled on this deployment.</p>
        )}
        {entitlement?.status === 'revoked' && <p className="m-0 text-gap">This pack was refunded, so its unused credits were removed.</p>}
        {error && (
          <p className="m-0 text-gap" role="alert">
            {error}
          </p>
        )}
      </div>
      <section id="billing" className="grid gap-2">
        <h2 className="m-0 text-[18px] font-semibold">Why was I charged?</h2>
        <p className="m-0 text-[15px] text-muted">Only if you bought a conversation pack. The receipt from our payment provider shows the date and the amount. There is nothing to cancel because nothing renews.</p>
      </section>
    </div>
  );
}
