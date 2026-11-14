import type { Metadata } from 'next';
import { Page } from '@/components/holdline/AppShell';
import { DebriefScreen } from '@/features/debrief/DebriefScreen';

export const metadata: Metadata = { title: 'Debrief' };

export default async function DebriefPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Page>
      <DebriefScreen sessionId={id} />
    </Page>
  );
}
