'use client';

import { Accordion as Base } from '@base-ui/react/accordion';
import { Plus } from 'lucide-react';

export interface AccordionEntry {
  q: string;
  a: string;
}

/** FAQ list on Base UI: keyboard and ARIA handled; the panel height animates from its measured size. */
export function Accordion({ items, defaultOpen = 0 }: { items: AccordionEntry[]; defaultOpen?: number | null }) {
  return (
    <Base.Root defaultValue={defaultOpen === null ? [] : [defaultOpen]} className="grid gap-3">
      {items.map((item, i) => (
        <Base.Item key={item.q} value={i} className="accordion-item rounded-[20px] bg-raised shadow-[var(--shadow-raise)]">
          <Base.Header className="m-0">
            <Base.Trigger className="accordion-trigger flex w-full cursor-pointer items-center justify-between gap-4 rounded-[20px] border-0 bg-transparent px-5 py-5 text-left text-[16.5px] font-semibold tracking-[-0.01em] text-ink sm:px-6">
              {item.q}
              <span className="accordion-icon grid h-8 w-8 shrink-0 place-items-center rounded-full bg-hold-tint text-hold-text">
                <Plus size={16} strokeWidth={2.25} aria-hidden />
              </span>
            </Base.Trigger>
          </Base.Header>
          <Base.Panel className="accordion-panel overflow-hidden">
            <p className="m-0 max-w-[68ch] px-5 pb-5 text-[15.5px] leading-7 text-muted sm:px-6">{item.a}</p>
          </Base.Panel>
        </Base.Item>
      ))}
    </Base.Root>
  );
}
