import type { Metadata } from 'next';
import { Page } from '@/components/holdline/AppShell';
import { PlanScreen } from '@/features/plan/PlanScreen';

export const metadata: Metadata = { title: 'Plan' };

export default function PlanPage() {
  return (
    <Page>
      <PlanScreen />
    </Page>
  );
}
