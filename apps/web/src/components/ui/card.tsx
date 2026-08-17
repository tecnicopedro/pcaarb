import type { ElementType, HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

type CardProps<T extends ElementType> = HTMLAttributes<HTMLElement> & { as?: T };

export function Card<T extends ElementType = 'div'>({ as, className, ...props }: CardProps<T>) {
  const Component = as ?? 'div';
  return (
    <Component
      className={cn('rounded-xl border border-border bg-card p-4 shadow-sm', className)}
      {...props}
    />
  );
}
