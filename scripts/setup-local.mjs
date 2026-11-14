import { randomBytes } from 'node:crypto';
import { appendFile, readFile, writeFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';

const template = (await readFile(new URL('../.env.example', import.meta.url), 'utf8')).replace(/\r\n/g, '\n');
let existing;
try {
  existing = await readFile('.env.local', 'utf8');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

if (existing !== undefined) {
  const configured = parseEnv(existing);
  const missing = [...template.matchAll(/^([A-Z][A-Z0-9_]*)=.*$/gm)]
    .filter(([, key]) => !Object.hasOwn(configured, key));
  if (missing.length) {
    const newline = existing.includes('\r\n') ? '\r\n' : '\n';
    const separator = existing && !existing.endsWith('\n') ? newline : '';
    await appendFile('.env.local', separator + newline + '# Added by setup:local; existing values preserved.' + newline + missing.map(([line]) => line).join(newline) + newline);
    console.log('Added missing .env.local fields: ' + missing.map(([, key]) => key).join(', ') + '. Existing values preserved.');
  } else {
    console.log('.env.local already has all template fields; left unchanged.');
  }
} else {
  const password = randomBytes(24).toString('hex');
  const generated = {
    DEV_DB_PASSWORD: password,
    DATABASE_URL: `postgresql://holdline:${password}@127.0.0.1:54329/holdline`,
    TEST_DATABASE_URL: `postgresql://holdline:${password}@127.0.0.1:54329/holdline_test`,
    OWNER_SECRET: randomBytes(32).toString('hex'),
    TOKEN_ENCRYPTION_KEY: randomBytes(32).toString('hex'),
    MAINTENANCE_SECRET: randomBytes(32).toString('hex'),
  };
  const content = template.replace(/^([A-Z][A-Z0-9_]*)=.*$/gm, (line, key) => Object.hasOwn(generated, key) ? `${key}=${generated[key]}` : line);
  await writeFile('.env.local', content, { flag: 'wx' });
  console.log('Created ignored .env.local with random local-only credentials. Provider keys remain empty.');
}
