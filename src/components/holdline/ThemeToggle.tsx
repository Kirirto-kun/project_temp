'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import { useState } from 'react';
import { useHydrated } from '@/client/use-hydrated';

type ThemeChoice = 'auto' | 'light' | 'dark';
const ORDER: ThemeChoice[] = ['auto', 'light', 'dark'];

function readChoice(): ThemeChoice {
  try {
    const stored = localStorage.getItem('hl-theme');
    return stored === 'light' || stored === 'dark' ? stored : 'auto';
  } catch {
    return 'auto';
  }
}

export function ThemeToggle() {
  const hydrated = useHydrated();
  const [picked, setChoice] = useState<ThemeChoice | null>(null);
  const choice: ThemeChoice = picked ?? (hydrated ? readChoice() : 'auto');

  function cycle() {
    const next = ORDER[(ORDER.indexOf(choice) + 1) % ORDER.length]!;
    setChoice(next);
    const root = document.documentElement;
    if (next === 'auto') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', next);
    try {
      localStorage.setItem('hl-theme', next);
    } catch {
      /* storage blocked: theme still applies for this page */
    }
  }

  const Icon = choice === 'dark' ? Moon : choice === 'light' ? Sun : Monitor;
  return (
    <button type="button" onClick={cycle} className="btn btn-ghost min-h-[44px] px-3 text-[13px] font-medium" aria-label={`Theme: ${choice}. Change theme`}>
      <Icon size={18} strokeWidth={1.5} aria-hidden />
      <span className="hidden sm:inline">Theme: {choice}</span>
    </button>
  );
}
