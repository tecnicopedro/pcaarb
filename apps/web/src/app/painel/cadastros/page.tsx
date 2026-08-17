'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Contact, Truck } from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';
import type { Customer, Supplier } from '@pcaarb/shared';
import { apiFetch, ApiError } from '@/lib/api-client';
import { useAccessToken } from '@/lib/use-access-token';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { SkeletonRows } from '@/components/ui/skeleton';

type Resource = 'customers' | 'suppliers';

const RESOURCE_CONFIG = {
  customers: {
    label: 'Clientes',
    singular: 'cliente',
    endpoint: '/customers',
    icon: Contact,
    emptyMessage: 'Nenhum cliente cadastrado ainda.',
  },
  suppliers: {
    label: 'Fornecedores',
    singular: 'fornecedor',
    endpoint: '/suppliers',
    icon: Truck,
    emptyMessage: 'Nenhum fornecedor cadastrado ainda.',
  },
} as const;

// CPF/CNPJ e e-mail são opcionais no cadastro, mas o campo em branco chega como
// "" (não undefined) via react-hook-form — só validamos o formato quando preenchido.
const partyFormSchema = z.object({
  name: z.string().min(2, 'Nome muito curto').max(160),
  document: z
    .string()
    .optional()
    .refine((v) => !v || /^\d{11}$|^\d{14}$/.test(v), 'CPF (11 dígitos) ou CNPJ (14 dígitos), somente números'),
  email: z
    .string()
    .optional()
    .refine((v) => !v || z.string().email().safeParse(v).success, 'E-mail inválido'),
  phone: z.string().optional(),
});

type PartyFormValues = z.infer<typeof partyFormSchema>;
type Party = Customer | Supplier;

function PartySection({ resource }: { resource: Resource }) {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();
  const config = RESOURCE_CONFIG[resource];

  const listQuery = useQuery({
    queryKey: [resource],
    queryFn: () => apiFetch<Party[]>(config.endpoint, { accessToken: accessToken! }),
    enabled: !!accessToken,
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
    setError,
  } = useForm<PartyFormValues>({ resolver: zodResolver(partyFormSchema) });

  const createMutation = useMutation({
    mutationFn: (values: PartyFormValues) =>
      apiFetch<Party>(config.endpoint, {
        method: 'POST',
        accessToken: accessToken!,
        body: {
          name: values.name,
          document: values.document || undefined,
          email: values.email || undefined,
          phone: values.phone || undefined,
        },
      }),
    onSuccess: () => {
      reset();
      queryClient.invalidateQueries({ queryKey: [resource] });
      toast.success(`${config.singular === 'cliente' ? 'Cliente' : 'Fornecedor'} cadastrado`);
    },
    onError: (error) => {
      if (error instanceof ApiError) {
        setError('root', { message: error.message });
      }
    },
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`${config.endpoint}/${id}`, { method: 'DELETE', accessToken: accessToken! }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [resource] });
      toast.success(`${config.singular === 'cliente' ? 'Cliente' : 'Fornecedor'} removido`);
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : `Erro ao remover ${config.singular}`);
    },
  });

  if (!accessToken) {
    return null;
  }

  return (
    <div className="flex flex-col gap-6">
      <Card as="form" className="flex flex-col gap-4" onSubmit={handleSubmit((values) => createMutation.mutate(values))}>
        <h2 className="text-sm font-medium">Novo {config.singular}</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <label className="text-sm">Nome</label>
            <Input {...register('name')} />
            {errors.name && <p className="text-sm text-red-600">{errors.name.message}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm">CPF/CNPJ</label>
            <Input placeholder="Somente números" {...register('document')} />
            {errors.document && <p className="text-sm text-red-600">{errors.document.message}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm">Telefone</label>
            <Input {...register('phone')} />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <label className="text-sm">E-mail</label>
            <Input type="email" {...register('email')} />
            {errors.email && <p className="text-sm text-red-600">{errors.email.message}</p>}
          </div>
        </div>
        {errors.root && <p className="text-sm text-red-600">{errors.root.message}</p>}
        <Button type="submit" loading={createMutation.isPending} className="self-start">
          Adicionar {config.singular}
        </Button>
      </Card>

      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-muted">
          {listQuery.data ? `${listQuery.data.length} ${config.label.toLowerCase()}` : ''}
        </h2>
        <div className="overflow-x-auto rounded-lg border border-border">
          {!listQuery.data ? (
            <SkeletonRows rows={4} cols={4} />
          ) : listQuery.data.length === 0 ? (
            <EmptyState icon={config.icon} message={config.emptyMessage} />
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-left dark:bg-zinc-900">
                <tr>
                  <th className="px-4 py-2 font-medium">Nome</th>
                  <th className="px-4 py-2 font-medium">CPF/CNPJ</th>
                  <th className="px-4 py-2 font-medium">Contato</th>
                  <th className="px-4 py-2 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                <AnimatePresence initial={false}>
                  {listQuery.data.map((party) => (
                    <motion.tr
                      key={party.id}
                      layout
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="border-t border-border"
                    >
                      <td className="px-4 py-2">{party.name}</td>
                      <td className="px-4 py-2 text-muted">{party.document ?? '—'}</td>
                      <td className="px-4 py-2 text-muted">{party.email ?? party.phone ?? '—'}</td>
                      <td className="px-4 py-2 text-right">
                        <button
                          type="button"
                          className="text-xs text-red-600 hover:underline"
                          disabled={removeMutation.isPending}
                          onClick={() => removeMutation.mutate(party.id)}
                        >
                          Excluir
                        </button>
                      </td>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

export default function CadastrosPage() {
  const [tab, setTab] = useState<Resource>('customers');

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Cadastros</h1>

      <div className="flex gap-1 border-b border-border">
        {(Object.keys(RESOURCE_CONFIG) as Resource[]).map((key) => {
          const TabIcon = RESOURCE_CONFIG[key].icon;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={cn(
                'flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors',
                tab === key
                  ? 'border-accent text-accent'
                  : 'border-transparent text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50',
              )}
            >
              <TabIcon className="h-4 w-4" />
              {RESOURCE_CONFIG[key].label}
            </button>
          );
        })}
      </div>

      <PartySection key={tab} resource={tab} />
    </>
  );
}
