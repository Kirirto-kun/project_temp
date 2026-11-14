'use client';

import { useMemo, useState } from 'react';
import { loadDraft, saveDraft, type DraftState } from '@/client/storage/draft';
import { useHydrated } from '@/client/use-hydrated';

type Updater = DraftState | ((current: DraftState) => DraftState);

/** Draft shared by the setup screens; null until the browser storage can be read. */
export function useDraft(): [DraftState | null, (next: Updater) => void] {
  const hydrated = useHydrated();
  const initial = useMemo(() => (hydrated ? loadDraft() : null), [hydrated]);
  const [override, setOverride] = useState<DraftState | null>(null);
  const state = override ?? initial;
  const update = (next: Updater) => {
    // Chain on the latest pending value so consecutive updates in one event do not overwrite each other.
    setOverride((previous) => {
      const base = previous ?? initial ?? loadDraft();
      const value = typeof next === 'function' ? next(base) : next;
      saveDraft(value);
      return value;
    });
  };
  return [state, update];
}
