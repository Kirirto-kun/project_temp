export interface RealtimeEvent {
  type: string;
  [key: string]: unknown;
}

export interface RealtimeConnection {
  send(event: Record<string, unknown>): void;
  close(): void;
}

/**
 * Browser WebRTC connection to the Realtime API with a short-lived client secret. The mic
 * track is sent; the coach's audio arrives as one remote track played by `audio`.
 */
export async function connectRealtime(input: {
  clientSecret: string;
  model: string;
  mic: MediaStream;
  audio: HTMLAudioElement;
  onEvent: (event: RealtimeEvent) => void;
  onClosed: () => void;
  signal: AbortSignal;
}): Promise<RealtimeConnection> {
  const pc = new RTCPeerConnection();
  pc.ontrack = (event) => {
    input.audio.srcObject = event.streams[0] ?? null;
  };
  for (const track of input.mic.getAudioTracks()) pc.addTrack(track, input.mic);
  const channel = pc.createDataChannel('oai-events');
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    try {
      channel.close();
    } catch {
      /* ignore */
    }
    pc.getSenders().forEach((s) => s.track?.stop());
    pc.close();
    input.audio.srcObject = null;
    input.onClosed();
  };
  input.signal.addEventListener('abort', close, { once: true });
  channel.onmessage = (message) => {
    try {
      input.onEvent(JSON.parse(String(message.data)) as RealtimeEvent);
    } catch {
      /* ignore malformed events */
    }
  };
  channel.onopen = () => channel.send(JSON.stringify({ type: 'response.create' }));
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'failed' || pc.connectionState === 'closed') close();
  };
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  const response = await fetch(`https://api.openai.com/v1/realtime/calls?model=${encodeURIComponent(input.model)}`, {
    method: 'POST',
    body: offer.sdp ?? '',
    headers: { Authorization: `Bearer ${input.clientSecret}`, 'Content-Type': 'application/sdp' },
    signal: input.signal,
  });
  if (!response.ok) {
    close();
    throw new Error(`Realtime connection failed with ${response.status}`);
  }
  await pc.setRemoteDescription({ type: 'answer', sdp: await response.text() });
  return {
    send: (event) => {
      if (channel.readyState === 'open') channel.send(JSON.stringify(event));
    },
    close,
  };
}
