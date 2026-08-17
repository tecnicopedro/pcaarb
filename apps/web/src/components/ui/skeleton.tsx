import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('animate-pulse rounded-md bg-zinc-200 dark:bg-zinc-800', className)} {...props} />;
}

export function SkeletonRows({ rows = 3, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="flex flex-col gap-2 p-4">
      {Array.from({ length: rows }).map((_, row) => (
        <div key={row} className="flex gap-4">
          {Array.from({ length: cols }).map((_, col) => (
            <Skeleton key={col} className="h-4 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}
