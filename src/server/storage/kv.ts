/**
 * Minimal key-value contract the platform needs: TTL, set-if-absent, counters and an atomic
 * compare-and-set on the full stored value. Redis/Upstash in production; the in-memory
 * implementation is for development, tests and an explicitly chosen single-process demo.
 */
export interface KeyValueStore {
  readonly kind: 'memory' | 'redis';
  readonly durable: boolean;
  get(key: string): Promise<string | null>;
  /** Returns false when `nx` is set and the key already exists. */
  set(key: string, value: string, options?: { ttlSeconds?: number; nx?: boolean }): Promise<boolean>;
  del(key: string): Promise<void>;
  /** Atomically adds `by` and returns the new value; sets the TTL when the key is created. */
  incrBy(key: string, by: number, ttlSeconds?: number): Promise<number>;
  /** Writes `value` only if the current value equals `expected` (null = must not exist). */
  compareAndSet(key: string, expected: string | null, value: string, ttlSeconds?: number): Promise<boolean>;
  /** Deletes the key only if it still holds `expected`. */
  compareAndDelete(key: string, expected: string): Promise<boolean>;
  /** Keys with a prefix (memory: exact scan; redis: SCAN). Used by maintenance only. */
  scan(prefix: string, limit?: number): Promise<string[]>;
}

interface Entry {
  value: string;
  expiresAt: number | null;
}

export class MemoryKV implements KeyValueStore {
  readonly kind = 'memory' as const;
  readonly durable = false;
  private readonly data = new Map<string, Entry>();
  constructor(private readonly now: () => number = Date.now) {}

  private live(key: string): Entry | null {
    const entry = this.data.get(key);
    if (!entry) return null;
    if (entry.expiresAt !== null && entry.expiresAt <= this.now()) {
      this.data.delete(key);
      return null;
    }
    return entry;
  }

  private expiry(ttlSeconds?: number): number | null {
    return ttlSeconds && ttlSeconds > 0 ? this.now() + ttlSeconds * 1_000 : null;
  }

  async get(key: string) {
    return this.live(key)?.value ?? null;
  }

  async set(key: string, value: string, options: { ttlSeconds?: number; nx?: boolean } = {}) {
    if (options.nx && this.live(key)) return false;
    this.data.set(key, { value, expiresAt: this.expiry(options.ttlSeconds) });
    return true;
  }

  async del(key: string) {
    this.data.delete(key);
  }

  async incrBy(key: string, by: number, ttlSeconds?: number) {
    const entry = this.live(key);
    const next = (entry ? Number(entry.value) : 0) + by;
    this.data.set(key, { value: String(next), expiresAt: entry ? entry.expiresAt : this.expiry(ttlSeconds) });
    return next;
  }

  async compareAndSet(key: string, expected: string | null, value: string, ttlSeconds?: number) {
    const current = this.live(key)?.value ?? null;
    if (current !== expected) return false;
    this.data.set(key, { value, expiresAt: this.expiry(ttlSeconds) });
    return true;
  }

  async compareAndDelete(key: string, expected: string) {
    if ((this.live(key)?.value ?? null) !== expected) return false;
    this.data.delete(key);
    return true;
  }

  async scan(prefix: string, limit = 1_000) {
    const out: string[] = [];
    for (const key of this.data.keys()) {
      if (key.startsWith(prefix) && this.live(key)) out.push(key);
      if (out.length >= limit) break;
    }
    return out;
  }
}

const CAS_SCRIPT = `local cur = redis.call('GET', KEYS[1])
if ((ARGV[1] == '0' and cur == false) or (ARGV[1] == '1' and cur == ARGV[2])) then
  if tonumber(ARGV[4]) > 0 then redis.call('SET', KEYS[1], ARGV[3], 'EX', ARGV[4]) else redis.call('SET', KEYS[1], ARGV[3]) end
  return 1
end
return 0`;

