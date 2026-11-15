import { expect, it } from 'vitest';
import { LiveAvatarProvider } from '@/onboarding/providers/liveavatar';
import { sealToken, openToken } from '@/onboarding/server/token-vault';
import type { Attempt } from '@/onboarding/server/service';

const encryptionKey = 'a'.repeat(64);
const now = Date.parse('2026-11-15T00:00:00Z');
const config={apiKey:'key',avatarId:'avatar',voiceId:'voice',encryptionKey};
const attempt: Attempt = { epoch: 1, mode: 'video', clientId: 'client', deadlineAt: '2026-11-15T00:05:00.000Z', provisioned: false, providerSessionId: null, credentialCiphertext: null, createdAt: now, lastHeartbeatAt: now };
it('mints FULL listening mode with a TTS voice, no vendor LLM context, and encrypted credentials', async () => {
  const requests: {url:string;init:RequestInit}[]=[];
  const provider = new LiveAvatarProvider(config, async (url,init) => {
    requests.push({url:String(url),init:init!});
    return Response.json({code:1000,data:{session_id:'provider-session',session_token:'secret-session-token'}});
  }, () => now);
  const binding = await provider.open(attempt);
  const body=JSON.parse(String(requests[0].init.body));
  expect(body).toMatchObject({mode:'FULL',avatar_id:'avatar',max_session_duration:300,video_settings:{encoding:'H264'},avatar_persona:{voice_id:'voice',language:'en'}});
  expect(body.avatar_persona).not.toHaveProperty('context_id');expect(body).not.toHaveProperty('llm_configuration_id');
  expect(body).not.toHaveProperty('elevenlabs_agent_config');
  expect(body).not.toHaveProperty('livekit_config'); expect(body).not.toHaveProperty('openai_realtime_config');
  expect(JSON.stringify(binding)).not.toContain('secret-session-token');
  expect(await provider.credentials({...attempt,...binding})).toEqual({sessionToken:'secret-session-token'});
});
it('fails closed on malformed provider success and does not silently retry paid operations', async () => {
  let calls=0;
  const provider=new LiveAvatarProvider(config,async()=>{calls++;return Response.json({code:1000,data:{}});},()=>now);
  await expect(provider.open(attempt)).rejects.toMatchObject({code:'PROVIDER_UNAVAILABLE'});
  expect(calls).toBe(1);
});
it('requires a successful provider stop and scopes it to the stored session id', async () => {
  let request: RequestInit | undefined;
  const provider=new LiveAvatarProvider(config,async(_url,init)=>{request=init;return Response.json({code:1000,data:null});},()=>now);
  await provider.close({...attempt,providerSessionId:'owned-session'});
  expect(JSON.parse(String(request?.body))).toEqual({session_id:'owned-session',reason:'USER_CLOSED'});
  expect(new Headers(request?.headers).get('X-API-KEY')).toBe('key');
});
it('authenticates encrypted tokens and rejects tampering or a swapped session binding', () => {
  const sealed=sealToken('secret',encryptionKey,'session-a');
  expect(openToken(sealed,encryptionKey,'session-a')).toBe('secret');
  expect(()=>openToken(sealed,encryptionKey,'session-b')).toThrow();
  expect(()=>openToken(sealed.slice(0,-4)+'xxxx',encryptionKey,'session-a')).toThrow();
});
it('verifies provider history when the SDK already ended a session',async()=>{
  const provider=new LiveAvatarProvider(config,async(url)=>String(url).endsWith('/stop')?Response.json({code:4000},{status:400}):Response.json({code:1000,data:{id:'owned-session',end_at:'2026-11-15T00:00:00Z'}}),()=>now);
  await expect(provider.close({...attempt,providerSessionId:'owned-session'})).resolves.toBeUndefined();
});
it('uses the designated free sandbox avatar and limits its duration to sixty seconds',async()=>{
 let body:Record<string,unknown>={};
 const provider=new LiveAvatarProvider({...config,sandbox:true},async(_url,init)=>{body=JSON.parse(String(init?.body));return Response.json({code:1000,data:{session_id:'sandbox-session',session_token:'sandbox-token'}});},()=>now);
 await provider.open(attempt);expect(body).toMatchObject({mode:'FULL',is_sandbox:true,avatar_id:'dd73ea75-1218-4ef3-92ce-606d5f7fbc0a',max_session_duration:60});
});
