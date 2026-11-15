'use client';

import { Loader2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { SessionMessage } from '@/contracts/domain';
import { Avatar } from '@/components/holdline/Avatar';
import { cn } from '@/components/ui/cn';

export interface PendingLine {
  id: string;
  role: 'user' | 'counterpart';
  text: string;
  /** Tentative lines are not committed turns and never count as moves. */
  tentative: boolean;
}

/**
 * The round's conversation. Lines already there on load stay still; new committed lines grow from
 * their bubble's tail. A pending reply is visibly separate from a committed one.
 */
export function Transcript({ messages, pending, counterpartLabel, typing, avatarId }: { messages: SessionMessage[]; pending: PendingLine[]; counterpartLabel: string; typing: boolean; avatarId: string }) {
  const [initial] = useState(() => new Set(messages.map((m) => m.id)));
  const endRef = useRef<HTMLDivElement | null>(null);
  const mounted = useRef(false);
  useEffect(() => {
    // Follow new lines only; on load the scoreboard above the chat stays in view.
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    endRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [messages.length, pending.length, typing]);

  return (
    <div className="grid gap-4">
      <ol className="m-0 flex list-none flex-col gap-4 p-0" aria-label="Conversation">
        {messages.map((m) => {
          const you = m.role === 'user';
          return (
            <li key={m.id} className={cn('flex max-w-[88%] gap-2.5', you ? 'flex-row-reverse self-end' : 'self-start', !initial.has(m.id) && (you ? 'msg-in msg-in-you' : 'msg-in'))}>
              {!you && <Avatar avatarId={avatarId} size={32} className="mt-6 hidden sm:inline-block" />}
              <div className={cn('flex min-w-0 flex-col gap-1.5', you && 'items-end')}>
                <span className="label px-1">{you ? 'You' : counterpartLabel}</span>
                <div className={cn('px-4 py-3 text-[15.5px] leading-[1.5]', you ? 'bubble-you' : 'bubble-them')}>{m.text}</div>
              </div>
            </li>
          );
        })}
        {pending.map((p) => (
          <li key={p.id} className={cn('flex max-w-[88%] flex-col gap-1.5', p.role === 'user' ? 'items-end self-end' : 'self-start', p.tentative ? 'opacity-70' : 'msg-in msg-in-you')}>
            <span className="label flex items-center gap-1.5 px-1">
              {!p.tentative && <Loader2 size={11} className="animate-spin" aria-hidden />}
              {p.role === 'user' ? 'You' : counterpartLabel} · {p.tentative ? 'hearing…' : 'sending…'}
            </span>
            <div className={cn('px-4 py-3 text-[15.5px] leading-[1.5]', p.role === 'user' ? 'bubble-you opacity-75' : 'bubble-them', p.tentative && '!bg-transparent !text-ink outline-dashed outline-1 outline-line-strong')}>{p.text}</div>
          </li>
        ))}
      </ol>
      {typing && (
        <div className="msg-in flex items-end gap-2.5 self-start">
          <Avatar avatarId={avatarId} size={32} speaking className="hidden sm:inline-block" />
          <div className="flex flex-col gap-1.5">
            <span className="label px-1">{counterpartLabel}</span>
            <div className="bubble-them dots w-fit px-4 py-3.5" aria-label={`${counterpartLabel} is replying`} role="status">
              <span />
              <span />
              <span />
            </div>
          </div>
        </div>
      )}
      <div ref={endRef} aria-hidden className="scroll-mb-36 sm:scroll-mb-0" />
    </div>
  );
}
