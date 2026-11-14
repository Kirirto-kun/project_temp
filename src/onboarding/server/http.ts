import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { ClientEventSchema, ClientToolSchema, ConnectInputSchema, CreateInputSchema, ProfilePatchSchema, StopReasonSchema } from '../contracts';
import type { CallService } from './service';
import type { ProfileControl } from './profile-control';
import { IntakeError } from './errors';

interface ApiDependencies {
  service:CallService;profile:ProfileControl;origin:string;ownerSecret:string;maintenanceSecret:string;
  callsAvailable():Promise<boolean>;trustedIpHeader?:string;
}
const patchInput=z.object({expectedRevision:z.number().int().nonnegative(),patch:ProfilePatchSchema}).strict();
const confirmationInput=z.object({expectedRevision:z.number().int().nonnegative()}).strict();
const stopInput=z.object({reason:StopReasonSchema,expectedRevision:z.number().optional(),providerEpoch:z.number().int().positive().optional()}).strict();
const hash=(secret:string,value:string)=>createHmac('sha256',secret).update(value).digest('hex');
function equalSecret(left:string,right:string){
  const a=Buffer.from(left);const b=Buffer.from(right);return a.length===b.length&&a.length>0&&timingSafeEqual(a,b);
}
async function jsonBody(request:Request) {
  if(!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json'))throw new IntakeError(400,'INVALID_CONTENT_TYPE','Use a JSON request.');
  if(Number(request.headers.get('Content-Length'))>32768)throw new IntakeError(413,'BODY_TOO_LARGE','This request is too large.');
  const reader=request.body?.getReader();if(!reader)throw new IntakeError(400,'INVALID_INPUT','Request body is missing.');
  const chunks:Uint8Array[]=[];let size=0;
  try {
    while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>32768){await reader.cancel();throw new IntakeError(413,'BODY_TOO_LARGE','This request is too large.');}chunks.push(part.value);}
    const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
    return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)) as unknown;
  }catch(error){if(error instanceof IntakeError)throw error;throw new IntakeError(400,'INVALID_INPUT','Request body is not valid JSON.');}
  finally{reader.releaseLock();}
}
function idempotency(request:Request) {
  const key=request.headers.get('Idempotency-Key');
  if(!key||!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,119}$/.test(key))throw new IntakeError(400,'IDEMPOTENCY_REQUIRED','A valid request key is required.');
  return key;
}

