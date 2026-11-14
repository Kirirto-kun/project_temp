'use client';

import { Send } from 'lucide-react';
import { useState } from 'react';
import { LIMITS } from '@/contracts/domain';

export function TextComposer({ disabled, onSend, initialText = '' }: { disabled: boolean; onSend: (text: string) => Promise<boolean>; initialText?: string }) {
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
  return (
    <form
      className="flex items-end gap-2"
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
        className="input min-h-[52px] flex-1 resize-y"
        rows={2}
        maxLength={LIMITS.replyMaxChars}
        placeholder="Say what you would say. Lead with the number."
        value={text}
        disabled={disabled}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            void submit();
          }
        }}
      />
      <button type="submit" className="btn btn-primary min-h-[52px]" disabled={disabled || busy || !text.trim()} aria-label="Send reply">
        <Send size={20} strokeWidth={1.5} aria-hidden />
        <span className="hidden sm:inline">Send</span>
      </button>
    </form>
  );
}
