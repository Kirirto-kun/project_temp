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
      <p className="callout mb-8 mt-0">
        Example. A synthetic round run through the same engine as a live one. It says nothing about your own pay or what you would earn.
      </p>
      <DebriefReport
        debrief={debrief}
        example
        actions={
          <section className="on-violet relative grid gap-5 overflow-hidden rounded-[28px] p-6 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:p-8" aria-label="Your turn">
            <div className="pointer-events-none absolute -right-16 -top-20 h-60 w-60 rounded-full bg-violet-400/40 blur-3xl" aria-hidden />
            <div className="relative grid gap-2">
              <span className="text-[12px] font-medium uppercase tracking-[0.08em] text-white/70">Your turn</span>
              <p className="m-0 text-[22px] font-bold leading-[1.2] tracking-[-0.025em] text-white">Rehearse your own conversation with your own numbers.</p>
            </div>
            <div className="relative flex flex-wrap gap-2 sm:justify-end">
              <Link href="/intake" className="btn btn-white btn-xl">
                Start practising
              </Link>
              <Link href="/quiz" className="btn hero-ghost">
                Use the quick form
              </Link>
            </div>
          </section>
        }
      />
    </Page>
  );
}
