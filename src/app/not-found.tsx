import Link from 'next/link';
import { Page } from '@/components/holdline/AppShell';

export default function NotFound() {
  return (
    <Page>
      <div className="mx-auto grid max-w-[560px] justify-items-center gap-5 py-16 text-center">
        <span className="text-[120px] font-extrabold leading-none tracking-[-0.06em] text-violet-200">404</span>
        <h1 className="h-title m-0">Page not found</h1>
        <p className="m-0 text-muted">The link may be old, or the round expired after 24 hours.</p>
        <Link href="/" className="btn btn-primary">
          Back to the start
        </Link>
      </div>
    </Page>
  );
}
