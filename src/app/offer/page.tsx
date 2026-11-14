import type { Metadata } from 'next';
import { Page } from '@/components/holdline/AppShell';
import { OfferForm } from '@/features/offer/OfferForm';

export const metadata: Metadata = { title: 'Read an offer' };

export default function OfferPage() {
  return (
    <Page theme="light">
      <OfferForm />
    </Page>
  );
}
