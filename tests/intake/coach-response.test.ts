import { expect,it } from 'vitest';
import { CallService } from '@/onboarding/server/service';
import { ProfileControl } from '@/onboarding/server/profile-control';
import { DailyBudget } from '@/onboarding/server/budget';
import { createCoachCallback } from '@/onboarding/server/coach-callback';
import { createCoachResponse } from '@/onboarding/server/coach-response';
import { MemoryStore } from './helpers/memory-store';

const clientId='00000000-0000-4000-8000-000000000001';
const otherClient='00000000-0000-4000-8000-000000000002';
const secret='local-test-internal-binding-that-is-long-enough';const bearer='local-test-internal-bearer-that-is-long-enough';
async function fixture(){
 const store=new MemoryStore();let calls=0;
 const service=new CallService({store,budget:new DailyBudget(store,{dailyCents:1000,attemptCents:100,concurrency:2,attemptsPerIp:3}),provider:{async open(){return{providerSessionId:'test-provider',credentialCiphertext:'encrypted'};},async close(){},async credentials(){return{sessionToken:'test-session-token'};}}});
 const view=await service.create('owner','create-response',{mode:'video',locale:'en',consentVersion:1,consents:{audioAnalysis:false,visualAnalysis:false}});
 await service.connect('owner',view.id,'connect-response','ip',{mode:'video',clientId,expectedRevision:view.revision,restart:false});
 const profile=new ProfileControl(service);
 await profile.event('owner',view.id,{clientId,providerEpoch:1,eventId:'event-1',type:'transcript',transcript:{role:'user',turnId:'user-1',text:'I want to explain a boundary to my friend',interrupted:false}});
 const callback=createCoachCallback({service,profile,bearerSecret:bearer,bindingSecret:secret,model:{async complete(){calls++;return{reply:'What do you want your friend to understand?',patch:{kind:'relationship',goal:'Explain my boundary'},action:'continue'};}}});
 return{service,profile,callback,id:view.id,respond:createCoachResponse({service,callback,bearerSecret:bearer,bindingSecret:secret}),calls:()=>calls};
}
it('runs only a committed user turn through internal signed orchestration and returns the saved view',async()=>{
 const f=await fixture();const input={clientId,providerEpoch:1,turnId:'user-1'};
 const first=await f.respond('owner',f.id,input,new AbortController().signal);
 expect(first.reply).toContain('your friend');expect(first.view.publicProfile.goal).toBe('Explain my boundary');expect(first.view.confirmed).toBe(false);
 await f.profile.event('owner',f.id,{clientId,providerEpoch:1,eventId:'event-2',type:'transcript',transcript:{role:'assistant',turnId:'assistant-1',text:first.reply,interrupted:false}});
 await f.respond('owner',f.id,input,new AbortController().signal);expect(f.calls()).toBe(1);
});
it('rejects a foreign owner, another client, stale epoch and nonexistent turn before generation',async()=>{
 const f=await fixture();const signal=new AbortController().signal;const input={clientId,providerEpoch:1,turnId:'user-1'};
 await expect(f.respond('foreign',f.id,input,signal)).rejects.toMatchObject({status:404});
 await expect(f.respond('owner',f.id,{...input,clientId:otherClient},signal)).rejects.toMatchObject({status:409});
 await expect(f.respond('owner',f.id,{...input,providerEpoch:2},signal)).rejects.toMatchObject({status:409});
 await expect(f.respond('owner',f.id,{...input,turnId:'missing'},signal)).rejects.toMatchObject({status:409});expect(f.calls()).toBe(0);
});
it('rejects a replay of an old user turn once a newer transcript is committed',async()=>{
 const f=await fixture();await f.profile.event('owner',f.id,{clientId,providerEpoch:1,eventId:'event-3',type:'transcript',transcript:{role:'user',turnId:'user-2',text:'Actually I want to repair the relationship',interrupted:false}});
 await expect(f.respond('owner',f.id,{clientId,providerEpoch:1,turnId:'user-1'},new AbortController().signal)).rejects.toMatchObject({status:409});expect(f.calls()).toBe(0);
});
it.each(['transcript','speech_started'] as const)('rejects an old response when a newer %s arrives between its snapshot and receipt claim',async(type)=>{
 const f=await fixture();
 const respond=createCoachResponse({service:f.service,bearerSecret:bearer,bindingSecret:secret,callback:async request=>{
  await f.profile.event('owner',f.id,{clientId,providerEpoch:1,eventId:'newer-input',type,...(type==='transcript'?{transcript:{role:'user' as const,turnId:'user-2',text:'Actually I want to repair our friendship',interrupted:false}}:{})});
  return f.callback(request);
 }});
 await expect(respond('owner',f.id,{clientId,providerEpoch:1,turnId:'user-1'},new AbortController().signal)).rejects.toMatchObject({status:409});
 expect(f.calls()).toBe(0);expect((await f.service.read('owner',f.id)).publicProfile).toEqual({});
});
