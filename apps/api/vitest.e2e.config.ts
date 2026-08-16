import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Ver vitest.config.ts: NestJS precisa do decoratorMetadata do SWC para
  // resolver injeção de dependência corretamente sob o Vitest.
  plugins: [swc.vite()],
  test: {
    include: ['test/**/*.e2e-spec.ts'],
    environment: 'node',
    globals: true,
    hookTimeout: 30_000,
    testTimeout: 30_000,
  },
});
