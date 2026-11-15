import { z } from 'zod';
import type { ClientRespond,CoachReply } from '../contracts';
import type { CallService } from './service';
import { createSessionBinding } from './session-binding';
import { checkCancellation, IntakeError } from './errors';

interface Dependencies {service:CallService;callback(request:Request):Promise<Response>;bearerSecret:string;bindingSecret:string}
const completionSchema=z.object({choices:z.array(z.object({message:z.object({content:z.string().max(1800)})})).min(1)});

export function createCoachResponse(deps:Dependencies){
  return async(owner:string,id:string,input:ClientRespond,signal:AbortSignal):Promise<CoachReply>=>{
    const record=await deps.service.load(id,owner);checkCancellation(signal);const attempt=record.attempt;
    if(!attempt||attempt.epoch!==input.providerEpoch||attempt.clientId!==input.clientId)throw new IntakeError(409,'STALE_ATTEMPT','This response belongs to another call.');
    if(!['connecting','active'].includes(record.mediaStatus)||Date.parse(attempt.deadlineAt)<=deps.service.now())throw new IntakeError(410,'ATTEMPT_CLOSED','This call has ended.');
    const index=record.transcript.findLastIndex(item=>item.role==='user');
    if(index<0||record.transcript[index].turnId!==input.turnId)throw new IntakeError(409,'STALE_TURN','Only the latest committed user turn can receive a response.');
    let size=0;
    const messages=record.transcript.slice(0,index+1).reverse().filter(item=>{size+=item.text.length;return size<=48000;}).reverse().map(item=>({role:item.role,content:item.text}));
    const binding=createSessionBinding(id,attempt.epoch,attempt.deadlineAt,deps.bindingSecret);
    // In-process authenticated boundary: no public provider callback URL is needed.
    const response=await deps.callback(new Request('http://internal/api/avatar-llm/v1/chat/completions',{
      method:'POST',signal,headers:{'Content-Type':'application/json',Authorization:'Bearer '+deps.bearerSecret},
      body:JSON.stringify({stream:false,turnId:input.turnId,inputGeneration:record.coachInputGeneration??0,messages:[{role:'system',content:'[holdline-session:'+binding+']'},...messages]}),
    }));
    const body=await response.json();checkCancellation(signal);
    if(!response.ok)throw new IntakeError(response.status,body.error?.code??'MODEL_UNAVAILABLE',body.error?.message??'The coach could not answer.',response.status>=500);
    const reply=completionSchema.parse(body).choices[0].message.content;const view=await deps.service.read(owner,id);checkCancellation(signal);
    if(view.providerEpoch!==input.providerEpoch)throw new IntakeError(409,'STALE_ATTEMPT','This call has changed.');
    return{reply,view,turnId:input.turnId,providerEpoch:input.providerEpoch};
  };
}
