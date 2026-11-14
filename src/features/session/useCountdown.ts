'use client';

import { useEffect, useState } from 'react';

/** Seconds left until an ISO deadline; display only, the server enforces the limit. */
export function useCountdown(deadlineAt: string | null): number | null {
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    if (!deadlineAt) return;
    const tick = () => setLeft(Math.max(0, Math.ceil((new Date(deadlineAt).getTime() - Date.now()) / 1000)));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [deadlineAt]);
  return left;
}

export function formatClock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
