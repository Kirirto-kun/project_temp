/** Storage access that never throws (private mode, blocked site data, SSR). */
export function safeStorage(kind: 'local' | 'session'): Storage | null {
  try {
    if (typeof window === 'undefined') return null;
    const storage = kind === 'local' ? window.localStorage : window.sessionStorage;
    const probe = '__hl_probe__';
    storage.setItem(probe, '1');
    storage.removeItem(probe);
    return storage;
  } catch {
    return null;
  }
}

export function readVersioned<T>(kind: 'local' | 'session', key: string, version: number, isValid: (value: unknown) => value is T): T | null {
  const storage = safeStorage(kind);
  if (!storage) return null;
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { v?: number; data?: unknown };
    if (parsed.v !== version || !isValid(parsed.data)) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

export function writeVersioned(kind: 'local' | 'session', key: string, version: number, data: unknown): boolean {
  const storage = safeStorage(kind);
  if (!storage) return false;
  try {
    storage.setItem(key, JSON.stringify({ v: version, data }));
    return true;
  } catch {
    return false;
  }
}

export function removeKey(kind: 'local' | 'session', key: string): void {
  try {
    safeStorage(kind)?.removeItem(key);
  } catch {
    /* ignore */
  }
}
