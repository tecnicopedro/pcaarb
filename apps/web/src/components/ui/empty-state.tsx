import type { LucideIcon } from 'lucide-react';
import { Inbox } from 'lucide-react';

export function EmptyState({ icon: Icon = Inbox, message }: { icon?: LucideIcon; message: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10 text-center text-zinc-400">
      <Icon className="h-8 w-8" strokeWidth={1.5} />
      <p className="text-sm">{message}</p>
    </div>
  );
}
