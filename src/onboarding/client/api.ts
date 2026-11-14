import { ConnectionSchema, IntakeViewSchema, type ConnectInput, type ClientEvent, type ClientTool } from '../contracts';

export class ApiError extends Error {
  constructor(message:string,public code:string,public status:number,public retryable:boolean){super(message);}
}
export async function requestJson(path:string,method='GET',body?:unknown,key?:string,keepalive=false) {
  const response=await fetch('/api/intake'+path,{
    method,credentials:'same-origin',cache:'no-store',keepalive,
    headers:{'Content-Type':'application/json',...(key?{'Idempotency-Key':key}:{})},
    ...(body!==undefined?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(path.endsWith('/events')?5000:method==='GET'?8000:15000),
  });
  const data=await response.json().catch(()=>null);
  if(!response.ok)throw new ApiError(data?.error?.message??'The connection could not be completed. Please try again.',data?.error?.code??'NETWORK_ERROR',response.status,!!data?.error?.retryable);
  return data;
}
export function createCallApi(id:string) {
  return {
    async read(){return IntakeViewSchema.parse(await requestJson('/'+id));},
    async connect(input:ConnectInput,key:string){return ConnectionSchema.parse(await requestJson('/'+id+'/connect','POST',input,key));},
    async event(input:ClientEvent){const response=await requestJson('/'+id+'/events','POST',input);return{continue:response.continue===true,view:IntakeViewSchema.parse(response.view)};},
    async tool(input:ClientTool){const response=await requestJson('/'+id+'/tools','POST',input);return{view:IntakeViewSchema.parse(response.view),missingFields:response.missingFields as string[]};},
    async stop(reason:string,key:string,providerEpoch?:number){return IntakeViewSchema.parse(await requestJson('/'+id+'/stop','POST',{reason,providerEpoch},key,true));},
  };
}
