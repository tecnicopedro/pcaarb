'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  BarChart3,
  ClipboardList,
  Contact,
  LayoutDashboard,
  LogOut,
  Package,
  ShoppingBag,
  ShoppingCart,
  Users,
  Wallet,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { apiFetch } from '@/lib/api-client';
import { ROLE_LABELS } from '@/lib/role-labels';
import { useCurrentUser } from '@/lib/use-current-user';
import { Skeleton } from '@/components/ui/skeleton';

const NAV_ITEMS = [
  { href: '/painel', label: 'Painel', icon: LayoutDashboard },
  { href: '/painel/pdv', label: 'PDV', icon: ShoppingCart },
  { href: '/painel/produtos', label: 'Produtos', icon: Package },
  { href: '/painel/contagens', label: 'Inventário', icon: ClipboardList },
  { href: '/painel/cadastros', label: 'Cadastros', icon: Contact },
  { href: '/painel/compras', label: 'Compras', icon: ShoppingBag },
  { href: '/painel/financeiro', label: 'Financeiro', icon: Wallet },
  { href: '/painel/relatorios', label: 'Relatórios', icon: BarChart3 },
  { href: '/painel/usuarios', label: 'Usuários', icon: Users },
];

export function Topbar() {
  const pathname = usePathname();
  const router = useRouter();
  const meQuery = useCurrentUser();

  function logout() {
    const refreshToken = localStorage.getItem('pcaarb_refresh_token');
    // Best-effort: revoga o refresh token no servidor pra ele não continuar
    // válido até expirar. Se falhar (rede fora, etc.), o logout local segue
    // normal — o usuário não pode ficar preso na tela por causa disso.
    if (refreshToken) {
      apiFetch('/auth/logout', { method: 'POST', body: { refreshToken } }).catch(() => {});
    }
    localStorage.removeItem('pcaarb_access_token');
    localStorage.removeItem('pcaarb_refresh_token');
    router.replace('/login');
  }

  return (
    <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-6">
        <Link href="/painel" className="text-sm font-semibold tracking-tight">
          PCAARB
        </Link>

        <nav className="flex flex-1 items-center gap-1">
          {NAV_ITEMS.map((item) => {
            const active = item.href === '/painel' ? pathname === '/painel' : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                  active ? 'bg-accent-soft text-accent' : 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800',
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-3">
          {meQuery.data ? (
            <div className="text-right text-xs leading-tight">
              <p className="font-medium">{meQuery.data.tenant.companyName}</p>
              <p className="text-muted">
                {meQuery.data.user.name} · {ROLE_LABELS[meQuery.data.user.role]}
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-end gap-1">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-3 w-16" />
            </div>
          )}
          <button
            type="button"
            onClick={logout}
            className="flex h-8 w-8 items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-50"
            title="Sair"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
