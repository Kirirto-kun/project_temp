import { randomUUID, timingSafeEqual } from 'node:crypto';
import { setTimeout as pause } from 'node:timers/promises';
import { z } from 'zod';
import { CallService, fingerprint, type CoachTurnReceipt, type IntakeRecord } from './service';
import { ProfileControl } from './profile-control';
import { CoachTurnSchema, type CoachMessage, type CoachModel } from './coach-model';
import { parseSessionBinding } from './session-binding';
import { checkCancellation, IntakeError } from './errors';
import { jsonBody } from './http';

const inputSchema=z.object({stream:z.boolean().default(true),turnId:z.string().min(1).max(160).optional(),inputGeneration:z.number().int().nonnegative().optional(),messages:z.array(z.object({role:z.enum(['system','developer','user','assistant']),content:z.string().max(16000)})).min(1).max(100)}).refine(value=>!value.turnId||value.inputGeneration!==undefined);
type Binding=ReturnType<typeof parseSessionBinding>;
interface Dependencies {service:CallService;profile:ProfileControl;model:CoachModel;bearerSecret:string;bindingSecret:string;maxTurns?:number}
function sameSecret(actual:string,expected:string){const a=Buffer.from(actual);const b=Buffer.from(expected);return a.length===b.length&&b.length>7&&timingSafeEqual(a,b);}
const denied=()=>new IntakeError(410,'ATTEMPT_CLOSED','This call has ended.');

