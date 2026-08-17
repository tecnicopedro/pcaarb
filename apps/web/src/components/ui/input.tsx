import type { InputHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'h-10 w-full rounded-md border border-border bg-card px-3 text-sm outline-none transition-colors placeholder:text-zinc-400 focus:border-accent focus:ring-2 focus:ring-accent/20',
        className,
      )}
      {...props}
    />
  );
}
