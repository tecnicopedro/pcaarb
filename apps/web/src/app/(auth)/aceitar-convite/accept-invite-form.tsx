'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { acceptInviteSchema, type AcceptInviteInput, type AuthTokens } from '@pcaarb/shared';
import { apiFetch, ApiError } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function AcceptInviteForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const inviteId = searchParams.get('id') ?? '';
  const token = searchParams.get('token') ?? '';

  const {
    register,
    handleSubmit,
    formState: { errors },
    setError,
  } = useForm<AcceptInviteInput>({
    resolver: zodResolver(acceptInviteSchema),
    defaultValues: { inviteId, token },
  });

  const mutation = useMutation({
    mutationFn: (input: AcceptInviteInput) => apiFetch<AuthTokens>('/auth/accept-invite', { method: 'POST', body: input }),
    onSuccess: (tokens) => {
      localStorage.setItem('pcaarb_access_token', tokens.accessToken);
      localStorage.setItem('pcaarb_refresh_token', tokens.refreshToken);
      router.push('/painel');
    },
    onError: (error) => {
      if (error instanceof ApiError) {
        setError('root', { message: error.message });
      }
    },
  });

  if (!inviteId || !token) {
    return (
      <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-6 py-16">
        <p className="text-sm text-red-600">Link de convite inválido. Peça um novo convite a quem te chamou.</p>
        <Link href="/login" className="text-sm font-medium text-zinc-900 underline dark:text-zinc-50">
          Ir para o login
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-6 py-16">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Aceitar convite</h1>
        <p className="mt-1 text-sm text-zinc-500">Defina seu nome e senha para entrar no PCAARB.</p>
      </div>

      <form
        className="flex flex-col gap-4"
        onSubmit={handleSubmit((values) => mutation.mutate({ ...values, inviteId, token }))}
      >
        <input type="hidden" {...register('inviteId')} />
        <input type="hidden" {...register('token')} />

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium">Seu nome</label>
          <Input {...register('name')} />
          {errors.name && <p className="text-sm text-red-600">{errors.name.message}</p>}
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium">Senha</label>
          <Input type="password" autoComplete="new-password" {...register('password')} />
          {errors.password && <p className="text-sm text-red-600">{errors.password.message}</p>}
        </div>

        {errors.root && <p className="text-sm text-red-600">{errors.root.message}</p>}

        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? 'Entrando...' : 'Aceitar convite e entrar'}
        </Button>
      </form>
    </main>
  );
}