export function createCoachCallback(deps:Dependencies){
  async function active(binding:Binding){
    const record=await deps.service.load(binding.id);
    if(record.attempt?.epoch!==binding.epoch||record.attempt.deadlineAt!==binding.deadlineAt||!record.attempt.provisioned||!['connecting','active'].includes(record.mediaStatus)||Date.parse(binding.deadlineAt)<=deps.service.now())throw denied();
    return record;
  }
  async function latest(binding:Binding,key:string,receipt:CoachTurnReceipt,profileRevision:number,signal:AbortSignal){
    const record=await active(binding);checkCancellation(signal);
    if((record.coachInputGeneration??0)!==(receipt.inputGeneration??0))throw new IntakeError(409,'TURN_SUPERSEDED','A newer turn is being processed.');
    if(record.latestCoachTurn!==key||record.coachTurns?.[key]?.serial!==receipt.serial)throw new IntakeError(409,'TURN_SUPERSEDED','A newer turn is being processed.');
    if(record.profileRevision!==profileRevision)throw new IntakeError(409,'PROFILE_CHANGED','The brief changed while the coach was answering.');
    return record;
  }
  async function fail(binding:Binding,key:string){
    for(let i=0;i<8;i++){
      const current=await deps.service.deps.store.read<IntakeRecord>('session:'+binding.id);
      if(!current||current.deleted||current.attempt?.epoch!==binding.epoch||current.coachTurns?.[key]?.state!=='processing')return;
      const next=structuredClone(current);next.coachTurns![key].state='failed';
      if(await deps.service.save(current,next))return;
    }
  }
  async function run(binding:Binding,messages:CoachMessage[],signal:AbortSignal,turnId?:string,inputGeneration?:number){
    const key=fingerprint(turnId?{epoch:binding.epoch,turnId}:{epoch:binding.epoch,messages});let receipt:CoachTurnReceipt|undefined;let record: IntakeRecord;
    const generationSignal=AbortSignal.any([signal,AbortSignal.timeout(Math.max(1,Date.parse(binding.deadlineAt)-deps.service.now()))]);
    const waitUntil=Date.now()+22000;
    for(;;){
      record=await active(binding);checkCancellation(generationSignal);
      if(turnId&&(record.transcript.findLast(item=>item.role==='user')?.turnId!==turnId||(record.coachInputGeneration??0)!==inputGeneration))throw new IntakeError(409,'TURN_SUPERSEDED','A newer turn is being processed.');
      const prior=record.coachTurns?.[key];
      if(prior?.state==='ready'){
        if(record.latestCoachTurn!==key)throw new IntakeError(409,'TURN_SUPERSEDED','A newer turn is being processed.');
        if(record.profileRevision!==prior.profileRevision)throw new IntakeError(409,'PROFILE_CHANGED','The brief changed after this response.');
        return prior.reply!;
      }
      if(prior?.state==='failed')throw new IntakeError(503,'TURN_FAILED','This response could not be completed. Please continue or use the form.',true);
      if(prior){
        if(Date.now()>=waitUntil||signal.aborted)throw new IntakeError(503,'TURN_IN_PROGRESS','The coach is still answering.',true);
        await pause(40,undefined,{signal}).catch(()=>{});continue;
      }
      if(Object.keys(record.coachTurns??{}).length>=(deps.maxTurns??20))throw new IntakeError(429,'MODEL_TURN_LIMIT','The preparation call has reached its turn limit. Please check your brief.');
      const next=structuredClone(record);receipt={serial:(record.coachSerial??0)+1,profileRevision:record.profileRevision,inputGeneration:record.coachInputGeneration??0,state:'processing'};
      next.coachTurns={...record.coachTurns,[key]:receipt};next.latestCoachTurn=key;next.coachSerial=receipt.serial;
      if(await deps.service.save(record,next,generationSignal)){record=next;break;}
      if(Date.now()>=waitUntil)throw new IntakeError(503,'SERVICE_BUSY','Please try again shortly.',true);
    }
    try{
      await latest(binding,key,receipt,receipt.profileRevision,generationSignal);
      const proposed=await deps.model.complete({messages:messages.length?messages.slice(-24):[{role:'user',content:'Please start the preparation conversation.'}],profile:record.profile,signal:generationSignal});
      checkCancellation(generationSignal);
      const checked=CoachTurnSchema.safeParse(proposed);
      if(!checked.success)throw new IntakeError(503,'MODEL_INVALID_OUTPUT','The coach could not prepare a valid response.',true);
      const result=checked.data;
      let expectedProfileRevision=receipt.profileRevision;
      for(let retry=0;;retry++){
        record=await latest(binding,key,receipt,expectedProfileRevision,generationSignal);
        if(!Object.keys(result.patch).length)break;
        try{
          const saved=await deps.profile.tool(record.ownerId,record.id,{clientId:record.attempt!.clientId,providerEpoch:binding.epoch,callId:'model:'+key,expectedRevision:record.revision,toolName:'save_profile',payload:{patch:result.patch}},generationSignal);
          expectedProfileRevision=saved.view.profileRevision;break;
        }catch(error){if(!(error instanceof IntakeError)||error.status!==409||retry>=4)throw error;}
      }
      for(let retry=0;retry<16;retry++){
        record=await latest(binding,key,receipt,expectedProfileRevision,generationSignal);
        const next=structuredClone(record);next.coachTurns![key]={...receipt,profileRevision:expectedProfileRevision,state:'ready',reply:result.reply};
        if(await deps.service.save(record,next,generationSignal)){record=next;break;}
        if(retry===15)throw new IntakeError(503,'SERVICE_BUSY','Please try again shortly.',true);
      }
      if(result.action!=='continue'){
        const toolName=result.action==='mini_practice'?'request_mini_practice':result.action==='review'?'prepare_confirmation':'request_end';
        for(let retry=0;;retry++){
          record=await latest(binding,key,receipt,expectedProfileRevision,generationSignal);
          try{await deps.profile.tool(record.ownerId,record.id,{clientId:record.attempt!.clientId,providerEpoch:binding.epoch,callId:'action:'+key,expectedRevision:record.revision,toolName,payload:{}},generationSignal);break;}
          catch(error){if(!(error instanceof IntakeError)||error.status!==409||retry>=4)throw error;}
        }
      }
      checkCancellation(generationSignal);return result.reply;
    }catch(error){await fail(binding,key).catch(()=>{});throw error;}
  }
  return async(request:Request):Promise<Response>=>{
    try{
      if(deps.bearerSecret.length<32)throw new IntakeError(503,'SERVICE_UNCONFIGURED','The provider callback is not configured.');
      if(request.method!=='POST')throw new IntakeError(405,'METHOD_NOT_ALLOWED','Use POST.');
      if(!sameSecret(request.headers.get('Authorization')??'','Bearer '+deps.bearerSecret))throw new IntakeError(401,'INVALID_SERVICE_AUTH','Provider callback authorization required.');
      const body=inputSchema.parse(await jsonBody(request,65536));
      const tokens=new Set(body.messages.filter(m=>m.role==='system'||m.role==='developer').flatMap(m=>[...m.content.matchAll(/\[holdline-session:([-\w]+\.[-\w]+)\]/g)].map(match=>match[1])));
      if(tokens.size!==1)throw new IntakeError(401,'INVALID_SESSION_BINDING','Provider callback is not authorized.');
      const binding=parseSessionBinding([...tokens][0],deps.bindingSecret,deps.service.now());
      const messages=body.messages.filter(m=>m.role==='user'||m.role==='assistant').map(m=>({role:m.role as CoachMessage['role'],content:m.content}));
      const reply=await run(binding,messages,request.signal,body.turnId,body.inputGeneration);checkCancellation(request.signal);const id='chatcmpl-'+randomUUID();const created=Math.floor(Date.now()/1000);
      const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
      if(!body.stream)return Response.json({id,object:'chat.completion',created,model:'holdline-coach',choices:[{index:0,message:{role:'assistant',content:reply},finish_reason:'stop'}]},{headers});
      const chunk=(delta:unknown,finish_reason:string|null=null)=>'data: '+JSON.stringify({id,object:'chat.completion.chunk',created,model:'holdline-coach',choices:[{index:0,delta,finish_reason}]})+'\n\n';
      return new Response(chunk({role:'assistant'})+chunk({content:reply})+chunk({},'stop')+'data: [DONE]\n\n',{headers:{...headers,'Content-Type':'text/event-stream; charset=utf-8'}});
    }catch(error){
      const known=error instanceof IntakeError?error:error instanceof z.ZodError?new IntakeError(400,'INVALID_INPUT','Check the callback request.'):new IntakeError(503,'MODEL_UNAVAILABLE','The coach could not answer. Your brief is saved.',true);
      return Response.json({error:{message:known.message,type:known.status>=500?'server_error':'invalid_request_error',code:known.code}},{status:known.status,headers:{'Cache-Control':'no-store',...(known.retryable?{'Retry-After':'2'}:{})}});
    }
  };
}
