import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

export function Button({className,variant='secondary',...props}:ComponentProps<'button'>&{variant?:'primary'|'secondary'|'end'|'quiet'}) {
  return <button className={cn('btn','btn-'+variant,className)} {...props}/>;
}
