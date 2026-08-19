'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'motion/react';
import { useForm } from 'react-hook-form';
import { resetPasswordSchema, type ResetPasswordInput } from '@pcaarb/shared';
import { apiFetch, ApiError } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = searchParams.get('id') ?? '';
  const token = searchParams.get('token') ?? '';

  const {
    register,
    handleSubmit,
    formState: { errors },
    setError,
  } = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { id, token },
  });

  const mutation = useMutation({
    mutationFn: (input: ResetPasswordInput) => apiFetch('/auth/reset-password', { method: 'POST', body: input }),
    onSuccess: () => router.push('/login'),
    onError: (error) => {
      if (error instanceof ApiError) {
        setError('root', { message: error.message });
      }
    },
  });

  if (!id || !token) {
    return (
      <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-6">
        <p className="text-sm text-red-600">Link de redefinição inválido. Peça um novo em &quot;Esqueci minha senha&quot;.</p>
        <Link href="/esqueci-senha" className="text-sm font-medium text-accent hover:underline">
          Esqueci minha senha
        </Link>
      </main>
    );
  }

  return (
    <motion.main
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-6"
    >
      <div>
        <p className="text-sm font-semibold tracking-tight text-accent">PCAARB</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Escolher nova senha</h1>
        <p className="mt-1 text-sm text-muted">Suas sessões atuais serão encerradas depois da troca.</p>
      </div>

      <form
        className="flex flex-col gap-4"
        onSubmit={handleSubmit((values) => mutation.mutate({ ...values, id, token }))}
      >
        <input type="hidden" {...register('id')} />
        <input type="hidden" {...register('token')} />

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium">Nova senha</label>
          <Input type="password" autoComplete="new-password" {...register('password')} />
          {errors.password && <p className="text-sm text-red-600">{errors.password.message}</p>}
        </div>

        {errors.root && <p className="text-sm text-red-600">{errors.root.message}</p>}

        <Button type="submit" loading={mutation.isPending}>
          Redefinir senha
        </Button>
      </form>
    </motion.main>
  );
}
