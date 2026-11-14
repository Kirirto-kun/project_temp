import { readFile } from 'node:fs/promises';
import pg from 'pg';
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
  await pool.query(await readFile(new URL('../db/001_intake.sql', import.meta.url), 'utf8'));
  console.log('Intake schema migrated. Existing application tables were left unchanged.');
} finally { await pool.end(); }
