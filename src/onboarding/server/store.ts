export interface Versioned { revision: number }
export interface IntakeStore {
  read<T extends Versioned>(key: string): Promise<T | null>;
  create<T extends Versioned>(key: string, value: T, ttlSeconds: number): Promise<boolean>;
  compareAndSet<T extends Versioned>(key: string, revision: number, value: T, ttlSeconds: number): Promise<boolean>;
  activeIds(): Promise<string[]>;
  purgeExpired(): Promise<void>;
}
