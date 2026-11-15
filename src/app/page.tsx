import type { Metadata } from 'next';
import Link from 'next/link';
import { Page } from '@/components/holdline/AppShell';
import { Accordion } from '@/components/ui/accordion';
import { FAQ } from '@/content/copy';
import { exampleDebrief } from '@/content/example';
import { LandingStats } from '@/features/landing/LandingStats';
import { Counterparts, DebriefPreview, FinalCta, Hero, HowItWorks, Principles, Ribbons } from '@/features/landing/sections';

export const metadata: Metadata = { title: 'Rehearse the money conversation' };

export default async function LandingPage() {
  const example = await exampleDebrief();
  return (
    <Page width="bleed">
      <div className="pt-2">
        <Hero />
        <Ribbons />
        <div className="grid grid-cols-[minmax(0,1fr)] gap-28 sm:gap-36">
          <HowItWorks />
          <Counterparts />
          <DebriefPreview debrief={example} />
          <Principles />
          <LandingStats exampleLeftMinor={example.leftOnTableMinor} examplePeriod={example.period} />

          <section className="page-col grid gap-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]" aria-labelledby="faq">
            <div className="lg:sticky lg:top-28 lg:self-start">
              <p className="eyebrow m-0">FAQ</p>
              <h2 id="faq" className="h-section m-0 mt-4">
                Questions, <span className="serif text-hold-text">answered</span>.
              </h2>
              <p className="lede m-0 mt-4">
                Still unsure? Open the <Link href="/example">example debrief</Link>; it runs on the same engine as a live round.
              </p>
            </div>
            <Accordion items={FAQ} />
          </section>

          <FinalCta />
        </div>
      </div>
    </Page>
  );
}
