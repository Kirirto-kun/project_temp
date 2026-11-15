import { readFile, writeFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { z } from 'zod';

const option=process.argv.indexOf('--env-file');
const path=option>=0?process.argv[option+1]:'.env.local';
if(!path)throw new Error('Provide a local env file path.');
const env={...process.env,...parseEnv(await readFile(path,'utf8'))};
const testDefaultVoice=process.argv.includes('--test-default-voice');
const required=testDefaultVoice?['LIVEAVATAR_API_KEY']:['LIVEAVATAR_API_KEY','ELEVENLABS_API_KEY'];
for(const key of required)if(!env[key])throw new Error('Fill '+key+' in your local env file.');
if(testDefaultVoice&&env.LIVEAVATAR_SANDBOX!=='true')throw new Error('--test-default-voice is only available in sandbox mode.');
const idSchema=z.string().min(1).max(120).regex(/^[a-zA-Z0-9_-]+$/);

async function save(name:string,value:string){
  let content=await readFile(path,'utf8');const pattern=new RegExp('^'+name+'=.*$','m');
  content=pattern.test(content)?content.replace(pattern,()=>name+'='+value):content+(content.endsWith('\n')?'':'\n')+name+'='+value+'\n';
  await writeFile(path,content);env[name]=value;
}
async function api(operation:string,endpoint:string,method='POST',body?:unknown){
  const response=await fetch('https://api.liveavatar.com'+endpoint,{method,headers:{'X-API-KEY':env.LIVEAVATAR_API_KEY!,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});
  if(!response.ok){
    const body=await response.json().catch(()=>({})) as {message?:string};
    if(body.message?.includes('voices_read'))throw new Error('The ElevenLabs API key needs voices_read (Voices → Read). Enable it, then rerun provider:configure.');
    throw new Error(operation+' failed (HTTP '+response.status+'). Check account access and permissions; no credential value was logged.');
  }
  const result=await response.json() as {code?:number;data?:Record<string,unknown>};
  if(result.code!==1000&&result.code!==100)throw new Error(operation+' was not acknowledged by LiveAvatar.');
  return result.data??{};
}
async function reference(key:string,operation:string,endpoint:string,body:unknown){
  if(env[key])return env[key]!;
  const data=await api(operation,endpoint,'POST',body);const id=idSchema.parse(data.id);
  await save(key,id);console.log(operation+' configured. Reference saved in '+path+'.');return id;
}

if(process.argv.includes('--refresh-secrets')){
  for(const key of ['LIVEAVATAR_ELEVENLABS_SECRET_ID','LIVEAVATAR_VOICE_ID'])await save(key,'');
}
if(testDefaultVoice){
  const data=await api('Read sandbox avatar','/v1/avatars/dd73ea75-1218-4ef3-92ce-606d5f7fbc0a','GET');
  const voice=data.default_voice as {id?:unknown}|undefined;
  await save('LIVEAVATAR_VOICE_ID',idSchema.parse(voice?.id));await save('LIVEAVATAR_VOICE_SOURCE','liveavatar-test');
  console.log('Using the built-in LiveAvatar voice for this sandbox transport test. ElevenLabs TTS is not being accepted by this test.');
}else{
const ttsSecret=await reference('LIVEAVATAR_ELEVENLABS_SECRET_ID','TTS secret','/v1/secrets',{secret_type:'ELEVENLABS_API_KEY',secret_name:'Holdline direct TTS',secret_value:env.ELEVENLABS_API_KEY});
if(env.LIVEAVATAR_VOICE_SOURCE==='liveavatar-test')await save('LIVEAVATAR_VOICE_ID','');
if(!env.ELEVENLABS_VOICE_ID){
  const response=await fetch('https://api.elevenlabs.io/v1/voices',{headers:{'xi-api-key':env.ELEVENLABS_API_KEY!},signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw new Error('Cannot list ElevenLabs voices. Grant voices_read or set ELEVENLABS_VOICE_ID.');
  const body=await response.json() as {voices?:{voice_id:string;name:string;category?:string}[]};
  const voices=body.voices?.filter(voice=>voice.category==='premade')??[];
  const voice=voices.find(item=>item.name==='George')??voices[0];
  if(!voice)throw new Error('Choose ELEVENLABS_VOICE_ID in your ElevenLabs account.');
  await save('ELEVENLABS_VOICE_ID',idSchema.parse(voice.voice_id));console.log('Selected a premade ElevenLabs voice.');
}
await reference('LIVEAVATAR_VOICE_ID','TTS voice','/v1/voices/third_party',{secret_id:ttsSecret,provider_voice_id:env.ELEVENLABS_VOICE_ID,name:'Holdline Alex'});
await save('LIVEAVATAR_VOICE_SOURCE','elevenlabs');
}
console.log('LiveAvatar FULL voice configured. Our server owns dialogue; no ElevenLabs Agent or vendor LLM context was created. No session started and no plan purchased. Restart the app and cleanup process after updating call flags.');
