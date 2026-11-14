import type { Pool } from 'pg';
import type { IntakeStore, Versioned } from './store';

export class PostgresStore implements IntakeStore {
  constructor(private pool: Pool) {}
  async read<T extends Versioned>(key: string): Promise<T | null> {
    if (key.startsWith('session:')) {
      const result = await this.pool.query('SELECT id,owner_id,version,quiz_answers,state FROM holdline_intake.profiles WHERE id=$1', [key.slice(8)]);
      const row = result.rows[0];
      return row ? { ...row.state, id: row.id, ownerId: row.owner_id, revision: row.version, profile: row.quiz_answers } as T : null;
    }
    const result = await this.pool.query('SELECT data FROM holdline_intake.control_records WHERE key=$1 AND expires_at > now()', [key]);
    return result.rows[0]?.data as T ?? null;
  }
  private state(value: Versioned) {
    const data = { ...value } as Record<string, unknown>;
    const profile = data.profile; const ownerId = data.ownerId;
    delete data.profile; delete data.ownerId; delete data.id; delete data.revision;
    return { data, profile, ownerId };
  }
  async create<T extends Versioned>(key: string, value: T, ttl: number) {
    if (key.startsWith('session:')) {
      const { data, profile, ownerId } = this.state(value);
      const result = await this.pool.query(
        "INSERT INTO holdline_intake.profiles(id,owner_id,version,quiz_answers,state,expires_at) VALUES($1,$2,$3,$4,$5,now()+$6*interval '1 second') ON CONFLICT(id) DO NOTHING",
        [key.slice(8), ownerId, value.revision, JSON.stringify(profile), JSON.stringify(data), ttl],
      );
      return result.rowCount === 1;
    }
    const result = await this.pool.query(
      "INSERT INTO holdline_intake.control_records(key,version,data,expires_at) VALUES($1,$2,$3,now()+$4*interval '1 second') ON CONFLICT(key) DO UPDATE SET version=EXCLUDED.version,data=EXCLUDED.data,expires_at=EXCLUDED.expires_at WHERE holdline_intake.control_records.expires_at <= now()",
      [key, value.revision, JSON.stringify(value), ttl],
    );
    return result.rowCount === 1;
  }
  async compareAndSet<T extends Versioned>(key: string, revision: number, value: T, ttl: number) {
    if (key.startsWith('session:')) {
      const { data, profile } = this.state(value);
      const result = await this.pool.query(
        "UPDATE holdline_intake.profiles SET version=$3,quiz_answers=$4,state=$5,expires_at=now()+$6*interval '1 second' WHERE id=$1 AND version=$2",
        [key.slice(8), revision, value.revision, JSON.stringify(profile), JSON.stringify(data), ttl],
      );
      return result.rowCount === 1;
    }
    const result = await this.pool.query(
      "UPDATE holdline_intake.control_records SET version=$3,data=$4,expires_at=now()+$5*interval '1 second' WHERE key=$1 AND version=$2 AND expires_at>now()",
      [key, revision, value.revision, JSON.stringify(value), ttl],
    );
    return result.rowCount === 1;
  }
  async activeIds(): Promise<string[]> {
    const result = await this.pool.query("SELECT id FROM holdline_intake.profiles WHERE state->>'mediaStatus' IN ('connecting','active','stopping') ORDER BY expires_at LIMIT 100");
    return result.rows.map(row => row.id as string);
  }
  async purgeExpired() {
    await this.pool.query('DELETE FROM holdline_intake.control_records WHERE expires_at<=now()');
    await this.pool.query("DELETE FROM holdline_intake.profiles WHERE expires_at<=now() AND state->>'mediaStatus' NOT IN ('connecting','active','stopping')");
  }
}
