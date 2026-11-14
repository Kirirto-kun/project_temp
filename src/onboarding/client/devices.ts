export class ManagedStream {
  stream:MediaStream|null=null;
  private generation=0;
  constructor(private acquireMedia=(constraints:MediaStreamConstraints)=>navigator.mediaDevices.getUserMedia(constraints)) {}
  async acquire(constraints:MediaStreamConstraints) {
    this.release();const generation=this.generation;
    const stream=await this.acquireMedia(constraints);
    if(generation!==this.generation){stream.getTracks().forEach(t=>t.stop());return null;}
    this.stream=stream;return stream;
  }
  release(){this.generation++;this.stream?.getTracks().forEach(t=>t.stop());this.stream=null;}
}
export function deviceError(error:unknown) {
  const name=error instanceof DOMException?error.name:'';
  if(name==='NotAllowedError')return 'Permission was not granted. You can change it in your browser or use the quick form.';
  if(name==='NotFoundError')return 'No matching device was found. Choose another device or use the quick form.';
  if(name==='NotReadableError')return 'This device is busy in another application. Close it there and try again.';
  return 'This device could not start. You can continue without a camera or use the quick form.';
}
