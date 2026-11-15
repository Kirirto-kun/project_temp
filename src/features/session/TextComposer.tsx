'use client';

import { ArrowUp, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { LIMITS } from '@/contracts/domain';

/** Chat composer: the field grows with the text; Enter sends, Shift+Enter adds a line. */
export function TextComposer({ disabled, onSend, initialText = '', placeholder = 'Say what you would say. Lead with the number.' }: { disabled: boolean; onSend: (text: string) => Promise<boolean>; initialText?: string; placeholder?: string }) {
  const [text, setText] = useState(initialText);
  const [busy, setBusy] = useState(false);
  async function submit() {
    const value = text.trim();
    if (!value || busy || disabled) return;
    setBusy(true);
    const sent = await onSend(value);
    setBusy(false);
    if (sent) setText('');
  }
  const canSend = !disabled && !busy && text.trim().length > 0;
  return (
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
      <textarea
        id="reply"
        className="composer-input"
        rows={1}
        maxLength={LIMITS.replyMaxChars}
        placeholder={placeholder}
        value={text}
        readOnly={disabled}
        enterKeyHint="send"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            void submit();
          }
        }}
      />
      <button type="submit" className="btn btn-primary btn-icon composer-send" disabled={!canSend} aria-label="Send reply">
        {busy ? <Loader2 size={18} className="animate-spin" aria-hidden /> : <ArrowUp size={19} strokeWidth={2.25} aria-hidden />}
      </button>
    </form>
  );
}
