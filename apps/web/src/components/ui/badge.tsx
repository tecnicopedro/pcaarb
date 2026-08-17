import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

const VARIANT_CLASSES = {
  neutral: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300',
  success: 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400',
  warning: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400',
  danger: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400',
  accent: 'bg-accent-soft text-accent',
} as const;

export type BadgeVariant = keyof typeof VARIANT_CLASSES;

export function Badge({
  variant = 'neutral',
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { variant?: BadgeVariant }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        VARIANT_CLASSES[variant],
        className,
      )}
      {...props}
    />
  );
}
