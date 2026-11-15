import 'server-only';
import { LIMITS, type SessionState } from '@/contracts/domain';
import type { KeyValueStore } from './kv';
import { readJson, updateJson } from './kv';

const key = (id: string) => `ses:${id}`;

function ttlFor(session: Pick<SessionState, 'startedAt'>, now: Date): number {
  const expiresAt = new Date(session.startedAt).getTime() + LIMITS.sessionRetentionSeconds * 1_000;
  return Math.max(60, Math.ceil((expiresAt - now.getTime()) / 1_000));
}

export class SessionRepo {
  constructor(
    private readonly kv: KeyValueStore,
    private readonly now: () => Date,
  ) {}

  async read(id: string): Promise<SessionState | null> {
    if (!/^ses_[\w-]{22}$/.test(id)) return null;
    return readJson<SessionState>(this.kv, key(id));
  }

  async create(session: SessionState): Promise<void> {
    const ok = await this.kv.compareAndSet(key(session.id), null, JSON.stringify(session), ttlFor(session, this.now()));
    if (!ok) throw new Error('Session id collision');
  }

  /**
   * Atomic read-modify-write. `mutate` returns the next state (its version is bumped here) or
   * null to leave the stored state unchanged.
   */
  async update(id: string, mutate: (current: SessionState) => SessionState | null): Promise<{ session: SessionState; written: boolean }> {
    const result = await updateJson<SessionState>(
      this.kv,
      key(id),
      (current) => {
        if (!current) return null;
        const next = mutate(current);
        return next ? { ...next, version: current.version + 1 } : null;
      },
      // Computed per write from startedAt; a number captured before `mutate` ran made every update expire in 60s.
      { ttlSeconds: (next) => ttlFor(next, this.now()) },
    );
    if (!result.value) throw new Error('Session disappeared during update');
    return { session: result.value, written: result.written };
  }
}

export const turnLockKey = (sessionId: string) => `lock:turn:${sessionId}`;
