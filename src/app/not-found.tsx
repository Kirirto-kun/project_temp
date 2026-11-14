import Link from 'next/link';
import { Page } from '@/components/holdline/AppShell';

export default function NotFound() {
  return (
    <Page>
      <h1 className="h-title m-0">Page not found</h1>
      <p className="text-muted">The link may be old, or the round expired after 24 hours.</p>
      <Link href="/" className="btn btn-primary">
        Back to the start
      </Link>
    </Page>
  );
}
