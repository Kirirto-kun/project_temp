import type { ClientEvent,ClientTool,ClientRespond,CoachReply,Connection,ConnectInput,IntakeView,StopReason,TranscriptItem } from '../contracts';
import { ClientToolSchema } from '../contracts';
import { ApiError } from './api';

export type CallState='idle'|'connecting'|'connected'|'ending'|'ended'|'error';
export interface CallSession {
  start():Promise<void>;stop():Promise<void>;releaseMicrophone():void;setMuted(muted:boolean):Promise<void>;
  attach(element:HTMLVideoElement):void;keepAlive():Promise<void>;
  sendToolResult(id:string,result:string,isError:boolean):void;sendText(text:string):void;
  speak(text:string):void;interrupt():void;
}
export interface SessionCallbacks {
  caption(role:'user'|'assistant',text:string,turnId:string,interrupted?:boolean):void;
  tool(callId:string,name:string,parameters:unknown):void;
  disconnected():void;quality(quality:string):void;
  speechStarted?():void;
}
export type SessionFactory=(token:string,callbacks:SessionCallbacks,deviceId?:string)=>Promise<CallSession>;
export interface CallApi {
  connect(input:ConnectInput,key:string):Promise<Connection>;
  event(input:ClientEvent):Promise<{continue:boolean;view:IntakeView}>;
  tool(input:ClientTool):Promise<{view:IntakeView;missingFields:string[]}>;
  respond(input:ClientRespond,signal:AbortSignal):Promise<CoachReply>;
  read():Promise<IntakeView>;stop(reason:StopReason,key:string,providerEpoch?:number):Promise<IntakeView>;
}
interface CallCallbacks {onState(state:CallState):void;onView(view:IntakeView):void;onCaption(item:TranscriptItem):void;onError(message:string):void;onQuality?(quality:string):void}

