import type { SessionFactory } from './call';
import { startWithMicrophoneCheck } from './sdk-start';

export const createLiveAvatarSession:SessionFactory=async(token,callbacks,deviceId)=>{
  const {LiveAvatarSession,AgentEventsEnum,SessionEvent}=await import('@heygen/liveavatar-web-sdk');
  const session=new LiveAvatarSession(token,{autoKeepAlive:false,voiceChat:{...(deviceId?{deviceId}:{}),defaultMuted:true}});
  let video:HTMLVideoElement|null=null;
  session.on(AgentEventsEnum.USER_TRANSCRIPTION,event=>callbacks.caption('user',event.text,event.event_id));
  session.on(AgentEventsEnum.USER_SPEAK_STARTED,()=>callbacks.speechStarted?.());
  session.on(AgentEventsEnum.AVATAR_TRANSCRIPTION,event=>callbacks.caption('assistant',event.text,event.event_id));
  session.on(SessionEvent.SESSION_DISCONNECTED,()=>callbacks.disconnected());
  session.on(SessionEvent.SESSION_CONNECTION_QUALITY_CHANGED,quality=>callbacks.quality(String(quality)));
  // SDK attach() returns early before both remote tracks exist and does not retry.
  session.on(SessionEvent.SESSION_STREAM_READY,()=>{if(video)session.attach(video);});
  return {
    start:()=>startWithMicrophoneCheck(session),stop(){video=null;return session.stop();},keepAlive:()=>session.keepAlive(),
    releaseMicrophone(){session.voiceChat.stop();if(video){video.muted=true;video=null;}},
    setMuted:muted=>muted?session.voiceChat.mute():session.voiceChat.unmute(),
    attach(element){video=element;video.muted=false;session.attach(video);},
    sendToolResult(){throw new Error('LiveAvatar FULL profile tools run on the server; client tool results are unsupported.');},
    sendText(text){session.message(text);},
    speak(text){session.repeat(text);},
    interrupt(){session.interrupt();},
  };
};
