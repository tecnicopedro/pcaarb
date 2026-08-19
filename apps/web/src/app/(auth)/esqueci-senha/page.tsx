'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import Link from 'next/link';
import { motion } from 'motion/react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { forgotPasswordSchema, type ForgotPasswordInput } from '@pcaarb/shared';
import { apiFetch } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordInput>({ resolver: zodResolver(forgotPasswordSchema) });

  const mutation = useMutation({
    // Always "succeeds" from the frontend's point of view, whether or not the
    // e-mail exists — same anti-enumeration discipline as the backend (see AuthService).
    mutationFn: (input: ForgotPasswordInput) => apiFetch('/auth/forgot-password', { method: 'POST', body: input }),
    onSuccess: () => setSent(true),
    onError: () => setSent(true),
  });

  return (
    <motion.main
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-6"
    >
      <div>
        <p className="text-sm font-semibold tracking-tight text-accent">PCAARB</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Esqueci minha senha</h1>
        <p className="mt-1 text-sm text-muted">Informe o e-mail da sua conta para receber um link de redefinição.</p>
      </div>

      {sent ? (
        <p className="text-sm">
          Se existir uma conta com esse e-mail, enviamos um link de redefinição — confira sua caixa de entrada (e o
          spam).
        </p>
      ) : (
        <form className="flex flex-col gap-4" onSubmit={handleSubmit((values) => mutation.mutate(values))}>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="email" className="text-sm font-medium">
              E-mail
            </label>
            <Input id="email" type="email" autoComplete="email" {...register('email')} />
            {errors.email && <p className="text-sm text-red-600">{errors.email.message}</p>}
          </div>

          <Button type="submit" loading={mutation.isPending}>
            Enviar link de redefinição
          </Button>
        </form>
      )}

      <p className="text-center text-sm text-muted">
        <Link href="/login" className="font-medium text-accent hover:underline">
          Voltar para o login
        </Link>
      </p>
    </motion.main>
  );
}
