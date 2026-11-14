interface StartupPort {
  start():Promise<void>;stop():Promise<void>;
  voiceChat:{state:string;stop():void};
}
// SDK 0.0.20 can resolve start() after swallowing a microphone error. Validate
// the public voice state at our boundary rather than announcing a silent call.
export async function startWithMicrophoneCheck(session:StartupPort) {
  await session.start();
  if(session.voiceChat.state!=='ACTIVE') {
    session.voiceChat.stop();await session.stop().catch(()=>{});
    throw new Error('The microphone did not start. Check permissions and try again.');
  }
}
