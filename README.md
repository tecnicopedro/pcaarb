# PCAARB

SaaS de gestão empresarial com PDV (frente de caixa), inspirado na TOTVS — modular, multi-tenant, começando enxuto e evoluindo para um ERP completo.

## Onde as coisas estão

| Documento | Conteúdo |
|---|---|
| [docs/01-visao-geral-e-roadmap.md](docs/01-visao-geral-e-roadmap.md) | Visão de produto, público-alvo, módulos e roadmap por fases |
| [docs/02-stack-tecnologico.md](docs/02-stack-tecnologico.md) | Stack técnico — aprovado |
| [docs/03-build-vs-buy-pagamentos-fiscal.md](docs/03-build-vs-buy-pagamentos-fiscal.md) | Recomendação sobre usar APIs prontas vs. construir (pagamentos e fiscal) |
| [PRECOS-E-CUSTOS.md](PRECOS-E-CUSTOS.md) | Catálogo de preços de venda e estrutura de custos (rascunho) |

## Status atual

**Fase 0 (fundação) concluída e validada de ponta a ponta** contra Postgres real: migrations aplicadas, fluxo completo registro → login → refresh testado (incluindo rotação/revogação de refresh token, conflito de e-mail duplicado, senha incorreta, validação de payload), API e frontend rodando juntos.

- Monorepo pnpm + Turborepo (`apps/api`, `apps/web`, `packages/shared`, `packages/config`)
- Backend NestJS + Drizzle/Postgres: cadastro de tenant (onboarding self-service com trial), login, refresh token com rotação/revogação, guards de auth/tenant-status/roles, RBAC via CASL, validação de ambiente com Zod, Swagger em `/api/docs`
- Frontend Next.js (App Router) + Tailwind + TanStack Query: landing, registro de loja e login consumindo a API, com schemas Zod compartilhados do `packages/shared`
- Docker Compose (Postgres + Redis) para dev local, Dockerfile da API, CI no GitHub Actions (lint, typecheck, testes unitários, testes e2e contra Postgres real, build)
- Testes: unitários (validação de env, regras de RBAC) e e2e (registro → login → refresh, com rotação de token) via Vitest + Supertest + SWC (necessário para o NestJS resolver injeção de dependência corretamente sob o Vitest)

Ainda falta da Fase 0: o bloqueio automático por fim de trial (o guard `TenantStatusGuard` já existe e funciona, falta o job agendado que muda o status do tenant de `trial` para `blocked`).

## Como rodar localmente

```bash
pnpm install
docker compose up -d          # sobe Postgres e Redis
cp apps/api/.env.example apps/api/.env.local        # ajuste os segredos JWT
cp apps/web/.env.example apps/web/.env.local
pnpm db:migrate                # aplica as migrations do Drizzle
pnpm dev                       # API em :3001, Web em :3000
```

> **Porta ocupada?** O `docker-compose.yml` publica Postgres em `5433` e Redis em `6380` (em vez das portas padrão `5432`/`6379`) porque é comum já haver outro Postgres/Redis rodando na máquina (nativo, outra distro WSL etc.), o que causa falha de autenticação silenciosa por conectar no serviço errado. Se sua máquina não tem esse conflito, pode usar as portas padrão à vontade — só ajuste `DATABASE_URL` e o compose.

## Convenção do repositório

Projeto vive em `documentos/pcaarb` (mesma convenção usada em outros projetos como `marketplace_local` e `darkpedia` neste ambiente), com git próprio e `.gitignore` isolando-o dos demais arquivos da pasta `documentos`.
