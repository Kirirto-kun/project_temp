import { setImmediate as yieldTurn } from 'node:timers/promises';
import { expect, it } from 'vitest';
import { CallService } from '@/onboarding/server/service';
import { ProfileControl } from '@/onboarding/server/profile-control';
import { DailyBudget } from '@/onboarding/server/budget';
import { createSessionBinding } from '@/onboarding/server/session-binding';
import { createCoachCallback } from '@/onboarding/server/coach-callback';
import type { CoachModel, CoachTurn } from '@/onboarding/server/coach-model';
import { MemoryStore } from './helpers/memory-store';

const bearer='local-test-callback-bearer-that-is-long-enough';
const secret='local-test-binding-secret-that-is-long-enough';
const clientId='00000000-0000-4000-8000-000000000001';
const reply:CoachTurn={reply:'What would you like your friend to understand?',patch:{kind:'relationship',description:'A disagreement with a friend',goal:'Explain my boundary',counterpartRole:'My friend'},action:'continue'};
function gate<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(r=>{resolve=r;});return{promise,resolve};}
async function fixture(model?:CoachModel,maxTurns=20){
 const now=Date.parse('2026-11-15T00:00:00Z');const store=new MemoryStore(()=>now);let calls=0;
 const service=new CallService({store,now:()=>now,budget:new DailyBudget(store,{dailyCents:1000,attemptCents:100,concurrency:2,attemptsPerIp:3},()=>now),provider:{async open(){return{providerSessionId:'provider-test',credentialCiphertext:'encrypted-test'};},async close(){},async credentials(){return{sessionToken:'provider-test-token'};}}});
 const view=await service.create('owner','create-coach-01',{mode:'video',locale:'en',consentVersion:1,consents:{audioAnalysis:false,visualAnalysis:false}});
 const connected=await service.connect('owner',view.id,'connect-coach-01','ip',{expectedRevision:0,mode:'video',restart:false,clientId});
 const profile=new ProfileControl(service);
 const handler=createCoachCallback({service,profile,model:model??{async complete(){calls++;return reply;}},bearerSecret:bearer,bindingSecret:secret,maxTurns});
 const binding=createSessionBinding(view.id,1,connected.deadlineAt,secret);
 function request(text='I need to talk with a friend',stream=false,token=binding,authorization='Bearer '+bearer){return new Request('http://localhost/api/avatar-llm/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json',Authorization:authorization},body:JSON.stringify({model:'holdline-coach',stream,messages:[{role:'system',content:'[holdline-session:'+token+']'},{role:'user',content:text}]})});}
 return{service,profile,store,view,handler,request,calls:()=>calls};
}

