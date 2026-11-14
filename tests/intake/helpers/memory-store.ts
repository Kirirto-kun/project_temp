import type { IntakeStore, Versioned } from '@/onboarding/server/store';

export class MemoryStore implements IntakeStore {
  private records = new Map<string, { value: Versioned; expires: number }>();
  constructor(private now = Date.now) {}
  async read<T extends Versioned>(key: string): Promise<T | null> {
    const record = this.records.get(key);
    return record && record.expires > this.now() ? structuredClone(record.value) as T : null;
  }
  async create<T extends Versioned>(key: string, value: T, ttl: number) {
    const record = this.records.get(key);
    if (record && record.expires > this.now()) return false;
    this.records.set(key, { value: structuredClone(value), expires: this.now() + ttl * 1000 }); return true;
  }
  async compareAndSet<T extends Versioned>(key: string, revision: number, value: T, ttl: number) {
    const record = this.records.get(key);
    if (!record || record.expires <= this.now() || record.value.revision !== revision) return false;
    this.records.set(key, { value: structuredClone(value), expires: this.now() + ttl * 1000 }); return true;
  }
  async activeIds() { return [...this.records.keys()].filter(k => k.startsWith('session:')).map(k => k.slice(8)); }
  async purgeExpired() { for (const [key,value] of this.records) if (value.expires <= this.now()) this.records.delete(key); }
}
