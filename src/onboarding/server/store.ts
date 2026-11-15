import 'server-only';
import { ApiError } from '@/server/http';
import type { KeyValueStore } from '@/server/storage/kv';
import { readJson, updateJson } from '@/server/storage/kv';
import type { IntakeSession } from '../contracts';

export const INTAKE_TTL_SECONDS = 24 * 60 * 60;
const key = (id: string) => `int:${id}`;

function ttl(session: IntakeSession, now: Date): number {
  return Math.max(60, Math.ceil((new Date(session.createdAt).getTime() + INTAKE_TTL_SECONDS * 1_000 - now.getTime()) / 1_000));
}

/** Owner-bound intake drafts with compare-and-set on the whole aggregate. */
export class IntakeStore {
  constructor(
    private readonly kv: KeyValueStore,
    private readonly now: () => Date,
  ) {}

  async read(id: string): Promise<IntakeSession | null> {
    if (!/^int_[\w-]{22}$/.test(id)) return null;
    return readJson<IntakeSession>(this.kv, key(id));
  }

  async readOwned(id: string, ownerId: string): Promise<IntakeSession> {
    const session = await this.read(id);
    if (!session || session.ownerId !== ownerId) throw new ApiError('NOT_FOUND', 'This coach session is not available. Drafts expire after 24 hours.');
    return session;
  }

  async create(session: IntakeSession): Promise<void> {
    if (!(await this.kv.compareAndSet(key(session.id), null, JSON.stringify(session), INTAKE_TTL_SECONDS))) throw new Error('Intake id collision');
  }

  /** Read-modify-write; `mutate` returns null to leave the stored state unchanged. Revision is bumped here. */
  async update(id: string, mutate: (current: IntakeSession) => IntakeSession | null): Promise<{ session: IntakeSession; written: boolean }> {
    let seconds = 60;
    const result = await updateJson<IntakeSession>(
      this.kv,
      key(id),
      (current) => {
        if (!current) return null;
        seconds = ttl(current, this.now());
        const next = mutate(current);
        return next ? { ...next, revision: current.revision + 1 } : null;
      },
      // A getter: `seconds` is only known once `mutate` has read the current session, so evaluate it at write time.
      {
        get ttlSeconds() {
          return seconds;
        },
      },
    );
    if (!result.value) throw new ApiError('EXPIRED', 'This coach session has expired.');
    return { session: result.value, written: result.written };
  }

  async delete(id: string): Promise<void> {
    await this.kv.del(key(id));
  }
}
