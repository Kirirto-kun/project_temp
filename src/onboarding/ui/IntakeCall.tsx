'use client';
import { useCallback,useEffect,useRef,useState } from 'react';
import Link from 'next/link';
import { ArrowLeft,ArrowRight,Camera,CameraOff,Check,ChevronDown,Mic,MicOff,PhoneOff,Volume2,FileText,Captions,ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { IntakeViewSchema,type IntakeView,type TranscriptItem } from '../contracts';
import { createCallApi,requestJson } from '../client/api';
import { CallController,type CallState } from '../client/call';
import { createLiveAvatarSession } from '../client/liveavatar-session';
import { ManagedStream,deviceError } from '../client/devices';
import { Brand } from './Brand';
import { CoachPoster } from './CoachPoster';
import { BriefForm } from './BriefForm';

export function IntakeCall({id,initialForm=false}:{id:string;initialForm?:boolean}) {
  const [view,setView]=useState<IntakeView|null>(null);const viewRef=useRef<IntakeView|null>(null);
  const [error,setError]=useState('');const [available,setAvailable]=useState(false);const [formMode,setFormMode]=useState(initialForm);
  const [callState,setCallState]=useState<CallState>('idle');const [muted,setMuted]=useState(false);const [cameraOn,setCameraOn]=useState(false);
  const [micReady,setMicReady]=useState(false);const [deviceBusy,setDeviceBusy]=useState('');const [devices,setDevices]=useState<MediaDeviceInfo[]>([]);
  const [micDevice,setMicDevice]=useState('');const [cameraDevice,setCameraDevice]=useState('');const [level,setLevel]=useState(0);
  const [captions,setCaptions]=useState(true);const [liveCaption,setLiveCaption]=useState<TranscriptItem|null>(null);const [quality,setQuality]=useState('');const [soundBlocked,setSoundBlocked]=useState(false);
  const [deleting,setDeleting]=useState(false);const [deleted,setDeleted]=useState(false);const [initialLoad,setInitialLoad]=useState(0);
  const avatarVideo=useRef<HTMLVideoElement>(null);const localVideo=useRef<HTMLVideoElement>(null);
  const camera=useRef(new ManagedStream());const microphone=useRef(new ManagedStream());const controller=useRef<CallController|null>(null);const mounted=useRef(false);
  const acceptView=useCallback((next:IntakeView)=>{if(!mounted.current)return;if(viewRef.current&&next.revision<viewRef.current.revision)return;viewRef.current=next;setView(next);},[]);
  useEffect(()=>{
    mounted.current=true;let cancelled=false;const cameraDevice=camera.current;const microphoneDevice=microphone.current;
    Promise.all([requestJson('/'+id),requestJson('/config')]).then(([data,config])=>{if(cancelled)return;acceptView(IntakeViewSchema.parse(data));setAvailable(config.available===true);}).catch(e=>{if(!cancelled)setError(e instanceof Error?e.message:'The brief could not load.');});
    return()=>{cancelled=true;mounted.current=false;cameraDevice.release();microphoneDevice.release();controller.current?.dispose();};
  },[id,acceptView,initialLoad]);
  useEffect(()=>{
    if(!view||['connected','connecting'].includes(callState)||!['connecting','active','stopping'].includes(view.mediaStatus))return;
    const timer=setInterval(()=>{requestJson('/'+id).then(data=>acceptView(IntakeViewSchema.parse(data))).catch(()=>{});},2000);
    return()=>clearInterval(timer);
  },[id,callState,view,acceptView]);
  useEffect(()=>{
    const stream=microphone.current.stream;if(!micReady||!stream)return;
    const context=new AudioContext();const analyser=context.createAnalyser();analyser.fftSize=256;context.createMediaStreamSource(stream).connect(analyser);
    void context.resume().catch(()=>{});
    const samples=new Uint8Array(analyser.fftSize);
    const timer=setInterval(()=>{analyser.getByteTimeDomainData(samples);const rms=Math.sqrt(samples.reduce((sum,n)=>sum+((n-128)/128)**2,0)/samples.length);setLevel(Math.min(100,Math.round(rms*350)));},120);
    return()=>{clearInterval(timer);void context.close();};
  },[micReady]);
  async function listDevices(){if(navigator.mediaDevices?.enumerateDevices)setDevices(await navigator.mediaDevices.enumerateDevices());}
  async function checkMicrophone(deviceId=micDevice) {
    setDeviceBusy('microphone');setError('');setMicReady(false);
    try {const stream=await microphone.current.acquire({audio:{echoCancellation:true,noiseSuppression:true,...(deviceId?{deviceId:{exact:deviceId}}:{})},video:false});if(stream&&mounted.current){setMicReady(true);await listDevices();}}
    catch(e){if(mounted.current)setError(deviceError(e));}finally{if(mounted.current)setDeviceBusy('');}
  }
  async function toggleCamera(deviceId=cameraDevice) {
    if(cameraOn){camera.current.release();if(localVideo.current)localVideo.current.srcObject=null;setCameraOn(false);return;}
    setDeviceBusy('camera');setError('');
    try {const stream=await camera.current.acquire({video:{width:{ideal:640},height:{ideal:360},...(deviceId?{deviceId:{exact:deviceId}}:{})},audio:false});if(stream&&mounted.current){if(localVideo.current)localVideo.current.srcObject=stream;setCameraOn(true);await listDevices();}}
    catch(e){if(mounted.current)setError(deviceError(e));}finally{if(mounted.current)setDeviceBusy('');}
  }
  function stopLocalDevices(){camera.current.release();microphone.current.release();if(localVideo.current)localVideo.current.srcObject=null;setCameraOn(false);setMicReady(false);setLevel(0);}
  function start() {
    const current=viewRef.current;if(!current||!available||!micReady)return;
    microphone.current.release();setMicReady(false);setMuted(false);setError('');setSoundBlocked(false);
    let clientId:string;
    try{clientId=sessionStorage.getItem('holdline.intake.client.v1')??crypto.randomUUID();sessionStorage.setItem('holdline.intake.client.v1',clientId);}catch{clientId=crypto.randomUUID();}
    if(!controller.current)controller.current=new CallController(createCallApi(id),createLiveAvatarSession,{
      onState:state=>{if(!mounted.current)return;setCallState(state);if(state==='ending'||state==='ended'||state==='error')stopLocalDevices();},
      onView:acceptView,onCaption:item=>{if(mounted.current)setLiveCaption(item);},onError:message=>{if(mounted.current)setError(message);},onQuality:value=>{if(mounted.current)setQuality(value);},
    },clientId);
    if(avatarVideo.current)controller.current.attach(avatarVideo.current);
    void controller.current.start(current,micDevice||undefined);
  }
  async function end(reason:'user'|'fallback'|'review'='user') {
    stopLocalDevices();setError('');
    if(controller.current){await controller.current.end(reason);return;}
    if(viewRef.current){setCallState('ending');try{acceptView(IntakeViewSchema.parse(await requestJson('/'+id+'/stop','POST',{reason,providerEpoch:viewRef.current.providerEpoch||undefined},crypto.randomUUID(),true)));setCallState('ended');}catch(e){setError(e instanceof Error?e.message:'The call is still closing.');setCallState('error');}}
  }
  async function toggleMute(){try{await controller.current?.mute(!muted);setMuted(!muted);}catch{setError('The microphone could not change. End the call if you need to stop it.');}}
  async function enableSound(){try{if(avatarVideo.current){avatarVideo.current.muted=false;await avatarVideo.current.play();setSoundBlocked(false);}}catch{setSoundBlocked(true);}}
  async function removeBrief(){if(!window.confirm('Delete this brief and end any active call?'))return;setDeleting(true);stopLocalDevices();await controller.current?.end('user');try{await requestJson('/'+id,'DELETE',undefined,crypto.randomUUID());setDeleted(true);}catch(e){setError(e instanceof Error?e.message:'Deletion could not finish. Please retry.');}finally{setDeleting(false);}}
  if(deleted)return <><Brand/><main className="empty-state"><h1>Brief deleted.</h1><p>Your saved brief and transcript have been removed from this service.</p><Link href="/" className="btn btn-primary">Back to Holdline<ArrowRight size={18} aria-hidden="true"/></Link></main></>;
  if(!view)return <><Brand/><main className="empty-state"><h1>{error?'This brief could not open.':'Opening your brief…'}</h1>{error?<><p role="alert">{error}</p><Button onClick={()=>{setError('');setInitialLoad(n=>n+1);}}>Try again</Button><Link href="/">Start a new brief</Link></>:<p role="status">Loading your saved answers.</p>}</main></>;
  const live=callState==='connected';const busy=callState==='connecting'||callState==='ending';
  const hasOpenCall=['active','connecting','stopping'].includes(view.mediaStatus);
  const review=formMode||view.phase==='review'||view.phase==='completed';
  const canConnect=!hasOpenCall&&available&&!view.confirmed&&!busy;
  const status=live?'Connected':callState==='connecting'?'Connecting to Alex…':callState==='ending'?'Ending the call…':hasOpenCall&&callState==='idle'?'A previous call is still open':view.mediaStatus==='closed'?'Call ended':'Ready when you are';
  return <><Brand/><main className="call-layout"><div className="call-topline"><Link href="/" className="back-link"><ArrowLeft size={15} aria-hidden="true"/>Your conversation</Link><span className="small muted">AI coach · camera optional</span></div>
    <div className="call-columns"><section className="call-main" aria-label="Conversation with Alex">
      <div className="call-stage"><CoachPoster className={live?'poster-hidden':''}/>
        <video ref={avatarVideo} className={'avatar-video '+(live?'is-visible':'')} autoPlay playsInline aria-label="Alex live video" onPlaying={()=>setSoundBlocked(false)} onPause={()=>{if(live)setSoundBlocked(true);}}/>
        <div className="stage-top"><span className="ai-badge">AI PRACTICE COACH</span><span className={'call-status '+(live?'is-live':'')} role="status"><span className="status-dot"/>{status}</span></div>
        <div className="stage-name"><strong>Alex</strong><span>{live?'Your practice coach':'Illustrated preview · live video starts after Connect'}</span></div>
        <div className={'self-view '+(cameraOn?'camera-on':'')}><video ref={localVideo} autoPlay muted playsInline aria-label="Your camera preview, kept on this device"/>{!cameraOn?<CameraOff size={24} strokeWidth={1.5} aria-hidden="true"/>:null}<span>You · local only</span></div>
        {live&&soundBlocked?<Button className="enable-sound" variant="primary" onClick={()=>void enableSound()}><Volume2 size={18} aria-hidden="true"/>Enable sound</Button>:null}
      </div>
      <div className="call-controls"><div className="button-row"><Button onClick={()=>void(live?toggleMute():checkMicrophone())} aria-pressed={live?muted:micReady} disabled={!!deviceBusy||busy||(!live&&hasOpenCall)}>{live&&muted?<MicOff size={18} aria-hidden="true"/>:<Mic size={18} aria-hidden="true"/>}{live?(muted?'Unmute':'Mute'):deviceBusy==='microphone'?'Checking…':micReady?'Microphone checked':'Check microphone'}</Button><Button onClick={()=>void toggleCamera()} aria-pressed={cameraOn} disabled={!!deviceBusy||callState==='ending'}>{cameraOn?<Camera size={18} aria-hidden="true"/>:<CameraOff size={18} aria-hidden="true"/>}{cameraOn?'Camera on':'Camera off'}</Button></div>
        {live||busy||hasOpenCall?<Button variant="end" onClick={()=>void end()} disabled={callState==='ending'}><PhoneOff size={18} aria-hidden="true"/>End</Button>:<Button variant="primary" onClick={start} disabled={!canConnect||!micReady}>{view.providerEpoch?'Start another call':'Connect to Alex'}<ArrowRight size={18} aria-hidden="true"/></Button>}
      </div>
      {live?<div className="call-secondary"><Button variant="quiet" onClick={()=>setCaptions(!captions)} aria-pressed={captions}><Captions size={17} aria-hidden="true"/>{captions?'Hide captions':'Show captions'}</Button><Button variant="quiet" onClick={()=>void enableSound()}><Volume2 size={17} aria-hidden="true"/>Enable sound</Button>{quality&&quality.toLowerCase().includes('poor')?<span className="small connection-warning" role="status">Connection is unstable</span>:null}</div>:null}
      {captions&&live?<div className="caption-panel" role="log" aria-live="polite"><span className="label">{liveCaption?.role==='user'?'YOU':'ALEX'}</span><p>{liveCaption?.text??'Take your time. Alex is listening.'}</p></div>:null}
      {!live&&!busy&&!review?<div className="lobby-panel"><div className="section-heading"><div><span className="eyebrow">BEFORE YOU CONNECT</span><h1>A moment to get ready.</h1></div><span className="step-number">01 / 02</span></div><p>Check your microphone, then connect. Your camera is optional and stays on this device.</p>
        <div className="mic-check"><span className="small">Microphone level</span><div className="level-track" role="meter" aria-label="Microphone input level" aria-valuemin={0} aria-valuemax={100} aria-valuenow={level}><span style={{transform:`scaleX(${level/100})`}}/></div><span className="small muted">{micReady?'Try saying a sentence':'Not checked'}</span></div>
        {devices.length?<div className="form-pair device-selects"><label>Microphone<span className="select-wrap"><select value={micDevice} onChange={event=>{setMicDevice(event.target.value);void checkMicrophone(event.target.value);}} disabled={!!deviceBusy}>{devices.filter(d=>d.kind==='audioinput').map((d,i)=><option key={d.deviceId} value={d.deviceId}>{d.label||`Microphone ${i+1}`}</option>)}</select><ChevronDown size={16} aria-hidden="true"/></span></label><label>Camera<span className="select-wrap"><select value={cameraDevice} onChange={event=>{setCameraDevice(event.target.value);camera.current.release();if(localVideo.current)localVideo.current.srcObject=null;setCameraOn(false);}} disabled={!!deviceBusy}>{devices.filter(d=>d.kind==='videoinput').map((d,i)=><option key={d.deviceId} value={d.deviceId}>{d.label||`Camera ${i+1}`}</option>)}</select><ChevronDown size={16} aria-hidden="true"/></span></label></div>:null}
        {!available?<p className="notice">Video conversations are not available yet. You can prepare and save the same brief in the form.</p>:null}
        <details className="privacy-details"><summary><ShieldCheck size={16} aria-hidden="true"/>How your data is used</summary><p>Your voice goes to LiveAvatar for the conversation. The coach uses our model and voice providers to respond. This service keeps your brief and transcript for up to 24 hours and does not save an audio recording. Your camera stays local; visual analysis is off. Provider retention policies apply separately.</p></details>
        <p className="small muted">Calls have a fixed time limit. You can end or switch to the form at any time.</p>
      </div>:null}
      {error?<div role="alert" className="notice notice-error"><p>{error}</p>{callState==='error'&&hasOpenCall?<Button onClick={()=>void end()}>Retry End</Button>:null}</div>:null}
      <div className="form-fallback"><FileText size={17} aria-hidden="true"/><span>Prefer to write it down?</span><Button variant="quiet" onClick={()=>{setFormMode(true);stopLocalDevices();if(controller.current||hasOpenCall)void end('fallback');}}>Use the quick form<ArrowRight size={15} aria-hidden="true"/></Button></div>
      {view.committedTranscript.length&&review?<details className="saved-transcript"><summary>Conversation transcript <span>{view.committedTranscript.length} messages</span></summary>{view.committedTranscript.map(item=><div key={item.turnId} className="transcript-line"><span className="label">{item.role==='user'?'YOU':'ALEX'}{item.interrupted?' · INTERRUPTED':''}</span><p>{item.text}</p></div>)}</details>:null}
    </section><aside className="brief-column"><BriefForm key={review?'review':'live'} view={view} onView={acceptView} initialEditing={formMode&&!view.confirmed} readOnly={!review}/>{!review?<div className="quiet-card"><span className="eyebrow">ONE QUESTION AT A TIME</span><p>You don’t need a perfect answer.<br/>Start with what you know.</p><ul className="simple-checks"><li><Check size={14} aria-hidden="true"/>Skip what you don’t want to share</li><li><Check size={14} aria-hidden="true"/>Correct any answer after the call</li><li><Check size={14} aria-hidden="true"/>You confirm the final brief</li></ul></div>:null}</aside></div>
    <footer className="call-footer"><span className="small muted">Holdline keeps this brief for up to 24 hours.</span><Button variant="quiet" onClick={()=>void removeBrief()} disabled={deleting}>{deleting?'Deleting…':'Delete my brief'}</Button></footer>
  </main></>;
}
