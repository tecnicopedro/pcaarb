import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 bg-zinc-50 px-6 text-center dark:bg-black">
      <div className="flex flex-col gap-3">
        <span className="text-sm font-medium uppercase tracking-widest text-zinc-500">
          PCAARB
        </span>
        <h1 className="max-w-xl text-4xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Gestão e PDV para o seu varejo, sem a complexidade dos sistemas grandes.
        </h1>
        <p className="max-w-md self-center text-zinc-600 dark:text-zinc-400">
          Venda, controle estoque e financeiro em um só lugar. Comece a operar no mesmo dia.
        </p>
      </div>
      <div className="flex gap-4">
        <Link href="/registrar">
          <Button>Começar grátis</Button>
        </Link>
        <Link href="/login">
          <Button className="bg-transparent text-zinc-900 ring-1 ring-zinc-300 hover:bg-zinc-100 dark:text-zinc-50 dark:ring-zinc-700 dark:hover:bg-zinc-900">
            Entrar
          </Button>
        </Link>
      </div>
    </main>
  );
}
