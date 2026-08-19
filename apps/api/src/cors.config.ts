import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

// Extracted from main.ts so it can be reapplied in the test bootstrap
// (createTestingModule doesn't go through main.ts) — this way the CORS e2e
// test exercises the real configuration, not a copy that could drift from it
// over time.
export function buildCorsOptions(origin: string): CorsOptions {
  return {
    origin,
    credentials: true,
    // Content-Disposition isn't on the "safe" list the browser exposes by
    // default on a cross-origin fetch() — without this, the frontend can't
    // read the filename that downloads (e.g. report exports) send.
    exposedHeaders: ['Content-Disposition'],
  };
}
