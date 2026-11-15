import { expect, it } from 'vitest';
import { createIntakeApi } from '@/onboarding/server/http';
import { CallService, type CallProvider } from '@/onboarding/server/service';
import { ProfileControl } from '@/onboarding/server/profile-control';
import { DailyBudget } from '@/onboarding/server/budget';
import { MemoryStore } from './helpers/memory-store';

function fixture(available=true,avatarPreviewUrl:string|null=null) {
  const store=new MemoryStore();let paid=0;
  const provider:CallProvider={async open(){paid++;return{providerSessionId:'provider',credentialCiphertext:'encrypted'};},async close(){},async credentials(){return{sessionToken:'session-token'};}};
  const service=new CallService({store,provider,budget:new DailyBudget(store,{dailyCents:1000,attemptCents:100,concurrency:2,attemptsPerIp:3})});
  const api=createIntakeApi({service,profile:new ProfileControl(service),origin:'https://holdline.test',ownerSecret:'s'.repeat(64),maintenanceSecret:'m'.repeat(64),callsAvailable:async()=>available,avatarPreviewUrl});
  async function request(path:string[],method='POST',body:unknown={},cookie='',origin='https://holdline.test',key=crypto.randomUUID()) {
    return api(new Request('https://holdline.test/api/intake/'+path.join('/'),{method,headers:{Origin:origin,'Content-Type':'application/json','Idempotency-Key':key,...(cookie?{Cookie:cookie}:{})},...(method==='GET'||method==='DELETE'?{}:{body:JSON.stringify(body)})}),path);
  }
  const create=()=>request([],'POST',{mode:'video',locale:'en',consentVersion:1,consents:{audioAnalysis:false,visualAnalysis:false}});
  return{request,create,paid:()=>paid};
}
it('exposes only the local sandbox preview reference in public call config',async()=>{
 const f=fixture(true,'/intake/wayne-sandbox.webp');const response=await f.request(['config'],'GET');const body=await response.json();
 expect(body.avatarPreviewUrl).toBe('/intake/wayne-sandbox.webp');expect(JSON.stringify(body)).not.toContain('ownerSecret');expect(JSON.stringify(body)).not.toContain('sessionToken');
 const normal=fixture();expect((await(await normal.request(['config'],'GET')).json()).avatarPreviewUrl).toBeNull();
});
it('isolates guest drafts with a secure cookie and returns no provider identifiers',async()=>{
  const f=fixture();const response=await f.create();expect(response.status).toBe(201);
  const cookie=response.headers.get('Set-Cookie')!;expect(cookie).toContain('HttpOnly');expect(cookie).toContain('Secure');expect(cookie).toContain('SameSite=Lax');
  const view=await response.json();expect(view).not.toHaveProperty('ownerId');expect(view).not.toHaveProperty('attempt');expect(f.paid()).toBe(0);
  expect((await f.request([view.id],'GET',{},cookie)).status).toBe(200);
  expect((await f.request([view.id],'GET')).status).toBe(404);
  expect(response.headers.get('Cache-Control')).toContain('no-store');
});
it('rejects cross-origin mutations and oversized bodies before creating state',async()=>{
  const f=fixture();const wrong=await f.request([],'POST',{},'','https://attacker.test');expect(wrong.status).toBe(403);
  const huge=await f.request([],'POST',{data:'a'.repeat(40000)});expect(huge.status).toBe(413);expect(f.paid()).toBe(0);
});
it('keeps unconfigured calls unavailable while the persistent quick form works',async()=>{
  const f=fixture(false);const response=await f.create();const cookie=response.headers.get('Set-Cookie')!;const view=await response.json();
  const call=await f.request([view.id,'connect'],'POST',{expectedRevision:0,mode:'video',restart:false,clientId:crypto.randomUUID()},cookie);
  expect(call.status).toBe(503);expect(f.paid()).toBe(0);
  const patch=await f.request([view.id,'profile'],'PATCH',{expectedRevision:0,patch:{userRole:'Engineer'}},cookie);expect(patch.status).toBe(200);
  expect((await patch.json()).publicProfile.userRole).toBe('Engineer');
});
it('stops independently of stale profile revision and protects maintenance with service auth',async()=>{
  const f=fixture();const response=await f.create();const cookie=response.headers.get('Set-Cookie')!;const view=await response.json();
  await f.request([view.id,'connect'],'POST',{expectedRevision:0,mode:'video',restart:false,clientId:crypto.randomUUID()},cookie);
  const end=await f.request([view.id,'stop'],'POST',{reason:'user',expectedRevision:0},cookie);expect(end.status).toBe(200);expect((await end.json()).mediaStatus).toBe('closed');
  expect((await f.request(['maintenance'],'POST')).status).toBe(401);
});
