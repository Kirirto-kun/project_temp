import { expect,it } from 'vitest';
import { startWithMicrophoneCheck } from '@/onboarding/client/sdk-start';
it('rejects the SDK silent-success case when microphone acquisition failed',async()=>{
  let stopped=0;const sdk={async start(){},async stop(){stopped++;},voiceChat:{state:'INACTIVE',stop(){stopped++;}}};
  await expect(startWithMicrophoneCheck(sdk)).rejects.toThrow('microphone');expect(stopped).toBeGreaterThan(0);
});
it('accepts startup only with an active voice chat',async()=>{
  const sdk={async start(){},async stop(){},voiceChat:{state:'ACTIVE',stop(){}}};
  await expect(startWithMicrophoneCheck(sdk)).resolves.toBeUndefined();
});
