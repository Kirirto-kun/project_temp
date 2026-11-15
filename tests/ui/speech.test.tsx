import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { markTextInteraction, SPEAKER_STORAGE_KEY, takeAutoReadTurn } from '@/client/voice/speech';
import { useSpeaker, type SpokenLine } from '@/client/voice/useSpeaker';
import { SpeakerToggle } from '@/components/holdline/SpeechControls';
import { TextComposer } from '@/features/session/TextComposer';

const caps = { speechInput: true, speechOutput: true };
vi.mock('@/client/api/session', () => ({
  getConfig: async () => ({ capabilities: { ...caps } }),
}));

class FakeRecorder {
  static isTypeSupported = (type: string) => type.startsWith('audio/webm');
  state: 'inactive' | 'recording' = 'inactive';
  mimeType: string;
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  constructor(_stream: unknown, options: { mimeType: string }) {
    this.mimeType = options.mimeType;
  }
  start() {
    this.state = 'recording';
  }
  stop() {
    this.state = 'inactive';
    this.ondataavailable?.({ data: new Blob([new Uint8Array([1, 2, 3])], { type: this.mimeType }) });
    this.onstop?.();
  }
}

const fakeStream = { getTracks: () => [{ stop: vi.fn() }], getAudioTracks: () => [] } as unknown as MediaStream;
const store = new Map<string, string>();
const fetchMock = vi.fn();

function stubMicrophone(getUserMedia: () => Promise<MediaStream>) {
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: vi.fn(getUserMedia) } });
}

beforeEach(() => {
  Object.assign(caps, { speechInput: true, speechOutput: true });
  store.clear();
  takeAutoReadTurn();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('MediaRecorder', FakeRecorder);
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  });
  URL.createObjectURL = vi.fn(() => 'blob:speech');
  URL.revokeObjectURL = vi.fn();
  HTMLMediaElement.prototype.play = vi.fn(() => Promise.resolve());
  HTMLMediaElement.prototype.pause = vi.fn();
  stubMicrophone(async () => fakeStream);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const roundContext = { kind: 'round', sessionId: 'ses_test' } as const;

