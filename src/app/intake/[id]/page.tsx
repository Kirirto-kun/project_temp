import type { Metadata } from 'next';
import { Page } from '@/components/holdline/AppShell';
import { IntakeScreen } from '@/onboarding/ui/IntakeScreen';

export const metadata: Metadata = { title: 'Coach' };

export default async function IntakeSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Page minimalHeader>
      <IntakeScreen id={id} />
    </Page>
  );
}
