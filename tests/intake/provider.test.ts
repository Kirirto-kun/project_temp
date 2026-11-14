import { expect, it } from 'vitest';
import { LiveAvatarProvider } from '@/onboarding/providers/liveavatar';
import { sealToken, openToken } from '@/onboarding/server/token-vault';
import type { Attempt } from '@/onboarding/server/service';

const encryptionKey = 'a'.repeat(64);
const now = Date.parse('2026-11-15T00:00:00Z');
const attempt: Attempt = { epoch: 1, mode: 'video', clientId: 'client', deadlineAt: '2026-11-15T00:05:00.000Z', provisioned: false, providerSessionId: null, credentialCiphertext: null, createdAt: now, lastHeartbeatAt: now };
it('mints a managed ElevenLabs session with a provider duration cap and encrypted credentials', async () => {
  const requests: {url:string;init:RequestInit}[]=[];
  const provider = new LiveAvatarProvider({ apiKey:'server-key',avatarId:'avatar',secretId:'secret',agentId:'coach',encryptionKey }, async (url,init) => {
    requests.push({url:String(url),init:init!});
    return Response.json({code:1000,data:{session_id:'provider-session',session_token:'secret-session-token'}});
  }, () => now);
  const binding = await provider.open(attempt,'intake-id');
  const body=JSON.parse(String(requests[0].init.body));
  expect(body).toMatchObject({mode:'LITE',avatar_id:'avatar',max_session_duration:300,video_settings:{encoding:'H264'},elevenlabs_agent_config:{secret_id:'secret',agent_id:'coach',dynamic_variables:{intake_id:'intake-id',provider_epoch:1}}});
  expect(body).not.toHaveProperty('livekit_config'); expect(body).not.toHaveProperty('openai_realtime_config');
  expect(JSON.stringify(binding)).not.toContain('secret-session-token');
  expect(await provider.credentials({...attempt,...binding})).toEqual({sessionToken:'secret-session-token'});
});
it('fails closed on malformed provider success and does not silently retry paid operations', async () => {
  let calls=0;
  const provider=new LiveAvatarProvider({apiKey:'key',avatarId:'a',secretId:'s',agentId:'c',encryptionKey},async()=>{calls++;return Response.json({code:1000,data:{}});},()=>now);
  await expect(provider.open(attempt,'id')).rejects.toMatchObject({code:'PROVIDER_UNAVAILABLE'});
  expect(calls).toBe(1);
});
it('requires a successful provider stop and scopes it to the stored session id', async () => {
  let request: RequestInit | undefined;
  const provider=new LiveAvatarProvider({apiKey:'key',avatarId:'a',secretId:'s',agentId:'c',encryptionKey},async(_url,init)=>{request=init;return Response.json({code:1000,data:null});},()=>now);
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
  const provider=new LiveAvatarProvider({apiKey:'key',avatarId:'a',secretId:'s',agentId:'c',encryptionKey},async(url)=>String(url).endsWith('/stop')?Response.json({code:4000},{status:400}):Response.json({code:1000,data:{id:'owned-session',end_at:'2026-11-15T00:00:00Z'}}),()=>now);
  await expect(provider.close({...attempt,providerSessionId:'owned-session'})).resolves.toBeUndefined();
});
