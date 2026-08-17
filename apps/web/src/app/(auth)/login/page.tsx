'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'motion/react';
import { useForm } from 'react-hook-form';
import { loginSchema, type AuthTokens, type LoginInput } from '@pcaarb/shared';
import { apiFetch, ApiError } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function LoginPage() {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    formState: { errors },
    setError,
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  const mutation = useMutation({
    mutationFn: (input: LoginInput) => apiFetch<AuthTokens>('/auth/login', { method: 'POST', body: input }),
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

  return (
    <motion.main
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-6"
    >
      <div>
        <p className="text-sm font-semibold tracking-tight text-accent">PCAARB</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Entrar</h1>
        <p className="mt-1 text-sm text-muted">Acesse o painel da sua loja.</p>
      </div>

      <form className="flex flex-col gap-4" onSubmit={handleSubmit((values) => mutation.mutate(values))}>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="email" className="text-sm font-medium">
            E-mail
          </label>
          <Input id="email" type="email" autoComplete="email" {...register('email')} />
          {errors.email && <p className="text-sm text-red-600">{errors.email.message}</p>}
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="password" className="text-sm font-medium">
            Senha
          </label>
          <Input id="password" type="password" autoComplete="current-password" {...register('password')} />
          {errors.password && <p className="text-sm text-red-600">{errors.password.message}</p>}
        </div>

        {errors.root && <p className="text-sm text-red-600">{errors.root.message}</p>}

        <Button type="submit" loading={mutation.isPending}>
          Entrar
        </Button>
      </form>

      <p className="text-center text-sm text-muted">
        Ainda não tem conta?{' '}
        <Link href="/registrar" className="font-medium text-accent hover:underline">
          Cadastre sua loja
        </Link>
      </p>
    </motion.main>
  );
}
