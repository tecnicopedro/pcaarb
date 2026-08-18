const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly issues?: Array<{ path: string; message: string }>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function apiFetch<TResponse>(
  path: string,
  options: { method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'; body?: unknown; accessToken?: string } = {},
): Promise<TResponse> {
  const response = await fetch(`${API_URL}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(options.accessToken ? { Authorization: `Bearer ${options.accessToken}` } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const data = await response.json().catch(() => undefined);

  if (!response.ok) {
    throw new ApiError(data?.message ?? 'Erro inesperado', response.status, data?.issues);
  }

  return data as TResponse;
}

// Downloads (CSV etc.) não são JSON — o backend manda Content-Disposition
// com o nome do arquivo, então lemos daqui em vez de fixar um nome no front.
export async function apiDownload(path: string, accessToken: string): Promise<void> {
  const response = await fetch(`${API_URL}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    const data = await response.json().catch(() => undefined);
    throw new ApiError(data?.message ?? 'Erro ao gerar o arquivo', response.status, data?.issues);
  }

  const disposition = response.headers.get('content-disposition') ?? '';
  const filenameMatch = /filename="([^"]+)"/.exec(disposition);
  const filename = filenameMatch?.[1] ?? 'exportacao.csv';

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
