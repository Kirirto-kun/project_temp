import { expect,it } from 'vitest';
import { CallController, type CallSession, type CallApi, type SessionCallbacks } from '@/onboarding/client/call';
import type { Connection,IntakeView } from '@/onboarding/contracts';

const view:IntakeView={id:'id',revision:1,profileRevision:0,phase:'connecting',mediaStatus:'connecting',mode:'video',publicProfile:{},confirmed:false,committedTranscript:[],expiresAt:'2026-11-16T00:00:00Z',deadlineAt:new Date(Date.now()+300000).toISOString(),providerEpoch:1,availability:{audioAnalysis:false,visualAnalysis:false}};
function fixture() {
  const effects:string[]=[];
  let callbacks!:SessionCallbacks;
  const api:CallApi={async connect(){effects.push('mint');return{sessionToken:'token',providerEpoch:1,deadlineAt:view.deadlineAt!,view} as Connection;},async event(){return{continue:true,view};},async tool(){return{view,missingFields:[]};},async read(){return view;},async stop(){effects.push('server-stop');return{...view,mediaStatus:'closed',phase:'review'};}};
  const session:CallSession={async start(){effects.push('start');},async stop(){effects.push('sdk-stop');},releaseMicrophone(){effects.push('release-mic');},async setMuted(muted){effects.push(muted?'mute':'unmute');},attach(){},async keepAlive(){},sendToolResult(){effects.push('tool-result');},sendText(){}};
  const controller=new CallController(api,async(_token,events)=>{callbacks=events;return session;},{onState(){},onView(){},onCaption(){},onError(){}},'00000000-0000-4000-8000-000000000001');
  return{controller,api,session,effects,events:()=>callbacks};
}
it('releases SDK microphone before waiting for server cleanup, including an API failure',async()=>{
  const f=fixture();await f.controller.start(view);
  f.api.stop=async()=>{f.effects.push('server-stop');throw new Error('offline');};
  await f.controller.end('user');
  expect(f.effects.indexOf('release-mic')).toBeLessThan(f.effects.indexOf('server-stop'));
  expect(f.effects).toContain('sdk-stop');expect(f.controller.state).toBe('error');
});
it('closes an SDK that finished starting after End and never announces connected',async()=>{
  const f=fixture();let resolve!:()=>void;let entered!:()=>void;
  const started=new Promise<void>(r=>{entered=r;});f.session.start=async()=>{entered();await new Promise<void>(r=>{resolve=r;});};
  const opening=f.controller.start(view);await started;await f.controller.end('user');resolve();await opening;
  expect(f.controller.state).toBe('ended');expect(f.effects.filter(e=>e==='sdk-stop').length).toBeGreaterThanOrEqual(2);
  expect(f.effects).not.toContain('unmute');
});
it('unmutes only after guarded startup has established an active call',async()=>{
  const f=fixture();await f.controller.start(view);await f.controller.end('user');
  expect(f.effects).toContain('unmute');expect(f.effects.indexOf('start')).toBeLessThan(f.effects.indexOf('unmute'));
});
it('never rebinds an old tool after End and restart while its profile read was pending',async()=>{
  const f=fixture();await f.controller.start(view);
  let release!:(v:IntakeView)=>void;let entered!:()=>void;const waiting=new Promise<void>(r=>{entered=r;});
  f.api.read=async()=>{entered();return new Promise<IntakeView>(r=>{release=r;});};
  const submitted:number[]=[];f.api.tool=async input=>{submitted.push(input.providerEpoch);return{view,missingFields:[]};};
  f.events().tool('old-tool','save_profile',{patch:{userRole:'Old answer'}});await waiting;
  await f.controller.end('user');
  const nextView={...view,providerEpoch:2};f.api.connect=async()=>({sessionToken:'next',providerEpoch:2,deadlineAt:view.deadlineAt!,view:nextView});
  await f.controller.start({...view,mediaStatus:'closed',providerEpoch:1});release(nextView);
  await new Promise<void>(r=>setImmediate(r));
  expect(submitted).toEqual([]);await f.controller.end('user');
});
it('does not create another paid attempt when Start is clicked twice',async()=>{
  const f=fixture();await Promise.all([f.controller.start(view),f.controller.start(view)]);await f.controller.end('user');
  expect(f.effects.filter(e=>e==='mint')).toHaveLength(1);
});
