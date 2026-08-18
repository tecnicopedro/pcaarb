import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

// Extraído de main.ts pra poder ser reaplicado no bootstrap de teste
// (createTestingModule não passa por main.ts) — assim o e2e de CORS testa a
// configuração real, não uma cópia que pode divergir dela com o tempo.
export function buildCorsOptions(origin: string): CorsOptions {
  return {
    origin,
    credentials: true,
    // Content-Disposition não está na lista "safe" que o browser expõe por
    // padrão em fetch() cross-origin — sem isso, o front não consegue ler o
    // nome do arquivo que os downloads (ex.: exportação de relatórios) mandam.
    exposedHeaders: ['Content-Disposition'],
  };
}
