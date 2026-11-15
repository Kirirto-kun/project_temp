import { Check } from 'lucide-react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from './cn';

type NativeProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'title' | 'role' | 'type' | 'onClick' | 'aria-checked' | 'aria-pressed' | 'children'>;

export interface ChoiceCardProps extends NativeProps {
  selected: boolean;
  onSelect: () => void;
  /** `radio`: one of a `role="radiogroup"` (aria-checked). `toggle`: a pressed/unpressed button (aria-pressed). */
  mode?: 'radio' | 'toggle';
  title: ReactNode;
  /** One muted line under the title. */
  description?: ReactNode;
  /** A small inline icon or illustration on the left. Icons inherit the text colour. */
  leading?: ReactNode;
  /** Extra content under the description (persona cards). */
  children?: ReactNode;
  /** Short centred labels in tight grids: no trailing check, selection shows by border and tint. */
  compact?: boolean;
  /** Vertical alignment of the leading slot, text and check. Multi-line cards use `start`. */
  align?: 'center' | 'start';
}

/** A selectable row or card: hairline border, brand border + tint + filled check when selected. */
export function ChoiceCard({ selected, onSelect, mode = 'radio', title, description, leading, children, compact = false, align = 'center', className, ...rest }: ChoiceCardProps) {
  const state = mode === 'radio' ? { role: 'radio' as const, 'aria-checked': selected } : { 'aria-pressed': selected };
  return (
    <button type="button" {...rest} {...state} onClick={onSelect} data-compact={compact || undefined} data-align={align} className={cn('choice', className)}>
      {leading && (
        <span className="choice-leading" aria-hidden>
          {leading}
        </span>
      )}
      <span className="choice-body">
        <span className="choice-title">{title}</span>
        {description && <span className="choice-desc">{description}</span>}
        {children}
      </span>
      {!compact && (
        <span className="choice-check" aria-hidden>
          <Check size={12} strokeWidth={3} />
        </span>
      )}
    </button>
  );
}