export class CallController {
  state:CallState='idle';
  private generation=0;
  private session:CallSession|null=null;
  private connection:Connection|null=null;
  private video:HTMLVideoElement|null=null;
  private heartbeat:ReturnType<typeof setInterval>|null=null;
  private timeout:ReturnType<typeof setTimeout>|null=null;
  private deadline:ReturnType<typeof setTimeout>|null=null;
  private ending:Promise<void>|null=null;
  private heartbeatBusy=false;
  private heartbeatFailures=0;
  private attemptEpoch:number|undefined;
  private lastKeepAlive=0;
  private tools=new Map<string,Promise<void>>();
  private toolQueue=Promise.resolve();
  private eventQueue=Promise.resolve();
  private replyGeneration=0;
  private replyAbort:AbortController|null=null;
  constructor(private api:CallApi,private factory:SessionFactory,private callbacks:CallCallbacks,readonly clientId:string) {}
  private setState(state:CallState){this.state=state;this.callbacks.onState(state);}
  attach(element:HTMLVideoElement){this.video=element;this.session?.attach(element);}
  private clearTimers(){if(this.heartbeat)clearInterval(this.heartbeat);if(this.timeout)clearTimeout(this.timeout);if(this.deadline)clearTimeout(this.deadline);this.heartbeat=this.timeout=this.deadline=null;}
  private cancelReply(){this.replyAbort?.abort();this.replyAbort=null;this.replyGeneration++;}
  async start(view:IntakeView,deviceId?:string) {
    if(this.state==='connecting'||this.state==='connected'||this.state==='ending')return;
    const generation=++this.generation;this.setState('connecting');this.callbacks.onError('');
    this.attemptEpoch=view.providerEpoch+1;this.lastKeepAlive=Date.now();
    this.heartbeatFailures=0;this.tools.clear();
    this.cancelReply();this.replyGeneration=0;
    this.timeout=setTimeout(()=>{this.callbacks.onError('Alex is taking longer to connect. Your brief is saved. You can try again or use the form.');void this.end('error');},30000);
    try {
      const connection=await this.api.connect({expectedRevision:view.revision,mode:'video',restart:view.providerEpoch>0,clientId:this.clientId},crypto.randomUUID());
      if(generation!==this.generation){await this.api.stop('user',crypto.randomUUID(),connection.providerEpoch).catch(()=>{});return;}
      this.connection=connection;this.callbacks.onView(connection.view);
      this.attemptEpoch=connection.providerEpoch;
      this.heartbeat=setInterval(()=>void this.pulse(generation),5000);
      this.deadline=setTimeout(()=>void this.end('timeout'),Math.max(0,Date.parse(connection.deadlineAt)-Date.now()));
      const session=await this.factory(connection.sessionToken,{
        caption:(role,text,turnId,interrupted=false)=>{
          if(generation!==this.generation||!text.trim())return;
          const item={role,text:text.slice(0,4000),turnId:turnId.slice(0,160),interrupted};this.callbacks.onCaption(item);
          const committed=this.eventQueue.then(async()=>{
            if(generation!==this.generation)return;
            const result=await this.api.event({clientId:this.clientId,providerEpoch:connection.providerEpoch,eventId:crypto.randomUUID(),type:'transcript',transcript:item});
            if(generation!==this.generation)return;
            this.callbacks.onView(result.view);
            if(!result.continue)await this.end('timeout');
          });
          this.eventQueue=committed.catch(()=>{});
          if(role==='user')void this.respondToUser(item.turnId,generation,connection,committed);
        },
        speechStarted:()=>{
          if(generation!==this.generation)return;
          this.cancelReply();this.session?.interrupt();
          this.eventQueue=this.eventQueue.then(async()=>{
            if(generation!==this.generation)return;
            await this.api.event({clientId:this.clientId,providerEpoch:connection.providerEpoch,eventId:crypto.randomUUID(),type:'speech_started'});
          }).catch(()=>{});
        },
        tool:(id,name,parameters)=>{if(generation===this.generation)this.handleTool(id,name,parameters,generation);},
        disconnected:()=>{if(generation===this.generation&&this.state!=='ending'){this.callbacks.onError('The connection ended. Your brief is saved.');void this.end('disconnect');}},
        quality:q=>{if(generation===this.generation)this.callbacks.onQuality?.(q);},
      },deviceId);
      if(generation!==this.generation){session.releaseMicrophone();await session.stop().catch(()=>{});return;}
      this.session=session;
      await session.start();
      if(generation!==this.generation){session.releaseMicrophone();await session.stop().catch(()=>{});return;}
      if(this.video)session.attach(this.video);
      const ready=await this.api.event({clientId:this.clientId,providerEpoch:connection.providerEpoch,eventId:crypto.randomUUID(),type:'ready'});
      if(generation!==this.generation)return;
      this.callbacks.onView(ready.view);
      if(!ready.continue){await this.end('timeout');return;}
      await session.setMuted(false);
      if(generation!==this.generation){session.releaseMicrophone();await session.stop().catch(()=>{});return;}
      if(this.timeout)clearTimeout(this.timeout);this.timeout=null;this.setState('connected');
      if(this.replyGeneration===0)session.speak('Hi, I am Alex, your AI practice coach. What conversation would you like to prepare for? You can skip any question or end at any time.');
    }catch(error){
      if(generation!==this.generation)return;
      this.callbacks.onError(error instanceof ApiError?error.message:'Alex could not connect. Check your microphone or use the quick form.');
      await this.end('error');
    }
  }
  private async respondToUser(turnId:string,generation:number,connection:Connection,committed:Promise<void>){
    this.cancelReply();const replyGeneration=this.replyGeneration;const abort=new AbortController();this.replyAbort=abort;
    const current=()=>generation===this.generation&&replyGeneration===this.replyGeneration&&this.connection===connection&&!abort.signal.aborted;
    try{
      await committed;if(!current())return;
      const response=await this.api.respond({clientId:this.clientId,providerEpoch:connection.providerEpoch,turnId},abort.signal);
      if(!current()||response.providerEpoch!==connection.providerEpoch||response.turnId!==turnId)return;
      this.callbacks.onView(response.view);
      if(!['connecting','active'].includes(response.view.mediaStatus)){await this.end('review');return;}
      this.session?.speak(response.reply);
    }catch(error){
      if(!current())return;
      this.callbacks.onError(error instanceof ApiError?error.message:'The coach could not answer. Your brief is saved; you can use the form.');
      await this.end('error');
    }finally{if(this.replyAbort===abort)this.replyAbort=null;}
  }
  private async pulse(generation:number) {
    if(this.heartbeatBusy||!this.connection||generation!==this.generation)return;
    this.heartbeatBusy=true;
    try {
      const result=await this.api.event({clientId:this.clientId,providerEpoch:this.connection.providerEpoch,eventId:crypto.randomUUID(),type:'heartbeat'});
      if(generation!==this.generation)return;
      this.callbacks.onView(result.view);this.heartbeatFailures=0;
      if(!result.continue){await this.end('timeout');return;}
      if(Date.now()-this.lastKeepAlive>=30000){await this.session?.keepAlive();this.lastKeepAlive=Date.now();}
    }catch{
      if(generation===this.generation&&++this.heartbeatFailures>=2){this.callbacks.onError('The connection is unstable. Your microphone has been stopped; your brief is saved.');await this.end('disconnect');}
    }finally{this.heartbeatBusy=false;}
  }
  private handleTool(callId:string,name:string,parameters:unknown,generation:number) {
    if(this.tools.has(callId))return;
    const connection=this.connection;if(!connection)return;
    const current=()=>generation===this.generation&&this.connection===connection;
    const task=this.toolQueue.then(async()=>{
      if(!current())return;
      let isError=false;let message='';
      try {
        const snapshot=await this.api.read();
        if(!current())return;
        const input=ClientToolSchema.parse({clientId:this.clientId,providerEpoch:connection.providerEpoch,callId,expectedRevision:snapshot.revision,toolName:name,payload:parameters});
        let result;
        try{result=await this.api.tool(input);}
        catch(error){
          if(!current())return;
          if(error instanceof ApiError&&error.code==='REVISION_CONFLICT'){
            input.expectedRevision=(await this.api.read()).revision;
            if(!current())return;
          }
          result=await this.api.tool(input); // Same body on an ambiguous network retry.
        }
        if(!current()||result.view.providerEpoch!==connection.providerEpoch)return;
        this.callbacks.onView(result.view);message=JSON.stringify({saved:true,confirmed:result.view.confirmed,profileRevision:result.view.profileRevision,missingFields:result.missingFields});
        if(result.view.mediaStatus==='closed'||result.view.mediaStatus==='stopping')setTimeout(()=>{if(current())void this.end('review');},0);
      }catch(error){isError=true;message=error instanceof ApiError?error.message:'The answers could not be saved. Ask the user to check the brief.';}
      if(current())this.session?.sendToolResult(callId,message,isError);
    });
    this.tools.set(callId,task);this.toolQueue=task.catch(()=>{});
  }
  async mute(muted:boolean){await this.session?.setMuted(muted);}
  sendText(text:string){if(this.state==='connected'&&text.trim())this.session?.sendText(text.trim().slice(0,2000));}
  async end(reason:StopReason) {
    if(this.ending)return this.ending;
    if(this.state==='ended')return;
    ++this.generation;this.cancelReply();this.clearTimers();this.setState('ending');
    const session=this.session;this.session=null;
    session?.releaseMicrophone();
    if(this.video){this.video.pause();this.video.muted=true;this.video.srcObject=null;}
    this.ending=(async()=>{
      // Local silence and remote stop are independent; neither waits for the other.
      const sdkStop=session?session.stop().catch(()=>{}):Promise.resolve();
      try {
        const result=await this.api.stop(reason,crypto.randomUUID(),this.attemptEpoch);this.callbacks.onView(result);
        if(result.mediaStatus==='closed')this.setState('ended');
        else{this.setState('error');this.callbacks.onError('The call is closing. You can retry End; your brief is saved.');}
      }catch{this.setState('error');this.callbacks.onError('Your microphone is off. Server cleanup is pending; retry End when the connection returns.');}
      void sdkStop;
    })();
    try{await this.ending;}finally{this.ending=null;}
  }
  dispose(){if(this.state!=='idle'&&this.state!=='ended')void this.end('disconnect');}
}
