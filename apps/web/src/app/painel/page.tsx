'use client';

import { useEffect } from 'react';
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
      <p className="text-sm text-zinc-500">
        Login realizado com sucesso. Os módulos de PDV, estoque e financeiro entram aqui a partir
        da Fase 1 do roadmap.
      </p>
    </main>
  );
}