describe('dictation in the composer', () => {
  it('puts the transcribed words in the box without sending', async () => {
    fetchMock.mockResolvedValue(Response.json({ text: 'I am asking for 120,000' }));
    const onSend = vi.fn(async () => true);
    render(<TextComposer disabled={false} onSend={onSend} speech={roundContext} />);
    fireEvent.change(screen.getByLabelText('Your reply'), { target: { value: 'Hello,' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Dictate your reply' }));
    expect(await screen.findByText('Recording')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send reply' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Stop recording and use the words' }));
    await waitFor(() => expect(screen.getByLabelText('Your reply')).toHaveValue('Hello, I am asking for 120,000'));
    const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(url).toBe('/api/speech/transcribe?kind=round&sessionId=ses_test');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['Content-Type']).toContain('audio/webm');
    expect(onSend).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Send reply' }));
    await waitFor(() => expect(onSend).toHaveBeenCalledWith('Hello, I am asking for 120,000'));
  });

  it('a blocked microphone shows a short note and typing still works', async () => {
    stubMicrophone(async () => {
      throw new DOMException('denied', 'NotAllowedError');
    });
    render(<TextComposer disabled={false} onSend={async () => true} speech={roundContext} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Dictate your reply' }));
    expect(await screen.findByText(/Microphone access is blocked/)).toBeInTheDocument();
    const box = screen.getByLabelText('Your reply');
    fireEvent.change(box, { target: { value: 'typed instead' } });
    expect(box).toHaveValue('typed instead');
    expect(screen.queryByText(/Microphone access is blocked/)).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('falls back to the browser recognizer when server dictation is off', async () => {
    caps.speechInput = false;
    class FakeRecognition {
      static last: FakeRecognition | null = null;
      lang = '';
      continuous = false;
      interimResults = true;
      onresult: ((event: unknown) => void) | null = null;
      onerror: ((event: { error: string }) => void) | null = null;
      onend: (() => void) | null = null;
      constructor() {
        FakeRecognition.last = this;
      }
      start() {}
      stop() {
        const result = Object.assign([{ transcript: 'one hundred ten thousand' }], { isFinal: true });
        this.onresult?.({ resultIndex: 0, results: [result] });
        this.onend?.();
      }
      abort() {}
    }
    vi.stubGlobal('webkitSpeechRecognition', FakeRecognition);
    render(<TextComposer disabled={false} onSend={async () => true} speech={roundContext} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Dictate your reply' }));
    expect(FakeRecognition.last?.lang).toBe('en-US');
    fireEvent.click(await screen.findByRole('button', { name: 'Stop recording and use the words' }));
    await waitFor(() => expect(screen.getByLabelText('Your reply')).toHaveValue('one hundred ten thousand'));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('hides the mic when neither server nor browser dictation exists', async () => {
    caps.speechInput = false;
    render(<TextComposer disabled={false} onSend={async () => true} speech={roundContext} />);
    await act(async () => undefined);
    expect(screen.queryByRole('button', { name: 'Dictate your reply' })).not.toBeInTheDocument();
  });

  it('is off without a conversation context', async () => {
    render(<TextComposer disabled={false} onSend={async () => true} speech={null} />);
    await act(async () => undefined);
    expect(screen.queryByRole('button', { name: 'Dictate your reply' })).not.toBeInTheDocument();
  });
});

function Chat({ initial }: { initial: SpokenLine[] }) {
  const [lines, setLines] = useState(initial);
  const speaker = useSpeaker(lines);
  return (
    <div>
      <SpeakerToggle speaker={speaker} />
      <button type="button" onClick={() => setLines((l) => [...l, { id: `line-${l.length}`, text: 'Counter offer.', target: { kind: 'round', sessionId: 'ses_test', messageId: `m-${l.length}` } }])}>
        add line
      </button>
      <span data-testid="playing">{speaker.playingId ?? ''}</span>
    </div>
  );
}

const opening: SpokenLine[] = [{ id: 'line-0', text: 'Hello.', target: { kind: 'round', sessionId: 'ses_test', messageId: 'ses_test:opening' } }];

describe('read-aloud', () => {
  it('reads a new reply right after the user sent something, and not otherwise', async () => {
    fetchMock.mockImplementation(async () => new Response(new Blob([new Uint8Array([1])], { type: 'audio/mpeg' })));
    render(<Chat initial={opening} />);
    await screen.findByRole('button', { name: /Sound on/ });
    fireEvent.click(screen.getByText('add line'));
    await act(async () => undefined);
    expect(fetchMock).not.toHaveBeenCalled();

    markTextInteraction();
    fireEvent.click(screen.getByText('add line'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(url).toBe('/api/speech/say');
    expect(JSON.parse(String(init.body))).toEqual({ kind: 'round', sessionId: 'ses_test', messageId: 'm-2' });
    await waitFor(() => expect(HTMLMediaElement.prototype.play).toHaveBeenCalled());
  });

  it('mute is remembered across visits and stops automatic reading', async () => {
    const first = render(<Chat initial={opening} />);
    fireEvent.click(await screen.findByRole('button', { name: /Sound on/ }));
    expect(store.get(SPEAKER_STORAGE_KEY)).toBe('off');
    expect(screen.getByRole('button', { name: /Muted/ })).toHaveAttribute('aria-pressed', 'false');
    first.unmount();

    render(<Chat initial={opening} />);
    expect(await screen.findByRole('button', { name: /Muted/ })).toBeInTheDocument();
    markTextInteraction();
    fireEvent.click(screen.getByText('add line'));
    await act(async () => undefined);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('works when storage throws', async () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    });
    render(<Chat initial={opening} />);
    fireEvent.click(await screen.findByRole('button', { name: /Sound on/ }));
    expect(screen.getByRole('button', { name: /Muted/ })).toBeInTheDocument();
  });
});
