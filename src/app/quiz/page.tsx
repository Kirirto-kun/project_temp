import type { Metadata } from 'next';
import { Page } from '@/components/holdline/AppShell';
import { QuizFlow } from '@/features/quiz/QuizFlow';

export const metadata: Metadata = { title: 'Set up your round' };

export default function QuizPage() {
  return (
    <Page minimalHeader>
      <QuizFlow />
    </Page>
  );
}
