import type { Metadata } from 'next';
import { Page } from '@/components/holdline/AppShell';
import { OpponentPicker } from '@/features/setup/OpponentPicker';

export const metadata: Metadata = { title: 'Choose your counterpart' };

export default function OpponentsPage() {
  return (
    <Page minimalHeader>
      <OpponentPicker />
    </Page>
  );
}
