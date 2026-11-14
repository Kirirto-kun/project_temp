import pg from 'pg';
import { readFile } from 'node:fs/promises';
export default async function setup(){
  const url=process.env.TEST_DATABASE_URL;
  if(!url||!new URL(url).pathname.endsWith('_test'))throw new Error('TEST_DATABASE_URL must name a dedicated database ending in _test.');
  const pool=new pg.Pool({connectionString:url});
  try{await pool.query(await readFile('db/001_intake.sql','utf8'));await pool.query('TRUNCATE holdline_intake.profiles,holdline_intake.control_records');}
  finally{await pool.end();}
}
