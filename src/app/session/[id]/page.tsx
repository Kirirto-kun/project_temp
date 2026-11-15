import type { Metadata } from 'next';
import { Page } from '@/components/holdline/AppShell';
import { SessionScreen } from '@/features/session/SessionScreen';

export const metadata: Metadata = { title: 'Practice round' };

export default async function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Page minimalHeader>
      <SessionScreen id={id} />
    </Page>
  );
}
