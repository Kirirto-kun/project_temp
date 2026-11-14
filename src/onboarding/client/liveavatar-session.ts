import type { SessionFactory } from './call';
import { startWithMicrophoneCheck } from './sdk-start';

export const createLiveAvatarSession:SessionFactory=async(token,callbacks,deviceId)=>{
  const {ElevenLabsAgentSession,AgentEventsEnum,SessionEvent}=await import('@heygen/liveavatar-web-sdk');
  const session=new ElevenLabsAgentSession(token,{autoKeepAlive:false,voiceChat:{...(deviceId?{deviceId}:{}),defaultMuted:true}});
  let video:HTMLVideoElement|null=null;let lastAssistantId='';let lastAssistantText='';
  session.on(AgentEventsEnum.USER_TRANSCRIPTION,event=>callbacks.caption('user',event.text,event.event_id));
  session.on(AgentEventsEnum.AVATAR_TRANSCRIPTION,event=>{lastAssistantId=event.event_id;lastAssistantText=event.text;callbacks.caption('assistant',event.text,event.event_id);});
  session.on(SessionEvent.SESSION_DISCONNECTED,()=>callbacks.disconnected());
  session.on(SessionEvent.SESSION_CONNECTION_QUALITY_CHANGED,quality=>callbacks.quality(String(quality)));
  session.on(AgentEventsEnum.ELEVENLABS_AGENT_EVENT,event=>{
    const data=event.data as Record<string,unknown>;
    if(event.elevenlabs_event_type==='client_tool_call') {
      const tool=(data.client_tool_call??data) as Record<string,unknown>;
      if(typeof tool.tool_call_id==='string'&&typeof tool.tool_name==='string')callbacks.tool(tool.tool_call_id,tool.tool_name,tool.parameters);
    }
    if(event.elevenlabs_event_type==='agent_response_correction') {
      const correction=(data.agent_response_correction_event??data) as Record<string,unknown>;
      if(typeof correction.corrected_agent_response==='string'&&lastAssistantId){lastAssistantText=correction.corrected_agent_response;callbacks.caption('assistant',lastAssistantText,lastAssistantId,true);}
    }
    if(event.elevenlabs_event_type==='interruption'&&lastAssistantId)callbacks.caption('assistant',lastAssistantText,lastAssistantId,true);
  });
  return {
    start:()=>startWithMicrophoneCheck(session),stop:()=>session.stop(),keepAlive:()=>session.keepAlive(),
    releaseMicrophone(){session.voiceChat.stop();if(video)video.muted=true;},
    setMuted:muted=>muted?session.voiceChat.mute():session.voiceChat.unmute(),
    attach(element){video=element;video.muted=false;session.attach(video);},
    sendToolResult(id,result,isError){session.sendClientToolResult({toolCallId:id,result,isError});},
    sendText(text){session.sendUserMessage(text);},
  };
};
