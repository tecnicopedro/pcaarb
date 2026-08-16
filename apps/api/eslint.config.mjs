import baseConfig from '@pcaarb/config/eslint';

export default [
  ...baseConfig,
  {
    rules: {
      // Desligado de propósito: o NestJS resolve injeção de dependência via
      // emitDecoratorMetadata, que só emite o tipo real em runtime para
      // imports de VALOR. Um `import type` numa classe usada só como tipo de
      // parâmetro de construtor quebra a injeção silenciosamente (o Nest
      // recebe `Function`/`Object` no lugar do token real). Essa regra não
      // consegue distinguir "tipo usado como token de DI" de "tipo comum" e
      // já causou esse bug via --fix — ver commit que corrigiu auth/tenants.
      '@typescript-eslint/consistent-type-imports': 'off',
    },
  },
];
