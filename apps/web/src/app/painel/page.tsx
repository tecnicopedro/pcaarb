'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { useAccessToken } from '@/lib/use-access-token';

export default function PainelPage() {
  const router = useRouter();
  const accessToken = useAccessToken();

  useEffect(() => {
    if (accessToken === null) {
      router.replace('/login');
    }
  }, [accessToken, router]);

  function logout() {
    localStorage.removeItem('pcaarb_access_token');
    localStorage.removeItem('pcaarb_refresh_token');
    router.replace('/login');
  }

  if (!accessToken) {
    return null;
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-6 py-16">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Painel PCAARB</h1>
        <Button onClick={logout}>Sair</Button>
      </div>
      <nav className="flex flex-col gap-2">
        <Link
          href="/painel/pdv"
          className="rounded-lg border border-zinc-200 px-4 py-3 text-sm font-medium hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
        >
          PDV — abrir caixa e vender
        </Link>
        <Link
          href="/painel/produtos"
          className="rounded-lg border border-zinc-200 px-4 py-3 text-sm font-medium hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
        >
          Produtos, categorias e estoque
        </Link>
        <Link
          href="/painel/financeiro"
          className="rounded-lg border border-zinc-200 px-4 py-3 text-sm font-medium hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
        >
          Financeiro — contas a pagar e receber
        </Link>
      </nav>
      <p className="text-sm text-zinc-500">
        Fiscal (NFC-e) e pagamento integrado entram nas próximas etapas da Fase 1 do roadmap.
      </p>
    </main>
  );
}
