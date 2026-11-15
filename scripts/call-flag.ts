import pg from 'pg';
const enabled=!process.argv.includes('--off');
if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL is required.');
if(enabled){
  for(const name of ['LIVEAVATAR_API_KEY','LIVEAVATAR_AVATAR_ID','LIVEAVATAR_VOICE_ID'])if(!process.env[name])throw new Error('Complete the provider values in .env.local first.');
  if(!process.env.OPENAI_API_KEY&&!process.env.ANTHROPIC_API_KEY)throw new Error('Configure at least one direct model API key.');
  if(process.env.LIVEAVATAR_VOICE_SOURCE==='liveavatar-test'&&process.env.LIVEAVATAR_SANDBOX!=='true')throw new Error('The built-in test voice is allowed only in sandbox. Configure the product voice first.');
  if(process.env.AVATAR_INTAKE_ENABLED!=='true')throw new Error('Set AVATAR_INTAKE_ENABLED=true in .env.local first.');
}
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL});
try {
  const result=await pool.query("UPDATE holdline_intake.feature_flags SET enabled=$1 WHERE key='avatar_intake'",[enabled]);
  if(result.rowCount!==1)throw new Error('Run the intake database migration first.');
  console.log(enabled?'Avatar flag enabled. Restart the service, keep cleanup running, then perform the real-call checklist.':'Avatar flag disabled. Cleanup terminates remaining calls on its next pass.');
}finally{await pool.end();}
