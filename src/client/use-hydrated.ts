'use client';

import { useSyncExternalStore } from 'react';

const subscribe = () => () => undefined;

/** False during server rendering and hydration, true afterwards. Lets components read browser storage safely. */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
