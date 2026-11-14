import { expect,it } from 'vitest';
import { ManagedStream } from '@/onboarding/client/devices';

it('stops a late camera stream after the user cancelled the permission prompt',async()=>{
  let resolve!:(stream:MediaStream)=>void;let stopped=0;
  const stream={getTracks:()=>[{stop:()=>{stopped++;}}]} as unknown as MediaStream;
  const devices=new ManagedStream(()=>new Promise<MediaStream>(r=>{resolve=r;}));
  const opening=devices.acquire({video:true,audio:false});devices.release();resolve(stream);
  expect(await opening).toBeNull();expect(stopped).toBe(1);expect(devices.stream).toBeNull();
});
it('releases the old device before switching and never asks for audio with a camera preview',async()=>{
  const requests:MediaStreamConstraints[]=[];let stopped=0;
  const stream={getTracks:()=>[{stop:()=>{stopped++;}}]} as unknown as MediaStream;
  const devices=new ManagedStream(async constraints=>{requests.push(constraints);return stream;});
  await devices.acquire({video:{deviceId:'camera-a'},audio:false});await devices.acquire({video:{deviceId:'camera-b'},audio:false});
  expect(stopped).toBe(1);expect(requests.every(r=>r.audio===false)).toBe(true);devices.release();expect(stopped).toBe(2);
});
