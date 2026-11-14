import type { AudioManifest } from '@/contracts/voice';
import { completeUpload, requestUpload } from '@/client/api/session';

/** Uploads a recording to the private store and registers its manifest. */
export async function uploadRecording(blob: Blob, manifest: AudioManifest): Promise<string> {
  const target = await requestUpload({
    purpose: manifest.purpose,
    mimeType: manifest.mimeType,
    bytes: blob.size,
    sessionId: manifest.sessionId,
    intakeId: manifest.intakeId,
  });
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(target.uploadUrl, { method: 'PUT', headers: target.uploadHeaders, body: blob });
      if (!response.ok) throw new Error(`Upload failed with ${response.status}`);
      lastError = null;
      break;
    } catch (error) {
      lastError = error;
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
    }
  }
  if (lastError) throw lastError;
  await completeUpload(target.audioId, manifest);
  return target.audioId;
}
