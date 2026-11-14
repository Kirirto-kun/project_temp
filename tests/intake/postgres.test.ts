import { afterAll, beforeAll, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { PostgresStore } from '@/onboarding/server/postgres-store';

const url = process.env.TEST_DATABASE_URL;
if(url&&!new URL(url).pathname.endsWith('_test'))throw new Error('PostgreSQL integration tests require a dedicated _test database.');
const sqlTest = url ? it : it.skip;
const pool = new pg.Pool({ connectionString: url, max: 4 });
const store = new PostgresStore(pool);
beforeAll(async () => {
  if (!url) return;
  await pool.query(await readFile('db/001_intake.sql', 'utf8'));
  await pool.query('TRUNCATE holdline_intake.profiles, holdline_intake.control_records');
});
afterAll(() => pool.end());
sqlTest('performs atomic CAS across separate PostgreSQL connections and expires control records', async () => {
  await expect(store.create('test-cas', { revision: 0, balance: 100 }, 60)).resolves.toBe(true);
  await expect(store.create('test-cas', { revision: 0, balance: 999 }, 60)).resolves.toBe(false);
  const results = await Promise.all([10,20].map(amount => store.compareAndSet('test-cas', 0, { revision: 1, balance: 100 - amount }, 60)));
  expect(results.filter(Boolean)).toHaveLength(1);
  expect((await store.read<{revision:number;balance:number}>('test-cas'))?.balance).toBeOneOf([80,90]);
  await pool.query("UPDATE holdline_intake.control_records SET expires_at = now() - interval '1 second' WHERE key = 'test-cas'");
  expect(await store.read('test-cas')).toBeNull();
});
sqlTest('stores the shared quiz draft in profiles rather than a second private profile format', async () => {
  const id = '00000000-0000-4000-8000-000000000012';
  const value = { revision: 0, ownerId: 'owner', profile: { currentMinor: 9500000, currency: 'USD', period: 'year', moneyBasis: 'gross' }, id, mediaStatus: 'not_started' };
  await store.create('session:' + id, value, 86400);
  const result = await pool.query('SELECT quiz_answers, state FROM holdline_intake.profiles WHERE id=$1', [id]);
  expect(result.rows[0].quiz_answers).toEqual({ currentMinor: 9500000, currency: 'USD', period: 'year', moneyBasis: 'gross' });
  expect(result.rows[0].state).not.toHaveProperty('profile');
  expect(await store.read('session:' + id)).toEqual(value);
});
