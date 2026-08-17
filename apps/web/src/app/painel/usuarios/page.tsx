'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { inviteUserSchema, type InviteUserInput, type Role, type User, type UserInvite } from '@pcaarb/shared';
import { apiFetch, ApiError } from '@/lib/api-client';
import { useAccessToken } from '@/lib/use-access-token';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const ROLE_LABELS: Record<Role, string> = {
  owner: 'Owner',
  admin: 'Admin',
  financeiro: 'Financeiro',
  operador_caixa: 'Operador de caixa',
};

export default function UsuariosPage() {
  const router = useRouter();
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (accessToken === null) {
      router.replace('/login');
    }
  }, [accessToken, router]);

  const usersQuery = useQuery({
    queryKey: ['users'],
    queryFn: () => apiFetch<User[]>('/users', { accessToken: accessToken! }),
    enabled: !!accessToken,
  });

  const invitesQuery = useQuery({
    queryKey: ['users', 'invites'],
    queryFn: () => apiFetch<UserInvite[]>('/users/invites', { accessToken: accessToken! }),
    enabled: !!accessToken,
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
    setError,
  } = useForm<InviteUserInput>({
    resolver: zodResolver(inviteUserSchema),
    defaultValues: { role: 'operador_caixa' },
  });

  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: ['users'] });
  }

  const inviteMutation = useMutation({
    mutationFn: (values: InviteUserInput) =>
      apiFetch<UserInvite>('/users/invite', { method: 'POST', accessToken: accessToken!, body: values }),
    onSuccess: () => {
      reset({ role: 'operador_caixa', email: '' });
      invalidateAll();
    },
    onError: (error) => {
      if (error instanceof ApiError) {
        setError('root', { message: error.message });
      }
    },
  });

  const revokeMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/users/invites/${id}`, { method: 'DELETE', accessToken: accessToken! }),
    onSuccess: invalidateAll,
  });

  const roleMutation = useMutation({
    mutationFn: ({ id, role }: { id: string; role: Role }) =>
      apiFetch(`/users/${id}/role`, { method: 'PATCH', accessToken: accessToken!, body: { role } }),
    onSuccess: invalidateAll,
    onError: (error) => {
      if (error instanceof ApiError) {
        window.alert(error.message);
      }
    },
  });

  if (!accessToken) {
    return null;
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-8 px-6 py-16">
      <div>
        <Link href="/painel" className="text-sm text-zinc-500 underline">
          &larr; Painel
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Usuários</h1>
      </div>

      <form
        className="flex flex-col gap-4 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
        onSubmit={handleSubmit((values) => inviteMutation.mutate(values))}
      >
        <h2 className="text-sm font-medium">Convidar usuário</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <label className="text-sm">E-mail</label>
            <Input type="email" {...register('email')} />
            {errors.email && <p className="text-sm text-red-600">{errors.email.message}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm">Papel</label>
            <select
              className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              {...register('role')}
            >
              {Object.entries(ROLE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>
        {errors.root && <p className="text-sm text-red-600">{errors.root.message}</p>}
        <Button type="submit" disabled={inviteMutation.isPending} className="self-start">
          {inviteMutation.isPending ? 'Enviando...' : 'Enviar convite'}
        </Button>
      </form>

      {invitesQuery.data && invitesQuery.data.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-zinc-500">Convites pendentes</h2>
          <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-left dark:bg-zinc-900">
                <tr>
                  <th className="px-4 py-2 font-medium">E-mail</th>
                  <th className="px-4 py-2 font-medium">Papel</th>
                  <th className="px-4 py-2 font-medium">Expira em</th>
                  <th className="px-4 py-2 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {invitesQuery.data.map((invite) => (
                  <tr key={invite.id} className="border-t border-zinc-200 dark:border-zinc-800">
                    <td className="px-4 py-2">{invite.email}</td>
                    <td className="px-4 py-2">{ROLE_LABELS[invite.role]}</td>
                    <td className="px-4 py-2">{new Date(invite.expiresAt).toLocaleDateString('pt-BR')}</td>
                    <td className="px-4 py-2 text-right">
                      <button
                        type="button"
                        className="text-xs text-red-600 underline"
                        disabled={revokeMutation.isPending}
                        onClick={() => revokeMutation.mutate(invite.id)}
                      >
                        Revogar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-zinc-500">
          {usersQuery.data ? `${usersQuery.data.length} usuário(s)` : 'Carregando...'}
        </h2>
        <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-left dark:bg-zinc-900">
              <tr>
                <th className="px-4 py-2 font-medium">Nome</th>
                <th className="px-4 py-2 font-medium">E-mail</th>
                <th className="px-4 py-2 font-medium">Papel</th>
              </tr>
            </thead>
            <tbody>
              {usersQuery.data?.map((user) => (
                <tr key={user.id} className="border-t border-zinc-200 dark:border-zinc-800">
                  <td className="px-4 py-2">{user.name}</td>
                  <td className="px-4 py-2">{user.email}</td>
                  <td className="px-4 py-2">
                    <select
                      className="h-9 rounded-md border border-zinc-300 bg-white px-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                      value={user.role}
                      disabled={roleMutation.isPending}
                      onChange={(event) => roleMutation.mutate({ id: user.id, role: event.target.value as Role })}
                    >
                      {Object.entries(ROLE_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
