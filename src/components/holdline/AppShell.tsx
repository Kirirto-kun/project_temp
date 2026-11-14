import Link from 'next/link';
import { ThemeToggle } from './ThemeToggle';

export function SiteHeader({ minimal = false }: { minimal?: boolean }) {
  return (
    <header className="sticky top-0 z-10 border-b border-line bg-paper">
      <div className="mx-auto flex max-w-[1040px] items-center gap-4 px-4 py-2">
        <Link href="/" className="mr-auto text-ink no-underline" style={{ font: '700 18px var(--font-display)', letterSpacing: '-0.01em' }}>
          Holdline
        </Link>
        {!minimal && (
          <nav aria-label="Main" className="hidden gap-4 text-[14px] font-medium sm:flex">
            <Link href="/example" className="text-muted no-underline hover:text-ink">
              Example debrief
            </Link>
            <Link href="/plan" className="text-muted no-underline hover:text-ink">
              Plan
            </Link>
            <Link href="/pricing" className="text-muted no-underline hover:text-ink">
              Pricing
            </Link>
          </nav>
        )}
        <ThemeToggle />
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-line">
      <div className="mx-auto flex max-w-[1040px] flex-wrap gap-x-6 gap-y-2 px-4 py-6 text-[14px] text-muted">
        <span>Holdline · a practice simulator, not financial advice</span>
        <Link href="/pricing#billing" className="text-muted">
          Why was I charged?
        </Link>
        <Link href="/example" className="text-muted">
          See an example debrief
        </Link>
        <Link href="/quiz" className="text-muted">
          Quick form
        </Link>
        <a href="https://github.com/azekowka/project_temp" className="text-muted">
          Source code
        </a>
      </div>
    </footer>
  );
}

/** Page frame. `theme` forces a scope: the landing runs dark, the funnel light. */
export function Page({ children, theme, width = 'wide', minimalHeader = false }: { children: React.ReactNode; theme?: 'light' | 'dark'; width?: 'wide' | 'chat'; minimalHeader?: boolean }) {
  return (
    <div data-theme={theme} className="themed min-h-dvh">
      <SiteHeader minimal={minimalHeader} />
      <main id="main" className={`mx-auto px-4 pb-16 pt-6 ${width === 'chat' ? 'max-w-[720px]' : 'max-w-[1040px]'}`}>
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
