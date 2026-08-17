'use client';

import Link from 'next/link';
import { motion } from 'motion/react';
import { BarChart3, ClipboardList, Contact, Package, ShoppingBag, ShoppingCart, Users, Wallet } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useCurrentUser } from '@/lib/use-current-user';

const SHORTCUTS = [
  { href: '/painel/pdv', label: 'PDV', description: 'Abrir caixa e vender', icon: ShoppingCart },
  { href: '/painel/produtos', label: 'Produtos', description: 'Cadastro, categorias e estoque', icon: Package },
  { href: '/painel/contagens', label: 'Inventário', description: 'Contagem de estoque e ajustes', icon: ClipboardList },
  { href: '/painel/cadastros', label: 'Cadastros', description: 'Clientes e fornecedores', icon: Contact },
  { href: '/painel/compras', label: 'Compras', description: 'Pedido a fornecedor e recebimento', icon: ShoppingBag },
  { href: '/painel/financeiro', label: 'Financeiro', description: 'Contas a pagar e receber', icon: Wallet },
  { href: '/painel/relatorios', label: 'Relatórios', description: 'Curva ABC, ticket médio e ranking', icon: BarChart3 },
  { href: '/painel/usuarios', label: 'Usuários', description: 'Convidar e gerenciar papéis', icon: Users },
];

function daysUntil(dateIso: string): number {
  return Math.ceil((new Date(dateIso).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
}

export default function PainelPage() {
  const meQuery = useCurrentUser();
  const me = meQuery.data;

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {me ? `Olá, ${me.user.name.split(' ')[0]}` : 'Painel'}
        </h1>
        {me ? (
          <div className="mt-2 flex items-center gap-2">
            <span className="text-sm text-muted">{me.tenant.companyName}</span>
            {me.tenant.status === 'trial' && me.tenant.trialEndsAt && (
              <Badge variant={daysUntil(me.tenant.trialEndsAt) <= 3 ? 'warning' : 'accent'}>
                Trial — {Math.max(daysUntil(me.tenant.trialEndsAt), 0)} dia(s) restante(s)
              </Badge>
            )}
            {me.tenant.status === 'active' && <Badge variant="success">Assinatura ativa</Badge>}
            {(me.tenant.status === 'blocked' || me.tenant.status === 'canceled') && (
              <Badge variant="danger">Acesso bloqueado</Badge>
            )}
          </div>
        ) : (
          <Skeleton className="mt-2 h-4 w-40" />
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {SHORTCUTS.map((shortcut, index) => (
          <motion.div
            key={shortcut.href}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, delay: index * 0.04 }}
          >
            <Link href={shortcut.href}>
              <Card className="flex items-center gap-4 transition-colors hover:border-accent">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-soft text-accent">
                  <shortcut.icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-medium">{shortcut.label}</p>
                  <p className="text-sm text-muted">{shortcut.description}</p>
                </div>
              </Card>
            </Link>
          </motion.div>
        ))}
      </div>

      <p className="text-sm text-muted">
        Cada venda no PDV já emite NFC-e e confirma pagamento via gateway em modo sandbox — troca para um
        provedor real (Focus NFe, Pagar.me...) quando a conta/credenciais existirem (ver docs/03).
      </p>
    </>
  );
}
