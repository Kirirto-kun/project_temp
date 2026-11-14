const PREFERRED_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/aac'];

/** First MIME type this browser can actually record, or null (analysis unavailable, text still works). */
export function pickRecorderMime(): string | null {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') return null;
  return PREFERRED_TYPES.find((type) => MediaRecorder.isTypeSupported(type)) ?? null;
}

export interface Recorder {
  mimeType: string;
  stop(): Promise<Blob>;
  discard(): void;
}

export function startRecorder(stream: MediaStream, mimeType: string, maxBytes: number): Recorder {
  const recorder = new MediaRecorder(stream, { mimeType });
  const chunks: Blob[] = [];
  let bytes = 0;
  let discarded = false;
  recorder.ondataavailable = (event) => {
    if (discarded || !event.data.size) return;
    bytes += event.data.size;
    if (bytes > maxBytes) {
      recorder.stop();
      return;
    }
    chunks.push(event.data);
  };
  recorder.start(1_000);
  return {
    // Use the type the recorder really produced; never relabel MP4 as WebM.
    mimeType: recorder.mimeType || mimeType,
    stop: () =>
      new Promise<Blob>((resolve) => {
        if (recorder.state === 'inactive') return resolve(new Blob(chunks, { type: recorder.mimeType || mimeType }));
        recorder.onstop = () => resolve(new Blob(chunks, { type: recorder.mimeType || mimeType }));
        recorder.stop();
      }),
    discard: () => {
      discarded = true;
      chunks.length = 0;
      if (recorder.state !== 'inactive') recorder.stop();
    },
  };
}
