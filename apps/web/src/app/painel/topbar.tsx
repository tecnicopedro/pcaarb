'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  BarChart3,
  ChevronDown,
  ClipboardList,
  Contact,
  CreditCard,
  Gift,
  History,
  LayoutDashboard,
  LogOut,
  type LucideIcon,
  Package,
  Percent,
  Plug,
  Receipt,
  Settings,
  ShoppingBag,
  ShoppingCart,
  Store,
  Users,
  Wallet,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { apiFetch } from '@/lib/api-client';
import { ROLE_LABELS } from '@/lib/role-labels';
import { useCurrentUser } from '@/lib/use-current-user';
import { Skeleton } from '@/components/ui/skeleton';

interface NavLink {
  href: string;
  label: string;
  icon: LucideIcon;
}

type NavEntry =
  | { kind: 'link'; link: NavLink }
  | { kind: 'group'; label: string; icon: LucideIcon; items: NavLink[] };

// Grouped instead of a single list (which grew past 14 items and forced
// scrolling the bar to find anything): Painel/PDV stay loose since they're
// the most used screens day-to-day, the rest go into 4 groups by area.
const NAV_ENTRIES: NavEntry[] = [
  { kind: 'link', link: { href: '/painel', label: 'Painel', icon: LayoutDashboard } },
  { kind: 'link', link: { href: '/painel/pdv', label: 'PDV', icon: ShoppingCart } },
  {
    kind: 'group',
    label: 'Operação',
    icon: Package,
    items: [
      { href: '/painel/produtos', label: 'Produtos', icon: Package },
      { href: '/painel/vendas', label: 'Vendas', icon: Receipt },
      { href: '/painel/contagens', label: 'Inventário', icon: ClipboardList },
      { href: '/painel/compras', label: 'Compras', icon: ShoppingBag },
    ],
  },
  {
    kind: 'group',
    label: 'Clientes',
    icon: Contact,
    items: [
      { href: '/painel/cadastros', label: 'Cadastros', icon: Contact },
      { href: '/painel/fidelidade', label: 'Fidelidade', icon: Gift },
    ],
  },
  {
    kind: 'group',
    label: 'Financeiro',
    icon: Wallet,
    items: [
      { href: '/painel/financeiro', label: 'Financeiro', icon: Wallet },
      { href: '/painel/relatorios', label: 'Relatórios', icon: BarChart3 },
      { href: '/painel/comissoes', label: 'Comissões', icon: Percent },
    ],
  },
  {
    kind: 'group',
    label: 'Configurações',
    icon: Settings,
    items: [
      { href: '/painel/lojas', label: 'Lojas', icon: Store },
      { href: '/painel/integracoes', label: 'Integrações', icon: Plug },
      { href: '/painel/usuarios', label: 'Usuários', icon: Users },
      { href: '/painel/assinatura', label: 'Assinatura', icon: CreditCard },
      { href: '/painel/auditoria', label: 'Auditoria', icon: History },
    ],
  },
];

function isActive(pathname: string, href: string) {
  return href === '/painel' ? pathname === '/painel' : pathname.startsWith(href);
}

const navLinkClass = (active: boolean) =>
  cn(
    'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
    active
      ? 'bg-accent-soft text-accent'
      : 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800',
  );

function NavGroup({
  label,
  icon: Icon,
  items,
  pathname,
  open,
  onToggle,
  onClose,
}: {
  label: string;
  icon: LucideIcon;
  items: NavLink[];
  pathname: string;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const groupActive = items.some((item) => isActive(pathname, item.href));

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        onClose();
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, onClose]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-haspopup="menu"
        className={navLinkClass(groupActive)}
      >
        <Icon className="h-4 w-4" />
        {label}
        <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute left-0 top-full z-20 mt-1 flex min-w-44 flex-col gap-0.5 rounded-md border border-border bg-card p-1 shadow-lg"
        >
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              role="menuitem"
              onClick={onClose}
              className={navLinkClass(isActive(pathname, item.href))}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

// The state of which dropdown is open needs to reset when the route changes
// (a link inside the group, or Painel/PDV clicked while another group was
// open). Instead of useEffect or comparing a ref during render (both
// forbidden by this project's hooks rules — setState in an effect causes a
// cascading render cycle, and reading/writing a ref during render breaks
// under the compiler's memoization), the whole component is remounted via
// key={pathname} on the Topbar — resetting openGroup to its initial value for free, with no effect at all.
function NavBar() {
  const pathname = usePathname();
  const [openGroup, setOpenGroup] = useState<string | null>(null);

  return (
    <nav className="flex flex-1 items-center gap-1">
      {NAV_ENTRIES.map((entry) =>
        entry.kind === 'link' ? (
          <Link
            key={entry.link.href}
            href={entry.link.href}
            className={navLinkClass(isActive(pathname, entry.link.href))}
          >
            <entry.link.icon className="h-4 w-4" />
            {entry.link.label}
          </Link>
        ) : (
          <NavGroup
            key={entry.label}
            label={entry.label}
            icon={entry.icon}
            items={entry.items}
            pathname={pathname}
            open={openGroup === entry.label}
            onToggle={() =>
              setOpenGroup((current) => (current === entry.label ? null : entry.label))
            }
            onClose={() => setOpenGroup(null)}
          />
        ),
      )}
    </nav>
  );
}

export function Topbar() {
  const pathname = usePathname();
  const router = useRouter();
  const meQuery = useCurrentUser();

  function logout() {
    const refreshToken = localStorage.getItem('pcaarb_refresh_token');
    // Best-effort: revokes the refresh token on the server so it doesn't stay
    // valid until it expires. If it fails (network down, etc.), the local
    // logout proceeds normally — the user can't get stuck on the screen because of this.
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

        <NavBar key={pathname} />

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
