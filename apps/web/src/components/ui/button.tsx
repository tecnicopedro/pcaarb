'use client';

import type { ComponentProps, ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '@/lib/utils';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-accent-foreground hover:opacity-90',
  secondary: 'bg-zinc-100 text-zinc-900 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-50 dark:hover:bg-zinc-700',
  ghost: 'bg-transparent text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800',
  danger: 'bg-red-600 text-white hover:bg-red-500',
};

interface ButtonProps extends Omit<ComponentProps<typeof motion.button>, 'children'> {
  variant?: ButtonVariant;
  loading?: boolean;
  children?: ReactNode;
}

export function Button({ className, variant = 'primary', loading = false, disabled, children, ...props }: ButtonProps) {
  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      transition={{ duration: 0.1 }}
      className={cn(
        'inline-flex h-10 items-center justify-center gap-2 rounded-md px-4 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        VARIANT_CLASSES[variant],
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </motion.button>
  );
}
