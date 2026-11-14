import { z } from 'zod';
const config=z.object({LIVEAVATAR_API_KEY:z.string().min(1),ELEVENLABS_API_KEY:z.string().min(1)}).safeParse(process.env);
if(!config.success)throw new Error('Add LIVEAVATAR_API_KEY and ELEVENLABS_API_KEY to .env.local first.');
const response=await fetch('https://api.liveavatar.com/v1/secrets',{
  method:'POST',headers:{'X-API-KEY':config.data.LIVEAVATAR_API_KEY,'Content-Type':'application/json'},signal:AbortSignal.timeout(15000),
  body:JSON.stringify({secret_type:'ELEVENLABS_API_KEY',secret_name:'Holdline Coach',secret_value:config.data.ELEVENLABS_API_KEY}),
});
if(!response.ok)throw new Error('LiveAvatar rejected secret registration. Check your account, key permissions and subscription. No secret value is logged.');
const result=z.object({code:z.literal(1000),data:z.object({id:z.string().min(1)})}).parse(await response.json());
console.log('Secret registered. Add this reference ID (not an API key) to .env.local:');
console.log('LIVEAVATAR_ELEVENLABS_SECRET_ID='+result.data.id);
