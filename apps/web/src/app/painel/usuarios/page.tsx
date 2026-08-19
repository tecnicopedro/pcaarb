'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { Fragment, useState } from 'react';
import { useForm } from 'react-hook-form';
import { KeyRound, Mail, Plus, UserPlus, Users } from 'lucide-react';
import { toast } from 'sonner';
import {
  inviteUserSchema,
  permissionActionSchema,
  permissionSubjectSchema,
  type InviteUserInput,
  type PermissionAction,
  type PermissionOverride,
  type PermissionSubject,
  type Role,
  type User,
  type UserInvite,
} from '@pcaarb/shared';
import { apiFetch, ApiError } from '@/lib/api-client';
import { useAccessToken } from '@/lib/use-access-token';
import { useCurrentUser } from '@/lib/use-current-user';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { SkeletonRows } from '@/components/ui/skeleton';
import { ROLE_LABELS } from '@/lib/role-labels';
import { PERMISSION_ACTION_LABELS, PERMISSION_SUBJECT_LABELS } from '@/lib/permission-labels';

function PermissionOverridesPanel({ userId }: { userId: string }) {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();
  const [subject, setSubject] = useState<PermissionSubject>(permissionSubjectSchema.options[0]);
  const [action, setAction] = useState<PermissionAction>('read');
  const [effect, setEffect] = useState<'allow' | 'deny'>('allow');

  const overridesQuery = useQuery({
    queryKey: ['permission-overrides', userId],
    queryFn: () => apiFetch<PermissionOverride[]>(`/users/${userId}/permission-overrides`, { accessToken: accessToken! }),
    enabled: !!accessToken,
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['permission-overrides', userId] });
  }

  const createMutation = useMutation({
    mutationFn: () =>
      apiFetch<PermissionOverride>(`/users/${userId}/permission-overrides`, {
        method: 'POST',
        accessToken: accessToken!,
        body: { subject, action, effect },
      }),
    onSuccess: () => {
      invalidate();
      toast.success('Exceção de permissão salva');
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Erro ao salvar exceção de permissão');
    },
  });

  const removeMutation = useMutation({
    mutationFn: (overrideId: string) =>
      apiFetch(`/users/${userId}/permission-overrides/${overrideId}`, { method: 'DELETE', accessToken: accessToken! }),
    onSuccess: () => {
      invalidate();
      toast.success('Exceção removida');
    },
  });

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted">
        Exceções pontuais além do papel — concedem ou revogam uma permissão específica sem trocar o papel do usuário.
      </p>

      {overridesQuery.data && overridesQuery.data.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <AnimatePresence initial={false}>
            {overridesQuery.data.map((override) => (
              <motion.div
                key={override.id}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="flex items-center gap-1.5 rounded-full border border-border bg-card py-1 pl-3 pr-1.5 text-xs"
              >
                <Badge variant={override.effect === 'allow' ? 'success' : 'danger'}>
                  {override.effect === 'allow' ? '+' : '−'}
                </Badge>
                {PERMISSION_ACTION_LABELS[override.action]} · {PERMISSION_SUBJECT_LABELS[override.subject]}
                <button
                  type="button"
                  className="text-muted hover:text-red-600"
                  disabled={removeMutation.isPending}
                  onClick={() => removeMutation.mutate(override.id)}
                  aria-label="Remover"
                >
                  ×
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs">Módulo</label>
          <select
            className="h-9 rounded-md border border-border bg-card px-2 text-sm"
            value={subject}
            onChange={(e) => setSubject(e.target.value as PermissionSubject)}
          >
            {permissionSubjectSchema.options.map((option) => (
              <option key={option} value={option}>
                {PERMISSION_SUBJECT_LABELS[option]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs">Ação</label>
          <select
            className="h-9 rounded-md border border-border bg-card px-2 text-sm"
            value={action}
            onChange={(e) => setAction(e.target.value as PermissionAction)}
          >
            {permissionActionSchema.options.map((option) => (
              <option key={option} value={option}>
                {PERMISSION_ACTION_LABELS[option]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs">Efeito</label>
          <select
            className="h-9 rounded-md border border-border bg-card px-2 text-sm"
            value={effect}
            onChange={(e) => setEffect(e.target.value as 'allow' | 'deny')}
          >
            <option value="allow">Conceder</option>
            <option value="deny">Revogar</option>
          </select>
        </div>
        <Button
          type="button"
          variant="secondary"
          loading={createMutation.isPending}
          onClick={() => createMutation.mutate()}
        >
          <Plus className="h-4 w-4" />
          Adicionar
        </Button>
      </div>
    </div>
  );
}

export default function UsuariosPage() {
  const accessToken = useAccessToken();
  const meQuery = useCurrentUser();
  const queryClient = useQueryClient();
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);

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
    onSuccess: (invite) => {
      reset({ role: 'operador_caixa', email: '' });
      invalidateAll();
      toast.success(`Convite enviado para ${invite.email}`);
    },
    onError: (error) => {
      if (error instanceof ApiError) {
        setError('root', { message: error.message });
      }
    },
  });

  const revokeMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/users/invites/${id}`, { method: 'DELETE', accessToken: accessToken! }),
    onSuccess: () => {
      invalidateAll();
      toast.success('Convite revogado');
    },
  });

  const roleMutation = useMutation({
    mutationFn: ({ id, role }: { id: string; role: Role }) =>
      apiFetch(`/users/${id}/role`, { method: 'PATCH', accessToken: accessToken!, body: { role } }),
    onSuccess: () => {
      invalidateAll();
      toast.success('Papel atualizado');
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Erro inesperado ao atualizar o papel');
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/users/${id}`, { method: 'DELETE', accessToken: accessToken! }),
    onSuccess: () => {
      invalidateAll();
      toast.success('Usuário desativado');
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Erro ao desativar usuário');
    },
  });

  if (!accessToken) {
    return null;
  }

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Usuários</h1>

      <Card as="form" className="flex flex-col gap-4" onSubmit={handleSubmit((values) => inviteMutation.mutate(values))}>
        <h2 className="flex items-center gap-2 text-sm font-medium">
          <UserPlus className="h-4 w-4" />
          Convidar usuário
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <label className="text-sm">E-mail</label>
            <Input type="email" {...register('email')} />
            {errors.email && <p className="text-sm text-red-600">{errors.email.message}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm">Papel</label>
            <select className="h-10 rounded-md border border-border bg-card px-3 text-sm" {...register('role')}>
              {Object.entries(ROLE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>
        {errors.root && <p className="text-sm text-red-600">{errors.root.message}</p>}
        <Button type="submit" loading={inviteMutation.isPending} className="self-start">
          Enviar convite
        </Button>
      </Card>

      <AnimatePresence initial={false}>
        {invitesQuery.data && invitesQuery.data.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="flex flex-col gap-2"
          >
            <h2 className="flex items-center gap-1.5 text-sm font-medium text-muted">
              <Mail className="h-3.5 w-3.5" />
              Convites pendentes
            </h2>
            <div className="overflow-x-auto rounded-lg border border-border">
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
                  <AnimatePresence initial={false}>
                    {invitesQuery.data.map((invite) => (
                      <motion.tr
                        key={invite.id}
                        layout
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="border-t border-border"
                      >
                        <td className="px-4 py-2">{invite.email}</td>
                        <td className="px-4 py-2">{ROLE_LABELS[invite.role]}</td>
                        <td className="px-4 py-2">{new Date(invite.expiresAt).toLocaleDateString('pt-BR')}</td>
                        <td className="px-4 py-2 text-right">
                          <button
                            type="button"
                            className="text-xs text-red-600 hover:underline"
                            disabled={revokeMutation.isPending}
                            onClick={() => revokeMutation.mutate(invite.id)}
                          >
                            Revogar
                          </button>
                        </td>
                      </motion.tr>
                    ))}
                  </AnimatePresence>
                </tbody>
              </table>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-muted">{usersQuery.data ? `${usersQuery.data.length} usuário(s)` : ''}</h2>
        <div className="overflow-x-auto rounded-lg border border-border">
          {!usersQuery.data ? (
            <SkeletonRows rows={3} cols={5} />
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-left dark:bg-zinc-900">
                <tr>
                  <th className="px-4 py-2 font-medium">Nome</th>
                  <th className="px-4 py-2 font-medium">E-mail</th>
                  <th className="px-4 py-2 font-medium">Papel</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {usersQuery.data.map((user) => (
                  <Fragment key={user.id}>
                    <tr className="border-t border-border">
                      <td className="px-4 py-2">{user.name}</td>
                      <td className="px-4 py-2">{user.email}</td>
                      <td className="px-4 py-2">
                        <select
                          className="h-9 rounded-md border border-border bg-card px-2 text-sm"
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
                      <td className="px-4 py-2">
                        <Badge variant={user.active ? 'success' : 'neutral'}>{user.active ? 'Ativo' : 'Inativo'}</Badge>
                      </td>
                      <td className="px-4 py-2 text-right">
                        <div className="flex justify-end gap-3">
                          {user.role !== 'owner' && (
                            <button
                              type="button"
                              className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
                              onClick={() => setExpandedUserId(expandedUserId === user.id ? null : user.id)}
                            >
                              <KeyRound className="h-3.5 w-3.5" />
                              Permissões
                            </button>
                          )}
                          {user.active && user.id !== meQuery.data?.user.id && (
                            <button
                              type="button"
                              className="text-xs text-red-600 hover:underline"
                              disabled={deactivateMutation.isPending}
                              onClick={() => deactivateMutation.mutate(user.id)}
                            >
                              Desativar
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    <AnimatePresence initial={false}>
                      {expandedUserId === user.id && (
                        <motion.tr
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="border-t border-border bg-zinc-50 dark:bg-zinc-900"
                        >
                          <td className="px-4 py-3" colSpan={5}>
                            <PermissionOverridesPanel userId={user.id} />
                          </td>
                        </motion.tr>
                      )}
                    </AnimatePresence>
                  </Fragment>
                ))}
              </tbody>
            </table>
          )}
          {usersQuery.data?.length === 0 && <EmptyState icon={Users} message="Nenhum usuário cadastrado ainda." />}
        </div>
      </div>
    </>
  );
}