export function createIntakeApi(deps:ApiDependencies) {
  return async function handle(request:Request,path:string[]):Promise<Response> {
    const requestId=randomUUID();
    const headers=new Headers({'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','X-Request-ID':requestId});
    const respond=(body:unknown,status=200)=>Response.json(body,{status,headers});
    try {
      if(path.length===1&&path[0]==='maintenance') {
        if(request.method!=='POST'||!equalSecret(request.headers.get('Authorization')??'',`Bearer ${deps.maintenanceSecret}`))throw new IntakeError(401,'INVALID_SERVICE_AUTH','Maintenance authorization required.');
        return respond(await deps.service.maintenance(!await deps.callsAvailable(),true));
      }
      if(request.method!=='GET'&&request.headers.get('Origin')!==deps.origin)throw new IntakeError(403,'INVALID_ORIGIN','This request must come from Holdline.');
      if(path.length===1&&path[0]==='config'&&request.method==='GET')return respond({intakeContractVersion:1,available:await deps.callsAvailable(),sessionLimitSeconds:300,capabilities:{visualAnalysis:false,audioAnalysis:false,audioOnly:false}});
      const cookie=request.headers.get('Cookie')?.split(';').map(c=>c.trim()).find(c=>c.startsWith('holdline_owner='))?.slice('holdline_owner='.length);
      let ownerToken=cookie&&/^[A-Za-z0-9_-]{43}$/.test(cookie)?cookie:null;
      if(path.length===0&&request.method==='POST') {
        const input=CreateInputSchema.parse(await jsonBody(request));const key=idempotency(request);
        if(!ownerToken){ownerToken=randomBytes(32).toString('base64url');headers.set('Set-Cookie',`holdline_owner=${ownerToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400${deps.origin.startsWith('https:')?'; Secure':''}`);}
        const owner=hash(deps.ownerSecret,'owner:'+ownerToken);
        const ip=deps.trustedIpHeader?request.headers.get(deps.trustedIpHeader)??'unavailable':'unavailable';
        await admitDraft(deps,owner,key,hash(deps.ownerSecret,'ip:'+ip));
        return respond(await deps.service.create(owner,key,input),201);
      }
      if(!ownerToken)throw new IntakeError(404,'NOT_FOUND','Brief not found.');
      const owner=hash(deps.ownerSecret,'owner:'+ownerToken);
      const id=z.uuid().parse(path[0]);
      if(path.length===1&&request.method==='GET')return respond(await deps.service.read(owner,id));
      if(path.length===1&&request.method==='DELETE') {await deps.service.remove(owner,id,idempotency(request));return respond({deleted:true});}
      if(path.length!==2)throw new IntakeError(404,'NOT_FOUND','Endpoint not found.');
      const action=path[1];
      if(action==='handoff'&&request.method==='GET')return respond(await deps.profile.handoff(owner,id));
      if(action==='connect'&&request.method==='POST') {
        const input=ConnectInputSchema.parse(await jsonBody(request));const key=idempotency(request);
        await deps.service.load(id,owner);
        if(!await deps.callsAvailable())throw new IntakeError(503,'CALLS_UNAVAILABLE','Video conversations are not available yet. You can use the quick form.',true);
        if(input.mode!=='video')throw new IntakeError(503,'MODE_UNAVAILABLE','Use the video conversation or the quick form.');
        await deps.service.maintenance();
        const ip=deps.trustedIpHeader?request.headers.get(deps.trustedIpHeader)??'unavailable':'unavailable';
        return respond(await deps.service.connect(owner,id,key,hash(deps.ownerSecret,'ip:'+ip),input));
      }
      if(action==='stop'&&request.method==='POST') {
        const input=stopInput.parse(await jsonBody(request));return respond(await deps.service.stop(owner,id,idempotency(request),input.reason,input.providerEpoch));
      }
      if(action==='profile'&&request.method==='PATCH')return respond(await deps.profile.patch(owner,id,idempotency(request),patchInput.parse(await jsonBody(request))));
      if(action==='confirm'&&request.method==='POST')return respond(await deps.profile.confirm(owner,id,idempotency(request),confirmationInput.parse(await jsonBody(request))));
      if(action==='events'&&request.method==='POST') {
        const input=ClientEventSchema.parse(await jsonBody(request));
        if(!await deps.callsAvailable())return respond({continue:false,view:await deps.service.stop(owner,id,'disabled-'+input.providerEpoch,'error',input.providerEpoch)});
        return respond(await deps.profile.event(owner,id,input));
      }
      if(action==='tools'&&request.method==='POST')return respond(await deps.profile.tool(owner,id,ClientToolSchema.parse(await jsonBody(request))));
      throw new IntakeError(404,'NOT_FOUND','Endpoint not found.');
    } catch(error) {
      const known=error instanceof IntakeError?error:error instanceof z.ZodError?new IntakeError(400,'INVALID_INPUT','Check the request fields and amounts.'):new IntakeError(503,'SERVICE_UNAVAILABLE','Your connection could not be completed. Please try again.',true);
      if(known.retryable)headers.set('Retry-After','2');
      if(!(error instanceof IntakeError)&&!(error instanceof z.ZodError))console.error(JSON.stringify({event:'intake_request_failed',requestId,code:known.code}));
      return respond({error:{code:known.code,message:known.message,retryable:known.retryable,requestId,...(known.currentVersion!==undefined?{currentVersion:known.currentVersion}:{})}},known.status);
    }
  };
}

async function admitDraft(deps:ApiDependencies,owner:string,requestKey:string,ip:string) {
  const day=new Date(deps.service.now()).toISOString().slice(0,10);
  const key='draft-admission:'+day+':'+ip;
  type Admission={revision:number;keys:string[]};
  const receipt=hash(deps.ownerSecret,owner+':'+requestKey);
  for(let retry=0;retry<16;retry++) {
    const current=await deps.service.deps.store.read<Admission>(key);
    if(current?.keys.includes(receipt))return;
    if((current?.keys.length??0)>=30)throw new IntakeError(429,'DRAFT_QUOTA','Daily limit reached. Please return later.');
    const next={revision:(current?.revision??0)+1,keys:[...(current?.keys??[]),receipt]};
    if(current?await deps.service.deps.store.compareAndSet(key,current.revision,next,172800):await deps.service.deps.store.create(key,next,172800))return;
  }
  throw new IntakeError(503,'SERVICE_BUSY','Please try again shortly.',true);
}
