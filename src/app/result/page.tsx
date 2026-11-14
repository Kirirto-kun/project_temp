import type { Metadata } from 'next';
import { Page } from '@/components/holdline/AppShell';
import { ResultView } from '@/features/setup/ResultView';

export const metadata: Metadata = { title: 'Your round' };

export default function ResultPage() {
  return (
    <Page theme="light" minimalHeader>
      <ResultView />
    </Page>
  );
}
