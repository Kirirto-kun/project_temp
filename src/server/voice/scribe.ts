import 'server-only';

export interface ScribeWord {
  text: string;
  startMs: number;
  endMs: number;
  type: 'word' | 'spacing' | 'audio_event';
}

export interface ScribeTranscript {
  text: string;
  languageCode: string | null;
  words: ScribeWord[];
}

export interface ScribeClient {
  transcribe(audio: Uint8Array, mimeType: string, signal?: AbortSignal): Promise<ScribeTranscript>;
}

export class ScribeError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = 'ScribeError';
  }
}

interface RawWord {
  text?: unknown;
  start?: unknown;
  end?: unknown;
  type?: unknown;
}

export function normalizeScribeResponse(body: unknown): ScribeTranscript {
  const data = (body ?? {}) as { text?: unknown; language_code?: unknown; words?: unknown };
  const words = Array.isArray(data.words) ? (data.words as RawWord[]) : [];
  return {
    text: typeof data.text === 'string' ? data.text : '',
    languageCode: typeof data.language_code === 'string' ? data.language_code : null,
    words: words
      .filter((w) => typeof w.text === 'string' && typeof w.start === 'number' && typeof w.end === 'number')
      .map((w): ScribeWord => ({
        text: w.text as string,
        startMs: Math.max(0, Math.round((w.start as number) * 1_000)),
        endMs: Math.max(0, Math.round((w.end as number) * 1_000)),
        type: w.type === 'spacing' || w.type === 'audio_event' ? w.type : 'word',
      }))
      .filter((w) => w.endMs >= w.startMs),
  };
}

/**
 * Batch speech-to-text with word timestamps. `no_verbatim=false` keeps fillers and false
 * starts in the raw transcript; whether they survive is still verified on known recordings.
 */
export class ElevenLabsScribe implements ScribeClient {
  constructor(
    private readonly apiKey: string,
    private readonly modelId: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async transcribe(audio: Uint8Array, mimeType: string, signal?: AbortSignal): Promise<ScribeTranscript> {
    const form = new FormData();
    form.set('model_id', this.modelId);
    form.set('file', new Blob([audio as BlobPart], { type: mimeType }), 'audio');
    form.set('timestamps_granularity', 'word');
    form.set('diarize', 'false');
    form.set('tag_audio_events', 'false');
    form.set('no_verbatim', 'false');
    form.set('language_code', 'en');
    const response = await this.fetchImpl('https://api.elevenlabs.io/v1/speech-to-text', {
      method: 'POST',
      headers: { 'xi-api-key': this.apiKey },
      body: form,
      signal,
      cache: 'no-store',
    });
    if (!response.ok) throw new ScribeError(response.status, `Speech-to-text failed with ${response.status}`);
    return normalizeScribeResponse(await response.json());
  }
}
