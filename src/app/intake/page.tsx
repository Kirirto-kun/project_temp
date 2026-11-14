import type { Metadata } from 'next';
import { Page } from '@/components/holdline/AppShell';
import { IntakeEntry } from '@/onboarding/ui/IntakeEntry';

export const metadata: Metadata = { title: 'Talk to the coach' };

export default function IntakePage() {
  return (
    <Page minimalHeader>
      <IntakeEntry />
    </Page>
  );
}
