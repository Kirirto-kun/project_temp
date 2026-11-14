import type { ClientEvent, ClientTool, ProfilePatch } from '../contracts';
import { ProfilePatchSchema } from '../contracts';
import { QuizAnswersSchema } from '@/contracts/domain';
import { conflict, IntakeError } from './errors';
import { CallService, fingerprint, publicView, type IntakeRecord } from './service';

export class ProfileControl {
  constructor(private service:CallService) {}
  private apply(record:IntakeRecord,patch:ProfilePatch) {
    const parsed=ProfilePatchSchema.safeParse(patch);
    if(!parsed.success) throw new IntakeError(400,'INVALID_PROFILE','Check the brief fields and amounts.');
    const profile={...record.profile};
    for(const [name,value]of Object.entries(parsed.data)) {
      if(value===null)delete (profile as Record<string,unknown>)[name];
      else if(value!==undefined)(profile as Record<string,unknown>)[name]=value;
    }
    if(profile.kind && profile.kind!=='raise') throw new IntakeError(400,'UNSUPPORTED_SCENARIO','This coach currently prepares salary-raise conversations.');
    if(['currentMinor','targetMinor','marketLowMinor','marketHighMinor'].some(k=>k in profile) && (!profile.currency||!profile.period||!profile.moneyBasis)) throw new IntakeError(400,'MONEY_UNITS_REQUIRED','Confirm currency, period and gross/net before saving an amount.');
    if(profile.marketLowMinor!==undefined&&profile.marketHighMinor!==undefined&&profile.marketLowMinor>profile.marketHighMinor) throw new IntakeError(400,'INVALID_RANGE','The lower range must not exceed the upper range.');
    const next=structuredClone(record);
    if(fingerprint(profile)!==fingerprint(record.profile)) {
      next.profile=profile;next.profileRevision++;next.confirmedAt=null;
      if(next.phase==='completed') next.phase='review';
    }
    return next;
  }
  private replay(record:IntakeRecord,key:string,input:unknown) {
    const prior=record.receipts[key];
    if(prior&&prior.fingerprint!==fingerprint(input)) throw new IntakeError(409,'IDEMPOTENCY_CONFLICT','This request key was used for different input.');
    return !!prior;
  }
  missing(record:IntakeRecord):string[] {
    const result=QuizAnswersSchema.safeParse(record.profile);
    return result.success?[]:[...new Set(result.error.issues.map(i=>String(i.path[0])))];
  }
  async patch(owner:string,id:string,key:string,input:{expectedRevision:number;patch:ProfilePatch}) {
    const record=await this.service.load(id,owner);
    if(this.replay(record,key,input)) return publicView(record);
    if(record.revision!==input.expectedRevision) throw conflict(record.revision);
    const next=this.apply(record,input.patch);this.service.addReceipt(next,key,input);
    if(!await this.service.save(record,next)) throw conflict();
    return publicView(next);
  }
  async confirm(owner:string,id:string,key:string,input:{expectedRevision:number}) {
    const record=await this.service.load(id,owner);
    if(!this.replay(record,key,input)) {
      if(record.revision!==input.expectedRevision) throw conflict(record.revision);
      const next=structuredClone(record);next.confirmedAt=new Date(this.service.now()).toISOString();next.phase='completed';
      this.service.addReceipt(next,key,input,record.attempt?.epoch??0);
      if(!await this.service.save(record,next)) throw conflict();
    }
    return this.service.stop(owner,id,'confirm-stop:'+key,'review',record.receipts[key]?.epoch??record.attempt?.epoch??0);
  }
  private bound(record:IntakeRecord,input:{providerEpoch:number;clientId:string}) {
    if(record.attempt?.epoch!==input.providerEpoch) throw new IntakeError(409,'STALE_ATTEMPT','This event belongs to an old call.');
    if(record.attempt.clientId!==input.clientId) throw new IntakeError(409,'CALL_IN_USE','This call is open in another tab.');
    if(!['connecting','active'].includes(record.mediaStatus)||Date.parse(record.attempt.deadlineAt)<=this.service.now()) throw new IntakeError(409,'ATTEMPT_CLOSED','This call has ended.');
  }
  async event(owner:string,id:string,input:ClientEvent) {
    for(let retry=0;retry<16;retry++) {
      const record=await this.service.load(id,owner);this.bound(record,input);
      if(record.clientEvents.includes(input.eventId)) return {continue:true,view:publicView(record)};
      const next=structuredClone(record);next.attempt!.lastHeartbeatAt=this.service.now();
      if(input.type==='ready'){next.mediaStatus='active';if(next.phase==='connecting')next.phase='interviewing';}
      if(input.type==='transcript'){
        if(!input.transcript) throw new IntakeError(400,'INVALID_INPUT','Transcript is missing.');
        const index=next.transcript.findIndex(t=>t.turnId===input.transcript!.turnId);
        if(index<0) next.transcript=[...next.transcript,input.transcript].slice(-100);
        else if(input.transcript.role==='assistant'&&input.transcript.interrupted&&next.transcript[index].role==='assistant') next.transcript[index]=input.transcript;
      }
      next.clientEvents=[...next.clientEvents,input.eventId].slice(-500);
      if(await this.service.save(record,next)) return {continue:true,view:publicView(next)};
    }
    throw conflict();
  }
  async tool(owner:string,id:string,input:ClientTool) {
    const record=await this.service.load(id,owner);this.bound(record,input);
    const key='tool:'+input.callId;
    if(this.replay(record,key,input)) return {view:publicView(record),missingFields:this.missing(record)};
    if(record.revision!==input.expectedRevision)throw conflict(record.revision);
    let next=structuredClone(record);
    if(input.toolName==='save_profile') {
      if(!input.payload.patch||Object.keys(input.payload.patch).length===0)throw new IntakeError(400,'EMPTY_PATCH','No answers were provided.');
      next=this.apply(record,input.payload.patch);
    }
    if(input.toolName==='request_mini_practice')next.phase='mini_practice';
    this.service.addReceipt(next,key,input);
    if(!await this.service.save(record,next))throw conflict();
    if(input.toolName==='prepare_confirmation'||input.toolName==='request_end') {
      const view=await this.service.stop(owner,id,'tool-stop:'+input.callId,'review',input.providerEpoch);
      return {view,missingFields:this.missing(next)};
    }
    return {view:publicView(next),missingFields:this.missing(next)};
  }
  async handoff(owner:string,id:string) {
    const record=await this.service.load(id,owner);
    if(!record.confirmedAt)throw new IntakeError(409,'CONFIRMATION_REQUIRED','Check and confirm your brief first.');
    if(record.mediaStatus!=='closed')throw new IntakeError(409,'CLEANUP_PENDING','End the call before starting your practice.',true);
    return {intakeId:id,profileRevision:record.profileRevision,confirmedAt:record.confirmedAt,quizDraft:{...record.profile,sourceIntakeId:id},missingFields:this.missing(record),suggestedAvatarId:null,referenceKind:null,assessmentId:null,mode:record.profile.inputMode??'personal'};
  }
}
