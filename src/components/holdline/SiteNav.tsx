'use client';

import { ArrowRight, Menu, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { Drawer } from 'vaul';
import { cn } from '@/components/ui/cn';
import { ThemeToggle } from './ThemeToggle';

export const NAV_LINKS = [
  { href: '/example', label: 'Example debrief' },
  { href: '/plan', label: 'Plan' },
  { href: '/pricing', label: 'Pricing' },
] as const;

/** Desktop links with the current page marked; the phone menu is a bottom sheet. */
export function SiteNav({ minimal }: { minimal: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <>
      {!minimal && (
        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          {NAV_LINKS.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'rounded-full px-3.5 py-2 text-[14px] font-medium no-underline transition-colors duration-200',
                  active ? 'bg-hold-tint text-hold-text' : 'text-ink-soft hover:bg-hold-tint hover:text-ink',
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
      )}

      <div className="ml-auto flex items-center gap-1">
        <ThemeToggle />
        {!minimal && (
          <>
            <Link href="/intake" className="btn btn-primary btn-sm hidden sm:inline-flex">
              Start practising <ArrowRight size={16} strokeWidth={2} className="arrow" aria-hidden />
            </Link>
            <Drawer.Root open={open} onOpenChange={setOpen}>
              <Drawer.Trigger className="btn btn-ghost btn-icon md:hidden" aria-label="Open menu">
                <Menu size={20} strokeWidth={1.75} aria-hidden />
              </Drawer.Trigger>
              <Drawer.Portal>
                <Drawer.Overlay className="fixed inset-0 z-50 bg-[rgba(17,14,36,0.4)] backdrop-blur-[2px]" />
                <Drawer.Content
                  className="fixed inset-x-0 bottom-0 z-50 flex flex-col rounded-t-[28px] bg-raised px-4 pt-3 text-ink shadow-[var(--shadow-lift)] outline-none"
                  style={{ paddingBottom: 'calc(20px + env(safe-area-inset-bottom, 0px))' }}
                >
                  <Drawer.Handle className="!mx-auto !mb-2 !h-1.5 !w-10 !rounded-full !bg-line-strong" />
                  <div className="flex items-center justify-between px-2 pb-2">
                    <Drawer.Title className="label">Menu</Drawer.Title>
                    <Drawer.Close className="btn btn-ghost btn-icon" aria-label="Close menu">
                      <X size={20} strokeWidth={1.75} aria-hidden />
                    </Drawer.Close>
                  </div>
                  <Drawer.Description className="sr-only">Pages of Holdline</Drawer.Description>
                  <nav aria-label="Mobile" className="grid gap-1">
                    {[{ href: '/', label: 'Home' }, ...NAV_LINKS, { href: '/quiz', label: 'Quick form' }].map((link) => (
                      <Link
                        key={link.href}
                        href={link.href}
                        onClick={() => setOpen(false)}
                        aria-current={pathname === link.href ? 'page' : undefined}
                        className={cn(
                          'flex min-h-[52px] items-center justify-between rounded-2xl px-4 text-[17px] font-semibold tracking-[-0.01em] no-underline active:scale-[0.98] transition-transform duration-150',
                          pathname === link.href ? 'bg-hold-tint text-hold-text' : 'text-ink',
                        )}
                      >
                        {link.label}
                        <ArrowRight size={18} strokeWidth={1.75} className="text-muted" aria-hidden />
                      </Link>
                    ))}
                  </nav>
                  <Link href="/intake" onClick={() => setOpen(false)} className="btn btn-primary btn-xl mt-4 !max-w-none">
                    Start practising
                  </Link>
                </Drawer.Content>
              </Drawer.Portal>
            </Drawer.Root>
          </>
        )}
      </div>
    </>
  );
}
