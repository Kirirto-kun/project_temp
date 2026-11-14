import type { Metadata } from 'next';
import Link from 'next/link';
import { Page } from '@/components/holdline/AppShell';
import { exampleDebrief } from '@/content/example';
import { DebriefReport } from '@/features/debrief/DebriefReport';

export const metadata: Metadata = { title: 'Example debrief' };

export default async function ExamplePage() {
  const debrief = await exampleDebrief();
  return (
    <Page>
      <p className="m-0 mb-6 rounded-[8px] bg-hold-tint p-3 text-[14px]">
        Example. A synthetic round run through the same engine as a live one. It says nothing about your own pay or what you would earn.
      </p>
      <DebriefReport
        debrief={debrief}
        example
        actions={
          <div className="flex flex-wrap gap-3">
            <Link href="/intake" className="btn btn-primary btn-xl">
              Start
            </Link>
            <Link href="/quiz" className="btn btn-secondary">
              Use the quick form
            </Link>
          </div>
        }
      />
    </Page>
  );
}
