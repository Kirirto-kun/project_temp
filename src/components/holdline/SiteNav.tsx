'use client';

import { ArrowRight, Menu, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { Drawer } from 'vaul';
import { cn } from '@/components/ui/cn';
import { ThemeToggle } from './ThemeToggle';

type NavLink = { href: string; label: string; /** Other routes that belong to this section. */ also?: readonly string[] };

export const NAV_LINKS: readonly NavLink[] = [
  { href: '/intake', label: 'Practice', also: ['/quiz', '/session', '/debrief'] },
  { href: '/opponents', label: 'Counterparts' },
  { href: '/plan', label: 'My plan' },
  { href: '/pricing', label: 'Pricing' },
];

/** Extra links only in the phone menu (the desktop bar keeps to four). */
const MENU_EXTRA: readonly NavLink[] = [
  { href: '/example', label: 'Example debrief' },
  { href: '/quiz', label: 'Quick form' },
];

/** Routes where the visitor is already practising: the "Start practising" call to action would only interrupt. */
const IN_PRACTICE = ['/intake', '/quiz', '/session'];

function under(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function isActive(pathname: string, link: NavLink) {
  return under(pathname, link.href) || (link.also ?? []).some((href) => under(pathname, href));
}

/** Links with the current section marked, the theme toggle and the CTA; below md the links move into a bottom sheet. */
export function SiteNav() {
  const pathname = usePathname() ?? '/';
  const [open, setOpen] = useState(false);
  const showCta = !IN_PRACTICE.some((href) => under(pathname, href));

  return (
    <>
      <nav aria-label="Main" className="hidden items-center gap-0.5 md:flex">
        {NAV_LINKS.map((link) => {
          const active = isActive(pathname, link);
          return (
            <Link
              key={link.href}
              href={link.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'rounded-full px-3 py-2 text-[14.5px] font-medium tracking-[-0.01em] no-underline transition-colors duration-150',
                active ? 'bg-hold-tint text-hold-text' : 'text-ink-soft hover:bg-hold-tint hover:text-ink',
              )}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>

      <div className="ml-auto flex items-center gap-1.5">
        <span className={cn('hidden sm:block', !showCta && 'md:-mr-3')}>
          <ThemeToggle />
        </span>
        {showCta && (
          <Link href="/intake" className="btn btn-primary btn-sm hidden sm:inline-flex">
            Start practising <ArrowRight size={16} strokeWidth={2} className="arrow" aria-hidden />
          </Link>
        )}
        <Drawer.Root open={open} onOpenChange={setOpen}>
          <Drawer.Trigger className="btn btn-ghost btn-icon -mr-3 md:hidden" aria-label="Menu">
            <Menu size={22} strokeWidth={1.75} aria-hidden />
          </Drawer.Trigger>
          <Drawer.Portal>
            <Drawer.Overlay className="fixed inset-0 z-50 bg-[rgba(17,14,36,0.4)] backdrop-blur-[2px]" />
            <Drawer.Content
              className="fixed inset-x-0 bottom-0 z-50 flex max-h-[90dvh] flex-col rounded-t-[28px] bg-raised px-4 pt-3 text-ink shadow-[var(--shadow-lift)] outline-none"
              style={{ paddingBottom: 'calc(20px + env(safe-area-inset-bottom, 0px))' }}
            >
              <Drawer.Handle className="!mx-auto !mb-2 !h-1.5 !w-10 !rounded-full !bg-line-strong" />
              <div className="flex items-center justify-between gap-2 pb-2 pl-2">
                <Drawer.Title className="label">Menu</Drawer.Title>
                <div className="flex items-center gap-1">
                  <ThemeToggle />
                  <Drawer.Close className="btn btn-ghost btn-icon" aria-label="Close menu">
                    <X size={20} strokeWidth={1.75} aria-hidden />
                  </Drawer.Close>
                </div>
              </div>
              <Drawer.Description className="sr-only">Pages of Holdline</Drawer.Description>
              <nav aria-label="Main" className="grid gap-1 overflow-y-auto">
                {[...NAV_LINKS, ...MENU_EXTRA].map((link) => {
                  // The quick form has its own row here, so only it is marked on /quiz.
                  const active = under(pathname, '/quiz') ? link.href === '/quiz' : isActive(pathname, link);
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      onClick={() => setOpen(false)}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'flex min-h-[52px] items-center justify-between rounded-2xl px-4 text-[17px] font-semibold tracking-[-0.01em] no-underline transition-transform duration-150 active:scale-[0.98]',
                        active ? 'bg-hold-tint text-hold-text' : 'text-ink',
                      )}
                    >
                      {link.label}
                      <ArrowRight size={18} strokeWidth={1.75} className="text-muted" aria-hidden />
                    </Link>
                  );
                })}
              </nav>
              {showCta && (
                <Link href="/intake" onClick={() => setOpen(false)} className="btn btn-primary btn-xl mt-4 !max-w-none">
                  Start practising
                </Link>
              )}
            </Drawer.Content>
          </Drawer.Portal>
        </Drawer.Root>
      </div>
    </>
  );
}
