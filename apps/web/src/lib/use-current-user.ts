import { useQuery } from '@tanstack/react-query';
import type { Me } from '@pcaarb/shared';
import { apiFetch } from './api-client';
import { useAccessToken } from './use-access-token';

export function useCurrentUser() {
  const accessToken = useAccessToken();
  return useQuery({
    queryKey: ['users', 'me'],
    queryFn: () => apiFetch<Me>('/users/me', { accessToken: accessToken! }),
    enabled: !!accessToken,
    staleTime: 60_000,
  });
}
