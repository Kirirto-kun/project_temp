import { expect, it } from 'vitest';
import { CallService, type CallProvider } from '@/onboarding/server/service';
import { ProfileControl } from '@/onboarding/server/profile-control';
import { DailyBudget } from '@/onboarding/server/budget';
import { MemoryStore } from './helpers/memory-store';
const clientId='00000000-0000-4000-8000-000000000001';

async function fixture() {
  let now=Date.parse('2026-11-15T00:00:00Z'); const closed:string[]=[];
  const store=new MemoryStore(()=>now);
  const provider:CallProvider={async open(){return{providerSessionId:'provider',credentialCiphertext:'encrypted'};},async close(a){if(a.providerSessionId)closed.push(a.providerSessionId);},async credentials(){return{sessionToken:'token'};}};
  const service=new CallService({store,provider,budget:new DailyBudget(store,{dailyCents:1000,attemptCents:100,concurrency:2,attemptsPerIp:3},()=>now),now:()=>now});
  const view=await service.create('owner','create-key-01',{mode:'video',locale:'en',consentVersion:1,consents:{audioAnalysis:false,visualAnalysis:false}});
  const profile=new ProfileControl(service);
  return{service,profile,view,store,closed,setTime:(t:number)=>{now=t;}};
}
it('keeps save_profile proposals unconfirmed, deduplicates tools and rejects a stale epoch',async()=>{
  const f=await fixture();
  const connection=await f.service.connect('owner',f.view.id,'connect-key-01','ip',{expectedRevision:0,mode:'video',restart:false,clientId});
  const input={clientId,providerEpoch:1,callId:'tool-1',expectedRevision:connection.view.revision,toolName:'save_profile' as const,payload:{patch:{currentMinor:9500000,currency:'USD' as const,period:'year' as const,moneyBasis:'gross' as const}}};
  const saved=await f.profile.tool('owner',f.view.id,input);
  expect(saved.view.publicProfile.currentMinor).toBe(9500000);expect(saved.view.confirmed).toBe(false);
  expect((await f.profile.tool('owner',f.view.id,input)).view.profileRevision).toBe(saved.view.profileRevision);
  await f.service.stop('owner',f.view.id,'stop-key-0001','user');
  await expect(f.profile.tool('owner',f.view.id,{...input,callId:'late'})).rejects.toMatchObject({code:'ATTEMPT_CLOSED'});
});
it('invalidates explicit confirmation after a correction without altering unknown fields',async()=>{
  const f=await fixture();
  const edited=await f.profile.patch('owner',f.view.id,'patch-key-001',{expectedRevision:0,patch:{currentMinor:9500000,targetMinor:11000000,currency:'USD',period:'year',moneyBasis:'gross'}});
  const confirmed=await f.profile.confirm('owner',f.view.id,'confirm-key-01',{expectedRevision:edited.revision});
  expect(confirmed.confirmed).toBe(true);expect(confirmed.mediaStatus).toBe('closed');
  const corrected=await f.profile.patch('owner',f.view.id,'patch-key-002',{expectedRevision:confirmed.revision,patch:{currentMinor:5000000}});
  expect(corrected.confirmed).toBe(false);expect(corrected.publicProfile.marketLowMinor).toBeUndefined();
});
it('expires an abandoned paid attempt after missing heartbeats and retains the draft',async()=>{
  const f=await fixture();
  await f.service.connect('owner',f.view.id,'connect-key-01','ip',{expectedRevision:0,mode:'video',restart:false,clientId});
  f.setTime(Date.parse('2026-11-15T00:00:31Z'));
  await f.service.maintenance();
  expect(f.closed).toContain('provider');expect((await f.service.read('owner',f.view.id)).phase).toBe('review');
});
it('does not allow another tab to take over an active call',async()=>{
  const f=await fixture();const c=await f.service.connect('owner',f.view.id,'connect-key-01','ip',{expectedRevision:0,mode:'video',restart:false,clientId});
  await expect(f.service.connect('owner',f.view.id,'connect-key-02','ip',{expectedRevision:c.view.revision,mode:'video',restart:false,clientId:'00000000-0000-4000-8000-000000000002'})).rejects.toMatchObject({code:'CALL_IN_USE'});
});
it('allows an explicit correction to clear a salary instead of retaining the old number',async()=>{
  const f=await fixture();
  const first=await f.profile.patch('owner',f.view.id,'patch-key-001',{expectedRevision:0,patch:{currentMinor:9500000,currency:'USD',period:'year',moneyBasis:'gross'}});
  const cleared=await f.profile.patch('owner',f.view.id,'patch-key-002',{expectedRevision:first.revision,patch:{currentMinor:null}});
  expect(cleared.publicProfile.currentMinor).toBeUndefined();
});
it('persists cleanup liveness for admission checks on other server instances',async()=>{
  const f=await fixture();await f.service.maintenance();
  expect(await f.store.read('maintenance-health')).toBeNull();
  await f.service.maintenance(false,true);
  expect(await f.store.read('maintenance-health')).toMatchObject({lastRunAt:Date.parse('2026-11-15T00:00:00Z')});
});
it('does not let an old server-side request_end stop a newly restarted epoch',async()=>{
  const f=await fixture();const c=await f.service.connect('owner',f.view.id,'connect-key-01','ip',{expectedRevision:0,mode:'video',restart:false,clientId});
  const original=f.service.stop.bind(f.service);let gated=true;
  f.service.stop=async(...args)=>{
    if(gated&&args[2]==='tool-stop:old-end') {
      gated=false;const closed=await original('owner',f.view.id,'manual-stop-01','user',1);
      await f.service.connect('owner',f.view.id,'connect-key-02','ip',{expectedRevision:closed.revision,mode:'video',restart:true,clientId});
    }
    return original(...args);
  };
  const result=await f.profile.tool('owner',f.view.id,{clientId,providerEpoch:1,callId:'old-end',expectedRevision:c.view.revision,toolName:'request_end',payload:{}});
  expect(result.view.providerEpoch).toBe(2);expect(result.view.mediaStatus).toBe('connecting');
});
