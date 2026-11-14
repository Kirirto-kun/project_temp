import type { Metadata } from 'next';
import { Page } from '@/components/holdline/AppShell';
import { CalibrationFlow } from '@/features/calibration/CalibrationFlow';

export const metadata: Metadata = { title: 'Calibrate your voice' };

export default function CalibrationPage() {
  return (
    <Page theme="light" minimalHeader>
      <CalibrationFlow />
    </Page>
  );
}
