import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AgentEventsEnum, ConnectionQuality, LiveAvatarSession, SessionDisconnectReason, SessionEvent,
  SessionState, VoiceChatState, type SessionConfig,
} from '@heygen/liveavatar-web-sdk';
import { ConnectionState, type Room } from 'livekit-client';
import { createLiveAvatarSession } from '@/onboarding/client/liveavatar-session';
import type { SessionCallbacks } from '@/onboarding/client/call';

// Keep the installed SDK, including VoiceChat.stop(), event dispatch and
// message() serialization. Only browser startup and external I/O are replaced.
type AudioTrack = {
  kind:'audio';readyState:'live'|'ended';
  stop():void;removeAllListeners():void;
};
type RemoteTrack = {attach(element:HTMLMediaElement):void;stop():void};
type SdkInternals = {
  config:SessionConfig;room:Room;_state:SessionState;
  _voiceChat:{_state:VoiceChatState;track:AudioTrack|null};
  _remoteAudioTrack:RemoteTrack|null;_remoteVideoTrack:RemoteTrack|null;
};
const fullToken=`unused.${Buffer.from(JSON.stringify({start_session_data:{mode:'FULL'}})).toString('base64url')}.unused`;
const microphone=():AudioTrack=>({
  kind:'audio',readyState:'live',stop(){this.readyState='ended';},removeAllListeners(){},
});
const callbacks=():SessionCallbacks=>({
  caption:vi.fn(),tool:vi.fn(),disconnected:vi.fn(),quality:vi.fn(),speechStarted:vi.fn(),
});
let sdk:LiveAvatarSession;
let internals:SdkInternals;
let ownedTrack:AudioTrack;
let publishedTrack:AudioTrack;
let startupVoiceState:VoiceChatState;
const supplyRemoteTracks=()=>{
  const stream={id:'provider-stream'} as MediaStream;
  const attach=(element:HTMLMediaElement)=>{element.srcObject=stream;};
  internals._remoteAudioTrack={attach,stop(){}};
  internals._remoteVideoTrack={attach,stop(){}};
  return stream;
};

