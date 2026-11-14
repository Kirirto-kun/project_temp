import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Page } from '@/components/holdline/AppShell';
import { PricingScreen } from '@/features/paywall/PricingScreen';

export const metadata: Metadata = { title: 'Pricing' };

export default function PricingPage() {
  return (
    <Page>
      <Suspense fallback={<p className="text-muted">Loading…</p>}>
        <PricingScreen />
      </Suspense>
    </Page>
  );
}
