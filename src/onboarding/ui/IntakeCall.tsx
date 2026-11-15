'use client';
import { useCallback,useEffect,useRef,useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowLeft,ArrowRight,Camera,CameraOff,ChevronDown,Mic,MicOff,PhoneOff,Volume2,FileText,Captions,ShieldCheck,Maximize,Minimize,PanelRight,X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { IntakeViewSchema,type IntakeView,type TranscriptItem } from '../contracts';
import { createCallApi,requestJson } from '../client/api';
import { CallController,type CallState } from '../client/call';
import { createLiveAvatarSession } from '../client/liveavatar-session';
import { ManagedStream,deviceError } from '../client/devices';
import { Brand } from './Brand';
import { CoachPoster } from './CoachPoster';
import { BriefForm } from './BriefForm';
import styles from './call-room.module.css';

export function IntakeCall({id,initialForm=false}:{id:string;initialForm?:boolean}) {
  const [view,setView]=useState<IntakeView|null>(null);const viewRef=useRef<IntakeView|null>(null);
  const [error,setError]=useState('');const [available,setAvailable]=useState(false);const [formMode,setFormMode]=useState(initialForm);
  const [callState,setCallState]=useState<CallState>('idle');const [muted,setMuted]=useState(false);const [cameraOn,setCameraOn]=useState(false);
  const [micReady,setMicReady]=useState(false);const [deviceBusy,setDeviceBusy]=useState('');const [devices,setDevices]=useState<MediaDeviceInfo[]>([]);
  const [micDevice,setMicDevice]=useState('');const [cameraDevice,setCameraDevice]=useState('');const [level,setLevel]=useState(0);
  const [captions,setCaptions]=useState(true);const [liveCaption,setLiveCaption]=useState<TranscriptItem|null>(null);const [quality,setQuality]=useState('');const [soundBlocked,setSoundBlocked]=useState(false);
  const [deleting,setDeleting]=useState(false);const [deleted,setDeleted]=useState(false);const [initialLoad,setInitialLoad]=useState(0);
  const [panelOpen,setPanelOpen]=useState(initialForm);const [videoPlaying,setVideoPlaying]=useState(false);
  const [avatarPreviewUrl,setAvatarPreviewUrl]=useState<string|null>(null);const [previewUnavailable,setPreviewUnavailable]=useState(false);
  const [fullscreen,setFullscreen]=useState(false);const [fullscreenError,setFullscreenError]=useState('');const room=useRef<HTMLElement>(null);
  const avatarVideo=useRef<HTMLVideoElement>(null);const localVideo=useRef<HTMLVideoElement>(null);
  const camera=useRef(new ManagedStream());const microphone=useRef(new ManagedStream());const controller=useRef<CallController|null>(null);const mounted=useRef(false);
  const acceptView=useCallback((next:IntakeView)=>{if(!mounted.current)return;if(viewRef.current&&next.revision<viewRef.current.revision)return;const previous=viewRef.current;if((next.mediaStatus==='closed'||next.phase==='review'||next.phase==='completed')&&(!previous||previous.mediaStatus!==next.mediaStatus||previous.phase!==next.phase))setPanelOpen(true);viewRef.current=next;setView(next);},[]);
  useEffect(()=>{
    mounted.current=true;let cancelled=false;const cameraDevice=camera.current;const microphoneDevice=microphone.current;
    Promise.all([requestJson('/'+id),requestJson('/config')]).then(([data,config])=>{if(cancelled)return;acceptView(IntakeViewSchema.parse(data));setAvailable(config.available===true);setAvatarPreviewUrl(typeof config.avatarPreviewUrl==='string'&&/^\/intake\/[\w/-]+\.(?:webp|png|jpe?g)$/i.test(config.avatarPreviewUrl)?config.avatarPreviewUrl:null);}).catch(e=>{if(!cancelled)setError(e instanceof Error?e.message:'The brief could not load.');});
    return()=>{cancelled=true;mounted.current=false;cameraDevice.release();microphoneDevice.release();controller.current?.dispose();};
  },[id,acceptView,initialLoad]);
  useEffect(()=>{
    const update=()=>setFullscreen(document.fullscreenElement===room.current);
    document.addEventListener('fullscreenchange',update);
    return()=>document.removeEventListener('fullscreenchange',update);
  },[]);
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
    microphone.current.release();setMicReady(false);setMuted(false);setError('');setSoundBlocked(false);setVideoPlaying(false);setPanelOpen(false);
    let clientId:string;
    try{clientId=sessionStorage.getItem('holdline.intake.client.v1')??crypto.randomUUID();sessionStorage.setItem('holdline.intake.client.v1',clientId);}catch{clientId=crypto.randomUUID();}
    if(!controller.current)controller.current=new CallController(createCallApi(id),createLiveAvatarSession,{
      onState:state=>{if(!mounted.current)return;setCallState(state);if(state!=='connected')setVideoPlaying(false);if(state==='ending'||state==='ended'||state==='error')stopLocalDevices();},
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
  async function toggleFullscreen(){
    setFullscreenError('');
    try{if(document.fullscreenElement===room.current)await document.exitFullscreen();else if(room.current?.requestFullscreen)await room.current.requestFullscreen();else throw new Error('unsupported');}
    catch{if(mounted.current)setFullscreenError('Full screen is unavailable in this browser. You can keep using the call here.');}
  }
  function useQuickForm(){setFormMode(true);setPanelOpen(true);stopLocalDevices();if(controller.current||viewRef.current&&['active','connecting','stopping'].includes(viewRef.current.mediaStatus))void end('fallback');}
  async function removeBrief(){if(!window.confirm('Delete this brief and end any active call?'))return;setDeleting(true);stopLocalDevices();await controller.current?.end('user');try{await requestJson('/'+id,'DELETE',undefined,crypto.randomUUID());setDeleted(true);}catch(e){setError(e instanceof Error?e.message:'Deletion could not finish. Please retry.');}finally{setDeleting(false);}}
  if(deleted)return <><Brand/><main className="empty-state"><h1>Brief deleted.</h1><p>Your saved brief and transcript have been removed from this service.</p><Link href="/" className="btn btn-primary">Back to Holdline<ArrowRight size={18} aria-hidden="true"/></Link></main></>;
  if(!view)return <><Brand/><main className="empty-state"><h1>{error?'This brief could not open.':'Opening your brief…'}</h1>{error?<><p role="alert">{error}</p><Button onClick={()=>{setError('');setInitialLoad(n=>n+1);}}>Try again</Button><Link href="/">Start a new brief</Link></>:<p role="status">Loading your saved answers.</p>}</main></>;
  const connected=callState==='connected';const live=connected&&videoPlaying;const busy=callState==='connecting'||callState==='ending';
  const hasOpenCall=['active','connecting','stopping'].includes(view.mediaStatus);
  const review=formMode||view.phase==='review'||view.phase==='completed'||view.mediaStatus==='closed';
  const canConnect=!hasOpenCall&&available&&!view.confirmed&&!busy;
  const status=live?'Connected':connected?'Waiting for live video…':callState==='connecting'?'Connecting to Alex…':callState==='ending'?'Ending the call…':hasOpenCall&&callState==='idle'?'A previous call is still open':view.mediaStatus==='closed'?'Call ended':'Ready when you are';
  const hasPreview=avatarPreviewUrl&&!previewUnavailable;
  return <main ref={room} className={styles.room} aria-label="Call room">
    <header className={styles.header}>
      <Link href="/" className={styles.back}><ArrowLeft size={20} strokeWidth={1.5} aria-hidden="true"/><span>holdline<span className={styles.brandDot}>.</span></span></Link>
      <span className={styles.status} role="status"><span className={live?styles.liveDot:styles.statusDot}/>{status}</span>
      <Button className={styles.panelToggle} aria-label={panelOpen?'Close brief and settings':'Open brief and settings'} aria-expanded={panelOpen} aria-controls="call-brief-panel" onClick={()=>setPanelOpen(!panelOpen)}><PanelRight size={20} strokeWidth={1.5} aria-hidden="true"/><span>Brief & settings</span></Button>
    </header>
    <div className={`${styles.workspace} ${panelOpen?styles.panelOpen:''}`}>
      <section className={styles.stage} aria-label="Conversation with Alex">
        {!live?(hasPreview?<Image src={avatarPreviewUrl} alt="Wayne sandbox avatar preview, not live video" fill sizes="100vw" className={styles.preview} onError={()=>setPreviewUnavailable(true)} priority/>:<CoachPoster className={styles.poster}/>):null}
        <video ref={avatarVideo} className={`${styles.avatarVideo} ${live?styles.videoVisible:''}`} autoPlay playsInline aria-label="Alex live video" onPlaying={()=>{setVideoPlaying(true);setSoundBlocked(avatarVideo.current?.muted===true);}} onWaiting={()=>setVideoPlaying(false)} onEmptied={()=>setVideoPlaying(false)} onPause={()=>{setVideoPlaying(false);if(connected)setSoundBlocked(true);}}/>
        <div className={styles.stageTop}><span className={styles.aiBadge}>AI COACH{avatarPreviewUrl?' · SANDBOX':''}</span>{!live?<span className={styles.previewBadge}>{hasPreview?'WAYNE SANDBOX PREVIEW':'ILLUSTRATED PREVIEW'}</span>:null}</div>
        <div className={styles.stageName}><strong>Alex</strong><span>{live?'Your practice coach':connected?'Waiting for the video stream':hasPreview?'Sandbox preview · live video starts after Connect':'Illustrated preview · live video starts after Connect'}</span></div>
        <div className={`${styles.selfView} ${cameraOn?styles.cameraOn:''}`}><video ref={localVideo} autoPlay muted playsInline aria-label="Your camera preview, kept on this device"/>{!cameraOn?<CameraOff size={24} strokeWidth={1.5} aria-hidden="true"/>:null}<span>You · local only</span></div>
        <Button className={styles.soundControl} aria-label="Enable sound" title="Enable sound" data-blocked={soundBlocked?'true':undefined} onClick={()=>void enableSound()}><Volume2 size={20} strokeWidth={1.5} aria-hidden="true"/></Button>
        {captions&&connected?<div className={styles.caption} role="log" aria-live="polite"><span>{liveCaption?.role==='user'?'YOU':'ALEX'}</span><p>{liveCaption?.text??'Take your time. Alex is listening.'}</p></div>:null}
      </section>
      <aside id="call-brief-panel" className={styles.panel} aria-label="Brief and settings" hidden={!panelOpen}>
        <div className={styles.panelHeading}><h1>{review?'Your conversation brief':'Brief & settings'}</h1><Button aria-label="Close panel" variant="quiet" onClick={()=>setPanelOpen(false)}><X size={20} strokeWidth={1.5} aria-hidden="true"/></Button></div>
        <div className={styles.panelContent}>
          <BriefForm key={review?'review':'live'} view={view} onView={acceptView} initialEditing={formMode&&!view.confirmed} readOnly={!review}/>
          <details className={styles.devices}><summary><Mic size={18} strokeWidth={1.5} aria-hidden="true"/>Devices & privacy<ChevronDown size={16} aria-hidden="true"/></summary>
            <p>Your camera is optional and stays on this device. Check your microphone before connecting.</p>
            <div className="mic-check"><span className="small">Microphone level</span><div className="level-track" role="meter" aria-label="Microphone input level" aria-valuemin={0} aria-valuemax={100} aria-valuenow={level}><span style={{transform:`scaleX(${level/100})`}}/></div><span className="small muted">{micReady?'Try saying a sentence':'Not checked'}</span></div>
            {devices.length?<div className="form-pair device-selects"><label>Microphone<span className="select-wrap"><select value={micDevice} onChange={event=>{setMicDevice(event.target.value);void checkMicrophone(event.target.value);}} disabled={!!deviceBusy||connected||busy}>{devices.filter(d=>d.kind==='audioinput').map((d,i)=><option key={d.deviceId} value={d.deviceId}>{d.label||`Microphone ${i+1}`}</option>)}</select><ChevronDown size={16} aria-hidden="true"/></span></label><label>Camera<span className="select-wrap"><select value={cameraDevice} onChange={event=>{setCameraDevice(event.target.value);camera.current.release();if(localVideo.current)localVideo.current.srcObject=null;setCameraOn(false);}} disabled={!!deviceBusy}>{devices.filter(d=>d.kind==='videoinput').map((d,i)=><option key={d.deviceId} value={d.deviceId}>{d.label||`Camera ${i+1}`}</option>)}</select><ChevronDown size={16} aria-hidden="true"/></span></label></div>:null}
            <details className="privacy-details"><summary><ShieldCheck size={16} aria-hidden="true"/>How your data is used</summary><p>Your voice goes to LiveAvatar for the conversation. The coach uses our model and voice providers to respond. This service keeps your brief and transcript for up to 24 hours and does not save an audio recording. Your camera stays local; visual analysis is off. Provider retention policies apply separately.</p></details>
            <p>Calls have a fixed time limit. You can end or switch to the form at any time.</p>
          </details>
          {view.committedTranscript.length&&review?<details className="saved-transcript"><summary>Conversation transcript <span>{view.committedTranscript.length} messages</span></summary>{view.committedTranscript.map(item=><div key={item.turnId} className="transcript-line"><span className="label">{item.role==='user'?'YOU':'ALEX'}{item.interrupted?' · INTERRUPTED':''}</span><p>{item.text}</p></div>)}</details>:null}
          <footer className={styles.panelFooter}><p>Holdline keeps this brief for up to 24 hours.</p><Button variant="quiet" onClick={()=>void removeBrief()} disabled={deleting}>{deleting?'Deleting…':'Delete my brief'}</Button></footer>
        </div>
      </aside>
    </div>
    <div className={styles.controlArea}>
      {error||fullscreenError?<div role="alert" className={styles.error}>{error?<p>{error}</p>:null}{fullscreenError?<p>{fullscreenError}</p>:null}{callState==='error'&&hasOpenCall?<Button onClick={()=>void end()}>Retry End</Button>:null}</div>:null}
      <div className={styles.controlHint}>{quality.toLowerCase().includes('poor')?<span role="status">Connection is unstable</span>:!available?<span>Video conversations are not available yet. Use the quick form to prepare your brief.</span>:!connected&&!busy?<span>{micReady?'Microphone ready. Connect when you’re ready.':'Check your microphone, then connect. Camera is optional.'}</span>:<span>AI coach · camera stays local</span>}</div>
      <div className={styles.toolbar} role="toolbar" aria-label="Call controls">
        <div className={styles.mediaControls}>
          <Button className={styles.control} onClick={()=>void(connected?toggleMute():checkMicrophone())} aria-pressed={connected?muted:micReady} disabled={!!deviceBusy||busy||(!connected&&hasOpenCall)}>{connected&&muted?<MicOff size={20} strokeWidth={1.5} aria-hidden="true"/>:<Mic size={20} strokeWidth={1.5} aria-hidden="true"/>}<span>{connected?(muted?'Unmute':'Mute'):deviceBusy==='microphone'?'Checking…':micReady?'Microphone checked':'Check microphone'}</span></Button>
          <Button className={styles.control} onClick={()=>void toggleCamera()} aria-pressed={cameraOn} disabled={!!deviceBusy||callState==='ending'}>{cameraOn?<Camera size={20} strokeWidth={1.5} aria-hidden="true"/>:<CameraOff size={20} strokeWidth={1.5} aria-hidden="true"/>}<span>{cameraOn?'Camera on':'Camera off'}</span></Button>
          <Button className={styles.control} onClick={()=>setCaptions(!captions)} aria-pressed={captions}><Captions size={20} strokeWidth={1.5} aria-hidden="true"/><span>{captions?'Hide captions':'Show captions'}</span></Button>
          <Button className={styles.control} onClick={()=>void toggleFullscreen()} aria-pressed={fullscreen}>{fullscreen?<Minimize size={20} strokeWidth={1.5} aria-hidden="true"/>:<Maximize size={20} strokeWidth={1.5} aria-hidden="true"/>}<span>{fullscreen?'Exit full screen':'Full screen'}</span></Button>
        </div>
        <div className={styles.actions}>
          <Button className={styles.quickForm} variant="quiet" onClick={useQuickForm}><FileText size={20} strokeWidth={1.5} aria-hidden="true"/><span>Use the quick form</span></Button>
          {connected||busy||hasOpenCall?<Button className={styles.connect} variant="end" onClick={()=>void end()} disabled={callState==='ending'}><PhoneOff size={20} strokeWidth={1.5} aria-hidden="true"/>End</Button>:<Button className={styles.connect} variant="primary" onClick={start} disabled={!canConnect||!micReady}>{view.providerEpoch?'Start another call':'Connect to Alex'}<ArrowRight size={20} strokeWidth={1.5} aria-hidden="true"/></Button>}
        </div>
      </div>
    </div>
  </main>;
}
