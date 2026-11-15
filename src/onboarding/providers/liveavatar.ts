import { z } from 'zod';
import type { Attempt, CallProvider } from '../server/service';
import { IntakeError } from '../server/errors';
import { openToken, sealToken } from '../server/token-vault';

const tokenResponse=z.object({code:z.union([z.literal(1000),z.literal(100)]),data:z.object({session_id:z.string().min(1).max(120),session_token:z.string().min(1).max(16384)})});
export interface LiveAvatarConfig { apiKey:string;avatarId:string;voiceId:string;encryptionKey:string;sandbox?:boolean }
export class LiveAvatarProvider implements CallProvider {
  constructor(private config:LiveAvatarConfig, private request:typeof fetch=fetch, private now=Date.now) {}
  async open(attempt:Attempt) {
    if(attempt.mode!=='video') throw new IntakeError(503,'MODE_UNAVAILABLE','Use the video conversation or the quick form.');
    const seconds=Math.min(this.config.sandbox?60:300,Math.floor((Date.parse(attempt.deadlineAt)-this.now())/1000));
    if(seconds<1) throw new IntakeError(410,'CALL_EXPIRED','This call has ended.');
    try {
      const response=await this.request('https://api.liveavatar.com/v1/sessions/token',{
        method:'POST',headers:{'X-API-KEY':this.config.apiKey,'Content-Type':'application/json'},cache:'no-store',signal:AbortSignal.timeout(10000),
        body:JSON.stringify({mode:'FULL',avatar_id:this.config.sandbox?'dd73ea75-1218-4ef3-92ce-606d5f7fbc0a':this.config.avatarId,is_sandbox:this.config.sandbox??false,max_session_duration:seconds,video_settings:{quality:'high',encoding:'H264'},avatar_persona:{voice_id:this.config.voiceId,language:'en'}}),
      });
      if(!response.ok) throw new Error('Provider rejected session');
      const {data}=tokenResponse.parse(await response.json());
      return {providerSessionId:data.session_id,credentialCiphertext:sealToken(data.session_token,this.config.encryptionKey,data.session_id)};
    }catch(error){
      if(error instanceof IntakeError) throw error;
      throw new IntakeError(503,'PROVIDER_UNAVAILABLE','Alex could not connect. Your brief is saved.',true);
    }
  }
  async close(attempt:Attempt) {
    if(!attempt.providerSessionId) return;
    const response=await this.request('https://api.liveavatar.com/v1/sessions/stop',{
      method:'POST',headers:{'X-API-KEY':this.config.apiKey,'Content-Type':'application/json'},cache:'no-store',signal:AbortSignal.timeout(8000),
      body:JSON.stringify({session_id:attempt.providerSessionId,reason:'USER_CLOSED'}),
    });
    if(response.status===404) return;
    if(response.ok){const data=await response.json() as {code?:number};if(data.code===1000||data.code===100)return;}
    // The SDK may win the stop race. Confirm a historic end rather than treating
    // every "already stopped" error as either a leak or a successful close.
    if(response.ok||response.status===400||response.status===409) {
      const existing=await this.request('https://api.liveavatar.com/v1/sessions/'+encodeURIComponent(attempt.providerSessionId),{headers:{'X-API-KEY':this.config.apiKey},cache:'no-store',signal:AbortSignal.timeout(5000)});
      if(existing.status===404)return;
      if(existing.ok){const result=await existing.json() as {code?:number;data?:{id?:string;end_at?:string}};if((result.code===1000||result.code===100)&&result.data?.id===attempt.providerSessionId&&result.data.end_at&&Number.isFinite(Date.parse(result.data.end_at)))return;}
    }
    throw new IntakeError(503,'CLEANUP_PENDING','The call is still closing.',true);
  }
  async credentials(attempt:Attempt) {
    if(!attempt.providerSessionId||!attempt.credentialCiphertext) throw new IntakeError(409,'ATTEMPT_CLOSED','This call has ended.');
    try{return{sessionToken:openToken(attempt.credentialCiphertext,this.config.encryptionKey,attempt.providerSessionId)};}
    catch{throw new IntakeError(503,'PROVIDER_CREDENTIALS','The saved connection could not be restored. End this call and start again.',true);}
  }
}