const CAD_SCRIPT = `if redis.call('GET', KEYS[1]) == ARGV[1] then redis.call('DEL', KEYS[1]) return 1 end return 0`;

const INCR_SCRIPT = `local v = redis.call('INCRBY', KEYS[1], ARGV[1])
if tonumber(ARGV[2]) > 0 and redis.call('TTL', KEYS[1]) < 0 then redis.call('EXPIRE', KEYS[1], ARGV[2]) end
return v`;

export class UpstashKV implements KeyValueStore {
  readonly kind = 'redis' as const;
  readonly durable = true;
  constructor(
    private readonly url: string,
    private readonly token: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private async command<T>(args: (string | number)[]): Promise<T> {
    const response = await this.fetchImpl(this.url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(args.map(String)),
      cache: 'no-store',
    });
    const body = (await response.json().catch(() => null)) as { result?: T; error?: string } | null;
    if (!response.ok || !body || body.error) throw new Error(`Redis error: ${body?.error ?? response.status}`);
    return body.result as T;
  }

  async get(key: string) {
    return (await this.command<string | null>(['GET', key])) ?? null;
  }

  async set(key: string, value: string, options: { ttlSeconds?: number; nx?: boolean } = {}) {
    const args: (string | number)[] = ['SET', key, value];
    if (options.ttlSeconds && options.ttlSeconds > 0) args.push('EX', options.ttlSeconds);
    if (options.nx) args.push('NX');
    return (await this.command<string | null>(args)) === 'OK';
  }

  async del(key: string) {
    await this.command(['DEL', key]);
  }

  async incrBy(key: string, by: number, ttlSeconds?: number) {
    return Number(await this.command<number>(['EVAL', INCR_SCRIPT, 1, key, by, ttlSeconds ?? 0]));
  }

  async compareAndSet(key: string, expected: string | null, value: string, ttlSeconds?: number) {
    const result = await this.command<number>(['EVAL', CAS_SCRIPT, 1, key, expected === null ? '0' : '1', expected ?? '', value, ttlSeconds ?? 0]);
    return Number(result) === 1;
  }

  async compareAndDelete(key: string, expected: string) {
    return Number(await this.command<number>(['EVAL', CAD_SCRIPT, 1, key, expected])) === 1;
  }

  async scan(prefix: string, limit = 1_000) {
    const out: string[] = [];
    let cursor = '0';
    do {
      const [next, keys] = await this.command<[string, string[]]>(['SCAN', cursor, 'MATCH', `${prefix}*`, 'COUNT', 200]);
      cursor = next;
      out.push(...keys);
    } while (cursor !== '0' && out.length < limit);
    return out.slice(0, limit);
  }
}

/** Read-modify-write with CAS and bounded retries. `mutate` returning null aborts without writing. */
export async function updateJson<T>(
  kv: KeyValueStore,
  key: string,
  mutate: (current: T | null) => T | null | Promise<T | null>,
  options: { ttlSeconds?: number | ((next: T) => number); retries?: number } = {},
): Promise<{ value: T | null; written: boolean }> {
  const retries = options.retries ?? 5;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const raw = await kv.get(key);
    const current = raw === null ? null : (JSON.parse(raw) as T);
    const next = await mutate(current);
    if (next === null) return { value: current, written: false };
    // A TTL function is evaluated after `mutate`, so it sees the stored aggregate, not a default.
    const ttl = typeof options.ttlSeconds === 'function' ? options.ttlSeconds(next) : options.ttlSeconds;
    if (await kv.compareAndSet(key, raw, JSON.stringify(next), ttl)) return { value: next, written: true };
  }
  throw new Error(`Concurrent update conflict on ${key.split(':')[0]}`);
}

export async function readJson<T>(kv: KeyValueStore, key: string): Promise<T | null> {
  const raw = await kv.get(key);
  return raw === null ? null : (JSON.parse(raw) as T);
}
