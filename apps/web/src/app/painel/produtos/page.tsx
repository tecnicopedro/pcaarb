'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import type { Category, Product } from '@pcaarb/shared';
import { apiFetch, ApiError } from '@/lib/api-client';
import { formatCentsToBRL, parseBRLToCents } from '@/lib/currency';
import { useAccessToken } from '@/lib/use-access-token';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const productFormSchema = z.object({
  name: z.string().min(2, 'Nome muito curto'),
  sku: z.string().optional(),
  priceReais: z.string().min(1, 'Informe o preço'),
  categoryId: z.string().optional(),
});

type ProductFormValues = z.infer<typeof productFormSchema>;

export default function ProdutosPage() {
  const router = useRouter();
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (accessToken === null) {
      router.replace('/login');
    }
  }, [accessToken, router]);

  const productsQuery = useQuery({
    queryKey: ['products'],
    queryFn: () => apiFetch<Product[]>('/products', { accessToken: accessToken! }),
    enabled: !!accessToken,
  });

  const categoriesQuery = useQuery({
    queryKey: ['categories'],
    queryFn: () => apiFetch<Category[]>('/categories', { accessToken: accessToken! }),
    enabled: !!accessToken,
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
    setError,
  } = useForm<ProductFormValues>({ resolver: zodResolver(productFormSchema) });

  const createMutation = useMutation({
    mutationFn: (values: ProductFormValues) =>
      apiFetch<Product>('/products', {
        method: 'POST',
        accessToken: accessToken!,
        body: {
          name: values.name,
          sku: values.sku || undefined,
          priceCents: parseBRLToCents(values.priceReais),
          categoryId: values.categoryId || undefined,
        },
      }),
    onSuccess: () => {
      reset();
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
    onError: (error) => {
      if (error instanceof ApiError) {
        setError('root', { message: error.message });
      }
    },
  });

  const [newCategoryName, setNewCategoryName] = useState('');
  const createCategoryMutation = useMutation({
    mutationFn: (name: string) =>
      apiFetch<Category>('/categories', { method: 'POST', accessToken: accessToken!, body: { name } }),
    onSuccess: () => {
      setNewCategoryName('');
      queryClient.invalidateQueries({ queryKey: ['categories'] });
    },
  });

  if (!accessToken) {
    return null;
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-8 px-6 py-16">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/painel" className="text-sm text-zinc-500 underline">
            &larr; Painel
          </Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Produtos</h1>
        </div>
      </div>

      <form
        className="flex flex-col gap-4 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
        onSubmit={handleSubmit((values) => createMutation.mutate(values))}
      >
        <h2 className="text-sm font-medium">Novo produto</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <label className="text-sm">Nome</label>
            <Input {...register('name')} />
            {errors.name && <p className="text-sm text-red-600">{errors.name.message}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm">SKU</label>
            <Input {...register('sku')} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm">Preço (R$)</label>
            <Input placeholder="0,00" {...register('priceReais')} />
            {errors.priceReais && <p className="text-sm text-red-600">{errors.priceReais.message}</p>}
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <label className="text-sm">Categoria</label>
            <select
              className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              {...register('categoryId')}
            >
              <option value="">Sem categoria</option>
              {categoriesQuery.data?.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        {errors.root && <p className="text-sm text-red-600">{errors.root.message}</p>}
        <Button type="submit" disabled={createMutation.isPending} className="self-start">
          {createMutation.isPending ? 'Salvando...' : 'Adicionar produto'}
        </Button>
      </form>

      <div className="flex items-end gap-2 rounded-lg border border-dashed border-zinc-300 p-4 dark:border-zinc-700">
        <div className="flex flex-1 flex-col gap-1.5">
          <label className="text-sm">Nova categoria</label>
          <Input
            value={newCategoryName}
            onChange={(e) => setNewCategoryName(e.target.value)}
            placeholder="Ex.: Bebidas"
          />
        </div>
        <Button
          type="button"
          disabled={newCategoryName.trim().length < 2 || createCategoryMutation.isPending}
          onClick={() => createCategoryMutation.mutate(newCategoryName.trim())}
        >
          {createCategoryMutation.isPending ? 'Criando...' : 'Criar categoria'}
        </Button>
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-zinc-500">
          {productsQuery.data ? `${productsQuery.data.length} produto(s)` : 'Carregando...'}
        </h2>
        <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-left dark:bg-zinc-900">
              <tr>
                <th className="px-4 py-2 font-medium">Nome</th>
                <th className="px-4 py-2 font-medium">SKU</th>
                <th className="px-4 py-2 font-medium">Preço</th>
                <th className="px-4 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {productsQuery.data?.map((product) => (
                <tr key={product.id} className="border-t border-zinc-200 dark:border-zinc-800">
                  <td className="px-4 py-2">{product.name}</td>
                  <td className="px-4 py-2 text-zinc-500">{product.sku ?? '—'}</td>
                  <td className="px-4 py-2">{formatCentsToBRL(product.priceCents)}</td>
                  <td className="px-4 py-2">
                    {product.active ? (
                      <span className="text-green-600">Ativo</span>
                    ) : (
                      <span className="text-zinc-400">Inativo</span>
                    )}
                  </td>
                </tr>
              ))}
              {productsQuery.data?.length === 0 && (
                <tr>
                  <td className="px-4 py-6 text-center text-zinc-400" colSpan={4}>
                    Nenhum produto cadastrado ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
