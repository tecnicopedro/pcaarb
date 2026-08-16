import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // NestJS resolve DI via emitDecoratorMetadata; o transform padrão do
  // Vitest (esbuild) não emite esses metadados. SWC com decoratorMetadata
  // ligado replica o que o `tsc`/`nest build` fazem em produção.
  plugins: [swc.vite()],
  test: {
    include: ['src/**/*.spec.ts'],
    environment: 'node',
    globals: true,
  },
});
