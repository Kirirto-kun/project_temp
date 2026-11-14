import type { Metadata } from 'next';
import { Page } from '@/components/holdline/AppShell';
import { CustomScenarioForm } from '@/features/custom/CustomScenarioForm';

export const metadata: Metadata = { title: 'Your own scenario' };

export default function CustomPage() {
  return (
    <Page theme="light">
      <CustomScenarioForm />
    </Page>
  );
}