it('saves a nonfinancial model proposal through normal profile control and reuses an identical retry',async()=>{
 const f=await fixture();
 const first=await f.handler(f.request());expect(first.status).toBe(200);
 expect((await first.json()).choices[0].message.content).toBe(reply.reply);
 const view=await f.service.read('owner',f.view.id);expect(view.publicProfile).toMatchObject(reply.patch);expect(view.confirmed).toBe(false);
 expect((await f.handler(f.request())).status).toBe(200);expect(f.calls()).toBe(1);
});
it('emits OpenAI-compatible SSE without exposing the profile patch or binding',async()=>{
 const f=await fixture();const response=await f.handler(f.request(undefined,true));
 expect(response.headers.get('Content-Type')).toContain('text/event-stream');const body=await response.text();
 expect(body).toContain('data: [DONE]');expect(body).toContain(reply.reply);expect(body).not.toContain('session_binding');expect(body).not.toContain('Explain my boundary');
});
it('rejects wrong bearer, forged binding and oversized input before model generation',async()=>{
 const f=await fixture();
 expect((await f.handler(f.request(undefined,false,undefined,'Bearer wrong'))).status).toBe(401);
 expect((await f.handler(f.request(undefined,false,'forged'))).status).toBe(401);
 expect((await f.handler(f.request('x'.repeat(70000)))).status).toBe(413);expect(f.calls()).toBe(0);
});
it('waits for an in-flight duplicate instead of generating twice',async()=>{
 const started=gate<void>();const result=gate<CoachTurn>();let calls=0;
 const f=await fixture({async complete(){calls++;started.resolve();return result.promise;}});
 const first=f.handler(f.request());await started.promise;const second=f.handler(f.request());await yieldTurn();result.resolve(reply);
 const responses=await Promise.all([first,second]);expect(responses.map(r=>r.status)).toEqual([200,200]);expect(calls).toBe(1);
});
it('discards a model result that arrives after End',async()=>{
 const started=gate<void>();const result=gate<CoachTurn>();const f=await fixture({async complete(){started.resolve();return result.promise;}});
 const pending=f.handler(f.request());await started.promise;await f.service.stop('owner',f.view.id,'stop-coach-01','user',1);result.resolve(reply);
 expect((await pending).status).toBe(410);expect((await f.service.read('owner',f.view.id)).publicProfile).toEqual({});
});
it('does not apply a late model proposal after the caller cancels the response',async()=>{
 const started=gate<void>();const result=gate<CoachTurn>();const f=await fixture({async complete(){started.resolve();return result.promise;}});
 const controller=new AbortController();const pending=f.handler(new Request(f.request(),{signal:controller.signal}));await started.promise;controller.abort();result.resolve(reply);
 expect((await pending).status).toBe(410);expect((await f.service.read('owner',f.view.id)).publicProfile).toEqual({});
});
it.each([1,2])('does not save a proposal cancelled during post-model read %i',async(cancelRead)=>{
 const controller=new AbortController();let generated=false;let reads=0;
 const f=await fixture({async complete(){generated=true;return reply;}});
 const load=f.service.load.bind(f.service);
 f.service.load=async(...args)=>{const record=await load(...args);if(generated&&++reads===cancelRead)controller.abort();return record;};
 const response=await f.handler(new Request(f.request(),{signal:controller.signal}));
 expect(response.status).toBe(410);expect((await f.service.read('owner',f.view.id)).publicProfile).toEqual({});
});
it('does not return a cached response cancelled during the receipt read',async()=>{
 const f=await fixture();expect((await f.handler(f.request())).status).toBe(200);
 const controller=new AbortController();const load=f.service.load.bind(f.service);
 f.service.load=async(...args)=>{const record=await load(...args);controller.abort();return record;};
 expect((await f.handler(new Request(f.request(),{signal:controller.signal}))).status).toBe(410);expect(f.calls()).toBe(1);
});
it('does not run a model action cancelled at the profile mutation boundary',async()=>{
 const controller=new AbortController();const f=await fixture({async complete(){return{...reply,patch:{},action:'mini_practice'};}});
 const tool=f.profile.tool.bind(f.profile);
 f.profile.tool=async(...args)=>{controller.abort();return tool(...args);};
 expect((await f.handler(new Request(f.request(),{signal:controller.signal}))).status).toBe(410);
 expect((await f.service.read('owner',f.view.id)).phase).toBe('connecting');
});
it('does not let an older delayed turn overwrite a newer user correction',async()=>{
 const firstStarted=gate<void>();const firstResult=gate<CoachTurn>();let calls=0;
 const f=await fixture({async complete(){calls++;if(calls===1){firstStarted.resolve();return firstResult.promise;}return{...reply,patch:{...reply.patch,goal:'Repair our friendship'}};}});
 const older=f.handler(f.request());await firstStarted.promise;expect((await f.handler(f.request('Actually I want to repair the friendship'))).status).toBe(200);
 firstResult.resolve(reply);expect((await older).status).toBe(409);expect((await f.service.read('owner',f.view.id)).publicProfile.goal).toBe('Repair our friendship');
});
it('rejects a cached old response after a newer turn has changed the conversation',async()=>{
 const f=await fixture();await f.handler(f.request('first question'));await f.handler(f.request('new topic'));
 expect((await f.handler(f.request('first question'))).status).toBe(409);expect(f.calls()).toBe(2);
});
it('does not replay a cached proposal after a human edits the brief',async()=>{
 const f=await fixture();await f.handler(f.request());const current=await f.service.read('owner',f.view.id);
 await f.profile.patch('owner',f.view.id,'edit-after-response',{expectedRevision:current.revision,patch:{goal:'My corrected goal'}});
 expect((await f.handler(f.request())).status).toBe(409);expect(f.calls()).toBe(1);
});
it('preserves a concurrent human edit instead of overwriting it with an old proposal',async()=>{
 const started=gate<void>();const result=gate<CoachTurn>();const f=await fixture({async complete(){started.resolve();return result.promise;}});
 const pending=f.handler(f.request());await started.promise;const current=await f.service.read('owner',f.view.id);
 await f.profile.patch('owner',f.view.id,'human-edit-01',{expectedRevision:current.revision,patch:{goal:'My explicit edited goal'}});result.resolve(reply);
 expect((await pending).status).toBe(409);expect((await f.service.read('owner',f.view.id)).publicProfile.goal).toBe('My explicit edited goal');
});
it('limits unique model turns and never regenerates an ambiguous failed turn',async()=>{
 const f=await fixture(undefined,2);await f.handler(f.request('first'));await f.handler(f.request('second'));
 expect((await f.handler(f.request('third'))).status).toBe(429);expect(f.calls()).toBe(2);
 let failedCalls=0;const failed=await fixture({async complete(){failedCalls++;throw new Error('provider failure');}});
 expect((await failed.handler(failed.request())).status).toBe(503);expect((await failed.handler(failed.request())).status).toBe(503);expect(failedCalls).toBe(1);
});
it('erases cached model text along with a deleted brief',async()=>{
 const f=await fixture();await f.handler(f.request());await f.service.remove('owner',f.view.id,'delete-coach-01');
 const tombstone=await f.store.read('session:'+f.view.id);expect(JSON.stringify(tombstone)).not.toContain(reply.reply);expect(JSON.stringify(tombstone)).not.toContain('Explain my boundary');
});
