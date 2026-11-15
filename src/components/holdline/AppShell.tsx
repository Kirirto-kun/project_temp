import Link from 'next/link';
import { SOURCE_CODE_URL } from '@/content/site';
import { cn } from '@/components/ui/cn';
import { Logo } from './Logo';
import { SiteNav } from './SiteNav';

type PageWidth = 'wide' | 'chat' | 'bleed';

/** The page column for a width: header, main and footer share it so every edge lines up. */
function columnClass(width: PageWidth) {
  return cn('page-col', width === 'chat' && 'page-col-chat');
}

/** Sticky header: a full-width blurred bar with a hairline, its content on the page column. */
export function SiteHeader({ width = 'wide' }: { width?: PageWidth }) {
  return (
    <header className="sticky top-0 z-40 border-b border-line backdrop-blur-xl backdrop-saturate-150" style={{ background: 'var(--glass)', paddingTop: 'env(safe-area-inset-top, 0px)' }}>
      <div className={cn(columnClass(width), 'flex h-16 items-center gap-6')}>
        <Link href="/" className="shrink-0 rounded-[10px] text-ink no-underline" aria-label="Holdline, home">
          <Logo size={28} />
        </Link>
        <SiteNav />
      </div>
    </header>
  );
}

const FOOTER_COLUMNS = [
  {
    title: 'Practise',
    links: [
      { href: '/intake', label: 'Talk to the coach' },
      { href: '/quiz', label: 'Quick form' },
      { href: '/example', label: 'Example debrief' },
    ],
  },
  {
    title: 'Holdline',
    links: [
      { href: '/plan', label: 'Your plan' },
      { href: '/pricing', label: 'Pricing' },
      { href: '/pricing#billing', label: 'Why was I charged?' },
    ],
  },
];

export function SiteFooter({ minimal = false }: { minimal?: boolean }) {
  if (minimal) {
    return (
      <footer className="mt-10 border-t border-line">
        <div className="page-col flex flex-wrap items-center gap-x-6 gap-y-2 py-5 text-[13px] text-muted">
          <span>Holdline · a practice simulator, not financial advice</span>
          <Link href="/example" className="text-muted">
            See an example debrief
          </Link>
          <Link href="/quiz" className="text-muted">
            Quick form
          </Link>
        </div>
      </footer>
    );
  }
  return (
    <footer className="relative mt-24 overflow-hidden border-t border-line bg-paper-subtle">
      <div className="page-col grid gap-10 pb-6 pt-14 sm:grid-cols-[minmax(0,1.4fr)_repeat(2,minmax(0,1fr))]">
        <div className="grid content-start gap-4">
          <Logo size={30} />
          <p className="m-0 max-w-[36ch] text-[14px] leading-6 text-muted">Rehearse the money conversation before it costs you. A practice simulator, not financial advice.</p>
        </div>
        {FOOTER_COLUMNS.map((column) => (
          <nav key={column.title} aria-label={column.title} className="grid content-start gap-3">
            <span className="label">{column.title}</span>
            {column.links.map((link) => (
              <Link key={link.href} href={link.href} className="w-fit text-[15px] text-ink-soft no-underline hover:text-hold-text">
                {link.label}
              </Link>
            ))}
          </nav>
        ))}
      </div>
      <div className="page-col flex flex-wrap items-center justify-between gap-3 pb-4 text-[13px] text-muted">
        <span>No sign-up. Your round lives in this browser.</span>
        <a href={SOURCE_CODE_URL} className="text-muted">
          Source code
        </a>
      </div>
      <div aria-hidden className="page-col pointer-events-none select-none">
        <div className="footer-wordmark translate-y-[18%] text-center text-[clamp(88px,21vw,272px)] font-extrabold leading-[0.8] tracking-[-0.07em]">Holdline</div>
      </div>
    </footer>
  );
}

/** Page frame. `bleed` hands full width to the page (landing; its sections use `.page-col`); `minimalHeader` keeps the funnel's footer short. */
export function Page({ children, width = 'wide', minimalHeader = false }: { children: React.ReactNode; width?: PageWidth; minimalHeader?: boolean }) {
  return (
    <div className="themed flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-raised focus:px-4 focus:py-2 focus:shadow-[var(--shadow-lift)]"
      >
        Skip to content
      </a>
      <SiteHeader width={width} />
      <main id="main" className={cn('flex-1', width !== 'bleed' && cn(columnClass(width), 'pb-12 pt-6 sm:pt-10'))}>
        {children}
      </main>
      <SiteFooter minimal={minimalHeader} />
    </div>
  );
}
