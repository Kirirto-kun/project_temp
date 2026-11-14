import { randomBytes } from 'node:crypto';
import { access, writeFile } from 'node:fs/promises';

try {
  await access('.env.local');
  console.log('.env.local exists; left unchanged.');
} catch {
  const password = randomBytes(24).toString('hex');
  await writeFile('.env.local', [
    'APP_ORIGIN=http://localhost:3000',
    `DEV_DB_PASSWORD=${password}`,
    `DATABASE_URL=postgresql://holdline:${password}@127.0.0.1:54329/holdline`,
    `TEST_DATABASE_URL=postgresql://holdline:${password}@127.0.0.1:54329/holdline_test`,
    `OWNER_SECRET=${randomBytes(32).toString('hex')}`,
    `TOKEN_ENCRYPTION_KEY=${randomBytes(32).toString('hex')}`,
    `MAINTENANCE_SECRET=${randomBytes(32).toString('hex')}`,
    'AVATAR_INTAKE_ENABLED=false', 'LIVEAVATAR_API_KEY=', 'LIVEAVATAR_AVATAR_ID=',
    'LIVEAVATAR_ELEVENLABS_SECRET_ID=', 'ELEVENLABS_COACH_AGENT_ID=',
    'INTAKE_DAILY_BUDGET_CENTS=1000', 'INTAKE_ATTEMPT_RESERVE_CENTS=100',
    'INTAKE_MAX_CONCURRENCY=2', '',
  ].join('\n'), { flag: 'wx' });
  console.log('Created ignored .env.local with random local-only credentials. Provider keys remain empty.');
}