describe('LiveAvatar FULL adapter',()=>{
  beforeEach(()=>{
    ownedTrack=microphone();publishedTrack=microphone();
    startupVoiceState=VoiceChatState.ACTIVE;
    vi.stubGlobal('RTCPeerConnection',class {});
    vi.stubGlobal('fetch',vi.fn(async(input:string)=>{
      if(input!=='https://api.liveavatar.com/v1/sessions/stop')throw new Error('Unexpected SDK network request');
      return new Response(JSON.stringify({code:1000,data:{}}),{status:200});
    }));
    const start=vi.spyOn(LiveAvatarSession.prototype,'start');
    start.mockImplementation(async()=>{
      sdk=start.mock.contexts[start.mock.contexts.length-1] as LiveAvatarSession;
      internals=sdk as unknown as SdkInternals;
      internals._state=SessionState.CONNECTED;
      internals._voiceChat._state=startupVoiceState;
      internals._voiceChat.track=ownedTrack;
      internals.room.state=ConnectionState.Connected;
      vi.spyOn(internals.room.localParticipant,'getTrackPublications').mockReturnValue([
        {track:publishedTrack} as unknown as ReturnType<Room['localParticipant']['getTrackPublications']>[number],
      ]);
      vi.spyOn(internals.room.localParticipant,'publishData').mockResolvedValue();
      vi.spyOn(internals.room,'disconnect').mockImplementation(async()=>{internals.room.state=ConnectionState.Disconnected;});
    });
  });
  afterEach(async()=>{
    await sdk?.stop();
    vi.restoreAllMocks();vi.unstubAllGlobals();
  });

  it('configures the generic FULL SDK with the selected microphone initially muted',async()=>{
    const call=await createLiveAvatarSession(fullToken,callbacks(),'chosen-microphone');
    await call.start();

    expect(sdk.constructor).toBe(LiveAvatarSession);
    expect(internals.config).toEqual({autoKeepAlive:false,voiceChat:{deviceId:'chosen-microphone',defaultMuted:true}});
    expect(sdk.voiceChat.state).toBe('ACTIVE');
  });

  it('rejects and cleans up a generic SDK startup that did not activate the microphone',async()=>{
    startupVoiceState=VoiceChatState.INACTIVE;
    const call=await createLiveAvatarSession(fullToken,callbacks());

    await expect(call.start()).rejects.toThrow(/microphone/i);

    expect(ownedTrack.readyState).toBe('ended');
    expect(publishedTrack.readyState).toBe('ended');
    expect(sdk.state).toBe(SessionState.DISCONNECTED);
  });

  it('forwards only final captions and public connection events without client tools',async()=>{
    const events=callbacks();
    const call=await createLiveAvatarSession(fullToken,events);
    await call.start();

    sdk.emit(AgentEventsEnum.USER_TRANSCRIPTION_CHUNK,{event_type:AgentEventsEnum.USER_TRANSCRIPTION_CHUNK,event_id:'u-part',text:'partial'});
    sdk.emit(AgentEventsEnum.AVATAR_TRANSCRIPTION_CHUNK,{event_type:AgentEventsEnum.AVATAR_TRANSCRIPTION_CHUNK,event_id:'a-part',text:'partial'});
    sdk.emit(AgentEventsEnum.USER_TRANSCRIPTION,{event_type:AgentEventsEnum.USER_TRANSCRIPTION,event_id:'u-final',text:'I want to prepare for feedback.'});
    sdk.emit(AgentEventsEnum.AVATAR_TRANSCRIPTION,{event_type:AgentEventsEnum.AVATAR_TRANSCRIPTION,event_id:'a-final',text:'What would you like to achieve?'});
    sdk.emit(AgentEventsEnum.ELEVENLABS_AGENT_EVENT,{
      event_type:AgentEventsEnum.ELEVENLABS_AGENT_EVENT,event_id:'obsolete-tool',elevenlabs_event_type:'client_tool_call',
      data:{client_tool_call:{tool_call_id:'tool-1',tool_name:'save_profile',parameters:{goal:'feedback'}}},
    });
    sdk.emit(SessionEvent.SESSION_CONNECTION_QUALITY_CHANGED,ConnectionQuality.BAD);
    sdk.emit(SessionEvent.SESSION_DISCONNECTED,SessionDisconnectReason.SERVER_INITIATED);

    expect(events.caption).toHaveBeenCalledTimes(2);
    expect(events.caption).toHaveBeenNthCalledWith(1,'user','I want to prepare for feedback.','u-final');
    expect(events.caption).toHaveBeenNthCalledWith(2,'assistant','What would you like to achieve?','a-final');
    expect(events.quality).toHaveBeenCalledWith('BAD');
    expect(events.disconnected).toHaveBeenCalledOnce();
    expect(events.tool).not.toHaveBeenCalled();
  });

  it('requests a model response for typed input through the FULL command channel',async()=>{
    const call=await createLiveAvatarSession(fullToken,callbacks());
    await call.start();
    call.sendText('Help me prepare for my interview.');

    const [payload,options]=vi.mocked(internals.room.localParticipant.publishData).mock.calls[0];
    expect(JSON.parse(new TextDecoder().decode(payload))).toEqual({
      event_type:'avatar.speak_response',event_id:expect.any(String),text:'Help me prepare for my interview.',
    });
    expect(options).toEqual({reliable:true,topic:'agent-control'});
  });
  it('speaks a server response as exact text and interrupts through the FULL command channel',async()=>{
    const call=await createLiveAvatarSession(fullToken,callbacks());await call.start();
    vi.spyOn(console,'warn').mockImplementation(()=>{});
    call.speak('What would you like to achieve?');call.interrupt();
    const commands=vi.mocked(internals.room.localParticipant.publishData).mock.calls.map(([data])=>JSON.parse(new TextDecoder().decode(data)));
    expect(commands).toEqual([
      {event_type:'avatar.speak_text',event_id:expect.any(String),text:'What would you like to achieve?'},
      {event_type:'avatar.interrupt'},
    ]);
  });
  it('forwards user speech start so the controller can cancel a pending model response',async()=>{
    const events=callbacks();const call=await createLiveAvatarSession(fullToken,events);await call.start();
    sdk.emit(AgentEventsEnum.USER_SPEAK_STARTED,{event_type:AgentEventsEnum.USER_SPEAK_STARTED,event_id:'speech-1'});
    expect(events.speechStarted).toHaveBeenCalledOnce();
  });

  it('rejects client tool results because FULL profile tools run on the server',async()=>{
    const call=await createLiveAvatarSession(fullToken,callbacks());
    expect(()=>call.sendToolResult('tool-1','saved',false)).toThrow(/FULL.*server/i);
  });

  it('attaches the latest selected video when remote tracks become ready after SDK startup',async()=>{
    const call=await createLiveAvatarSession(fullToken,callbacks());
    await call.start();
    vi.spyOn(console,'warn').mockImplementation(()=>{});
    const first={muted:true,srcObject:null} as HTMLVideoElement;
    const latest={muted:true,srcObject:null} as HTMLVideoElement;
    call.attach(first);call.attach(latest);
    const stream=supplyRemoteTracks();

    sdk.emit(SessionEvent.SESSION_STREAM_READY);

    expect(latest.srcObject).toBe(stream);
    expect(first.srcObject).toBeNull();
  });

  it.each(['releaseMicrophone','stop'] as const)('does not reattach late remote tracks after %s',async(action)=>{
    const call=await createLiveAvatarSession(fullToken,callbacks());
    await call.start();
    vi.spyOn(console,'warn').mockImplementation(()=>{});
    const video={muted:true,srcObject:null} as HTMLVideoElement;
    call.attach(video);
    await call[action]();
    supplyRemoteTracks();

    sdk.emit(SessionEvent.SESSION_STREAM_READY);

    expect(video.srcObject).toBeNull();
  });

  it('releases both owned and published voice tracks and silences the attached video',async()=>{
    const call=await createLiveAvatarSession(fullToken,callbacks());
    await call.start();
    const video={muted:true} as HTMLVideoElement;
    vi.spyOn(sdk,'attach').mockImplementation(()=>{});
    call.attach(video);
    expect(video.muted).toBe(false);
    expect(sdk.attach).toHaveBeenCalledWith(video);

    call.releaseMicrophone();

    expect(ownedTrack.readyState).toBe('ended');
    expect(publishedTrack.readyState).toBe('ended');
    expect(sdk.voiceChat.state).toBe('INACTIVE');
    expect(video.muted).toBe(true);
  });

  it('stops the generic SDK and forwards its disconnected event',async()=>{
    const events=callbacks();
    const call=await createLiveAvatarSession(fullToken,events);
    await call.start();
    await call.stop();

    expect(sdk.state).toBe(SessionState.DISCONNECTED);
    expect(ownedTrack.readyState).toBe('ended');
    expect(publishedTrack.readyState).toBe('ended');
    expect(events.disconnected).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledWith('https://api.liveavatar.com/v1/sessions/stop',expect.objectContaining({method:'POST'}));
  });
});
