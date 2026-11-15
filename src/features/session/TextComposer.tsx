'use client';

import { ArrowUp, Loader2 } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useCallback, useRef, useState } from 'react';
import type { SpeechContext } from '@/contracts/api';
import { LIMITS } from '@/contracts/domain';
import { markTextInteraction } from '@/client/voice/speech';
import { useDictation } from '@/client/voice/useDictation';
import { DictationButton, DictationStatus } from '@/components/holdline/SpeechControls';

/** On a round page (/session/<id>) dictation belongs to that round; elsewhere it needs an explicit context. */
function contextFromPath(pathname: string | null): SpeechContext | null {
  const match = pathname?.match(/^\/session\/([^/]+)\/?$/);
  return match ? { kind: 'round', sessionId: decodeURIComponent(match[1]!) } : null;
}

/**
 * Chat composer: the field grows with the text; Enter sends, Shift+Enter adds a line. The mic
 * puts dictated words in the box to edit before sending. `speech` names the conversation for
 * dictation; leave it out on a round page, pass null to turn dictation off.
 */
export function TextComposer({
  disabled,
  onSend,
  initialText = '',
  placeholder = 'Say what you would say. Lead with the number.',
  speech,
}: {
  disabled: boolean;
  onSend: (text: string) => Promise<boolean>;
  initialText?: string;
  placeholder?: string;
  speech?: SpeechContext | null;
}) {
  const [text, setText] = useState(initialText);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const pathname = usePathname();
  const context = speech === undefined ? contextFromPath(pathname) : speech;
  const onText = useCallback((words: string) => {
    setText((current) => {
      const joined = current.trim() ? `${current.trimEnd()} ${words}` : words;
      return joined.slice(0, LIMITS.replyMaxChars);
    });
    requestAnimationFrame(() => {
      const input = inputRef.current;
      if (!input) return;
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    });
  }, []);
  const dictation = useDictation({ context, onText });
  const dictationOn = dictation.available;
  const recording = dictation.state !== 'idle';

  async function submit() {
    const value = text.trim();
    if (!value || busy || disabled || recording) return;
    markTextInteraction();
    setBusy(true);
    const sent = await onSend(value);
    setBusy(false);
    if (sent) setText('');
  }
  const canSend = !disabled && !busy && !recording && text.trim().length > 0;
  return (
    <div className="grid gap-1.5">
      <form
        className="composer"
        data-disabled={disabled || undefined}
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <label className="sr-only" htmlFor="reply">
          Your reply
        </label>
        {dictationOn && recording ? (
          <DictationStatus dictation={dictation} />
        ) : (
          <textarea
            ref={inputRef}
            id="reply"
            className="composer-input"
            rows={1}
            maxLength={LIMITS.replyMaxChars}
            placeholder={placeholder}
            value={text}
            readOnly={disabled}
            enterKeyHint="send"
            onChange={(e) => {
              setText(e.target.value);
              if (dictation.error) dictation.clearError();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void submit();
              }
            }}
          />
        )}
        {dictationOn && <DictationButton dictation={dictation} disabled={disabled || busy} />}
        <button type="submit" className="btn btn-primary btn-icon composer-send" disabled={!canSend} aria-label="Send reply">
          {busy ? <Loader2 size={18} className="animate-spin" aria-hidden /> : <ArrowUp size={19} strokeWidth={2.25} aria-hidden />}
        </button>
      </form>
      {dictationOn && dictation.error && (
        <p className="composer-note" role="status">
          {dictation.error}
        </p>
      )}
    </div>
  );
}
