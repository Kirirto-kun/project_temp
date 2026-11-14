import type { SessionMessage } from '@/contracts/domain';

export interface PendingLine {
  id: string;
  role: 'user' | 'counterpart';
  text: string;
  /** Tentative lines are not committed turns and never count as moves. */
  tentative: boolean;
}

export function Transcript({ messages, pending, counterpartLabel, typing }: { messages: SessionMessage[]; pending: PendingLine[]; counterpartLabel: string; typing: boolean }) {
  return (
    <ol className="m-0 flex list-none flex-col gap-4 p-0" aria-label="Conversation">
      {messages.map((m) => (
        <li key={m.id} className={`flex max-w-[85%] flex-col gap-1 ${m.role === 'user' ? 'self-end items-end' : ''}`}>
          <span className="label">{m.role === 'user' ? 'You' : counterpartLabel}</span>
          <div className={`rounded-[8px] px-4 py-3 ${m.role === 'user' ? 'bubble-you' : 'bubble-them'}`}>{m.text}</div>
        </li>
      ))}
      {pending.map((p) => (
        <li key={p.id} className={`flex max-w-[85%] flex-col gap-1 opacity-70 ${p.role === 'user' ? 'self-end items-end' : ''}`}>
          <span className="label">{p.role === 'user' ? 'You' : counterpartLabel} · {p.tentative ? 'hearing…' : 'sending…'}</span>
          <div className={`rounded-[8px] border border-dashed border-line px-4 py-3 ${p.role === 'user' ? 'bubble-you' : 'bubble-them'}`}>{p.text}</div>
        </li>
      ))}
      {typing && (
        <li className="flex flex-col gap-1">
          <span className="label">{counterpartLabel}</span>
          <div className="bubble-them dots w-fit rounded-[8px] px-4 py-3" aria-label={`${counterpartLabel} is replying`}>
            <span />
            <span />
            <span />
          </div>
        </li>
      )}
    </ol>
  );
}
