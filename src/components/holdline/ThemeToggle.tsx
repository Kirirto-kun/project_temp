'use client';

import { Moon, Sun } from 'lucide-react';
import { useState } from 'react';
import { useHydrated } from '@/client/use-hydrated';

type Theme = 'light' | 'dark';

function readTheme(): Theme {
  try {
    return localStorage.getItem('hl-theme') === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

/** Light by default; dark only when picked. The icons cross-fade through a short blur so the swap reads as one object. */
export function ThemeToggle() {
  const hydrated = useHydrated();
  const [picked, setPicked] = useState<Theme | null>(null);
  const theme: Theme = picked ?? (hydrated ? readTheme() : 'light');
  const next: Theme = theme === 'dark' ? 'light' : 'dark';

  function toggle() {
    setPicked(next);
    const root = document.documentElement;
    if (next === 'dark') root.setAttribute('data-theme', 'dark');
    else root.removeAttribute('data-theme');
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', next === 'dark' ? '#0b0916' : '#ffffff');
    try {
      localStorage.setItem('hl-theme', next);
    } catch {
      /* storage blocked: the theme still applies on this page */
    }
  }

  const icon = 'absolute inset-0 m-auto transition-[opacity,transform,filter] duration-200 ease-[var(--ease-out)] motion-reduce:transition-opacity';
  return (
    <button type="button" onClick={toggle} className="btn btn-ghost btn-icon" aria-label={`Switch to ${next} theme`}>
      <span className="relative block h-5 w-5" aria-hidden>
        <Sun size={20} strokeWidth={1.75} className={`${icon} ${theme === 'light' ? 'opacity-100' : '-rotate-45 scale-50 opacity-0 blur-[2px]'}`} />
        <Moon size={20} strokeWidth={1.75} className={`${icon} ${theme === 'dark' ? 'opacity-100' : 'rotate-45 scale-50 opacity-0 blur-[2px]'}`} />
      </span>
    </button>
  );
}
