# PCAARB — Proposta de Stack Tecnológico

> **Este documento existe para sua confirmação antes de começar a codar.** Onde há mais de uma opção razoável, listo a alternativa considerada e por que não foi a escolhida — para você poder discordar de um ponto específico sem rejeitar o pacote inteiro.

> **Nota (2026-08-18):** este é o documento de proposta original, anterior à Fase 0 — mantido como registro do raciocínio por trás das escolhas, não como status atual. Para o que foi de fato implementado, [README.md](../README.md) é a fonte de verdade (seção "Status atual", atualizada a cada módulo entregue). Alguns pontos abaixo divergiram da proposta durante a implementação real, porque a necessidade que os justificava nunca se materializou nesta escala — nenhum deles bloqueia nada hoje, mas vale saber antes de assumir que estão prontos:
> - **BullMQ + Redis (seção 3):** não usado. Emissão fiscal, pagamento e e-mail de convite rodam de forma síncrona dentro do próprio request (com contingência/retry manual onde faz sentido, não fila) — suficiente no volume atual; revisitar se algum desses passos ficar lento o bastante para valer a complexidade operacional de uma fila.
> - **Playwright como suite de E2E automatizado (seção 7):** não existe como suite comitada — os testes automatizados de verdade são Vitest+Supertest contra a API real (`apps/api/test/`, rodando em CI). Playwright é usado nas sessões de desenvolvimento para verificação manual ao vivo do frontend, não como testes que rodam sozinhos.
> - **2FA (seção 6) e log de auditoria de ações privilegiadas (seção 11):** adiados deliberadamente, não esquecidos — ver "Hardening de segurança pós-revisão" no README para a lista completa de itens adiados conscientemente.
> - **Observabilidade — Sentry/OpenTelemetry/Better Stack (seção 10):** ainda não instrumentado.
> - **Dependabot/Snyk (seção 11):** ainda não configurado.
> - **CI/CD (seção 8):** lint/typecheck/test/e2e/build agora rodam de verdade em todo push/PR (`.github/workflows/ci.yml`) — mas deploy automático para staging/produção não existe: nenhum ambiente de produção foi provisionado ainda (ver memória do agente sobre os bloqueios de lançamento).

## 1. Requisitos que guiaram a escolha

Você pediu que a stack considerasse: controle de versão, segurança, validações, testes, desempenho, qualidade, e flexibilidade de comunicação front↔back. A isso eu somo uma restrição real do projeto: **orçamento inicial baixo, mas sem abrir mão de qualidade** — ou seja, priorizar ferramentas com free tier/custo baixo em escala pequena, que não exijam reescrita quando a escala crescer.

## 2. Visão geral da arquitetura

- **Monorepo** (pnpm workspaces + Turborepo): backend, frontend, e pacotes compartilhados (tipos, validação) no mesmo repositório. Evita duplicar contratos de API e permite que um PR mude back e front juntos com type-safety ponta a ponta.
- **Monólito modular** para começar: um único serviço backend organizado em módulos de domínio (Vendas, Estoque, Financeiro, Fiscal...) com fronteiras internas claras. Não vamos partir para microsserviços cedo — isso adicionaria complexidade operacional que não se paga no tamanho atual do projeto. A modularidade interna permite extrair um módulo para serviço próprio no futuro, se algum module precisar escalar isoladamente (ex.: emissão fiscal assíncrona).
- **Multi-tenant:** banco compartilhado, schema compartilhado, isolamento por `tenant_id` + Row-Level Security do PostgreSQL. Mais barato que schema-por-tenant e suficiente para o volume esperado nos próximos 1-2 anos; dá para evoluir para schema-per-tenant em clientes grandes específicos depois, sem reescrever a aplicação.

## 3. Backend

| Camada | Escolha | Por quê |
|---|---|---|
| Linguagem | TypeScript | Mesmo tipo de dado do front ao back; reduz bugs de contrato de API |
| Framework | **NestJS** | Estrutura modular nativa (bate com a arquitetura de domínios acima), DI, guards prontos para RBAC/multi-tenant, gera OpenAPI automaticamente, testável por padrão |
| ORM / acesso a dados | **Drizzle ORM** + PostgreSQL | Camada fina, SQL-like, melhor desempenho e previsibilidade que ORMs "mágicos" em queries complexas (relatórios, financeiro) — importante já que "desempenho" foi requisito explícito |
| Validação | **Zod** | Mesmo schema de validação é reaproveitado no front (formulários) e no back (DTO) — elimina duplicação e evita "back valida uma coisa, front outra" |
| Fila/jobs assíncronos | **BullMQ + Redis** | Emissão fiscal, e-mails, relatórios pesados rodam em background sem travar a venda no PDV |
| API pública | REST + OpenAPI (Swagger) | Padrão universal, essencial para a Fase 4 (API pública/parceiros); OpenAPI gerado automaticamente pelo NestJS |

**Alternativa considerada — Prisma ORM:** melhor DX inicial (menos código), mas historicamente mais lento em queries complexas e com menos controle fino sobre SQL gerado — pesa contra o requisito de desempenho, especialmente em relatórios financeiros. Fica como plano B se a equipe achar o Drizzle verboso demais na prática.

**Alternativa considerada — GraphQL/tRPC ao invés de REST:** tRPC seria mais rápido de desenvolver entre front e back TypeScript, mas trava a comunicação em clientes TypeScript — inviabiliza a API pública da Fase 4 sem uma segunda camada depois. REST com OpenAPI já nasce pronta para consumo externo.

## 4. Frontend (painel administrativo e retaguarda)

| Camada | Escolha | Por quê |
|---|---|---|
| Framework | **Next.js (App Router) + TypeScript** | Server components reduzem JS enviado ao navegador (desempenho), bom SEO se um dia tivermos páginas públicas (ex.: página de vitrine) |
| UI | **Tailwind CSS + shadcn/ui** | Componentes acessíveis, consistentes, sem cadeado de licença, permite construir uma identidade visual própria em cima (o "selo de autenticidade" que você mencionou) sem reinventar componente do zero |
| Dados/estado servidor | **TanStack Query** | Cache, revalidação e estados de loading/erro padronizados nas telas |
| Validação de formulário | **Zod + React Hook Form** | Mesmo schema Zod do backend, reaproveitado |

## 5. PDV (terminal de venda)

O PDV tem um requisito que o painel administrativo não tem: **precisa continuar vendendo com internet instável.**

- **Fase 1 (MVP):** PWA (Progressive Web App) a partir da mesma base Next.js, com service worker cacheando os dados essenciais (produtos, preços) e fila local de vendas para sincronizar quando a conexão voltar. Rápido de entregar, roda em qualquer computador/tablet sem instalar nada.
- **Fase 3 (offline-first sério):** avaliar migrar o cliente de PDV para **Tauri** (app desktop leve, baseado em Rust+webview, muito mais leve que Electron) com banco local (SQLite) e sincronização bidirecional — nível de robustez que operação de loja física realmente exige quando a internet cai no meio do expediente.

## 6. Autenticação e autorização

- **JWT de curta duração + refresh token**, emitidos pelo próprio backend NestJS (Passport.js por baixo).
- **RBAC com CASL** para permissões granulares por módulo/ação (ex.: operador de caixa não vê financeiro).
- **Isolamento multi-tenant reforçado em dois níveis:** guard de aplicação (todo request carrega tenant resolvido) + Row-Level Security no PostgreSQL (defesa em profundidade — mesmo um bug na aplicação não vaza dado entre tenants).
- **2FA opcional** desde a Fase 0 para contas administrativas (dado o risco de fraude em sistemas financeiros/PDV).

**Alternativa considerada — Keycloak ou Clerk/WorkOS (auth como serviço):** dão SSO enterprise pronto, mas custo por usuário ativo penaliza exatamente o cenário de "muitos lojistas pagando pouco cada". Fica como opção para SSO enterprise na Fase 4, não como base do sistema.

## 7. Testes

| Tipo | Ferramenta | Cobre |
|---|---|---|
| Unitário | Vitest | Regras de negócio isoladas (cálculo de imposto, totais de venda, etc.) |
| Integração | Vitest + Supertest | Endpoints da API contra banco de teste real (não mockado) |
| E2E | Playwright | Fluxos críticos: abrir caixa → vender → fechar caixa; emissão de NFC-e; conciliação |
| Contrato | Schemas Zod compartilhados | Garante que front e back nunca divergem do contrato de API |

Módulos financeiro e fiscal têm cobertura de teste obrigatória mais alta que o resto — é onde um bug custa dinheiro real do cliente.

## 8. CI/CD e ambientes

- **GitHub Actions:** lint, testes, build e verificação de tipos em todo PR; deploy automático em merge para `main` (staging) e por tag para produção.
- **Docker** para empacotar o backend de forma idêntica em todos os ambientes.
- Três ambientes: `dev` (local), `staging` (homologação), `production`.

## 9. Infraestrutura e hosting

**Fase inicial (baixo custo, sem time de infra dedicado):**
- **Railway** ou **Fly.io** para hospedar backend + banco Postgres gerenciado — deploy simples, custo previsível e baixo em escala pequena, sem exigir conhecimento de Kubernetes/Terraform.
- Frontend na **Vercel** (integração nativa com Next.js, free tier generoso).

**Fase de crescimento (quando o volume justificar):**
- Migração para **AWS ou GCP** com Terraform (infraestrutura como código), quando o custo do gerenciado ultrapassar o custo de operar infraestrutura própria — normalmente isso só compensa depois de dezenas de milhares de reais/mês em hosting, então não é prioridade agora.

## 10. Observabilidade

- **Sentry** (free tier) para erros em produção, front e back.
- **OpenTelemetry** instrumentando o backend desde o início (mesmo sem um destino caro no começo) — evita ter que reinstrumentar depois.
- **Better Stack ou Axiom** (free tier) para logs centralizados quando sair do log local.

## 11. Segurança

- Checklist OWASP ASVS nível apropriado para aplicação financeira (não é opcional dado que o sistema mexe com dinheiro do lojista).
- Rate limiting e proteção contra brute-force no login (`@nestjs/throttler`).
- Segredos fora do código (variáveis de ambiente + Doppler ou equivalente gratuito na fase inicial).
- Dependabot/Snyk (free tier) para scanning de dependências vulneráveis.
- Log de auditoria em toda ação financeira/fiscal (quem fez o quê, quando) — requisito de confiança para um sistema de PDV, e provavelmente exigência legal dependendo do módulo.
- Adequação à **LGPD** desde o desenho de dados de cliente/CRM (Fase 3), não como retrofit.

## 12. Resumo — o que precisa da sua confirmação

1. Monorepo + monólito modular (não microsserviços) para começar — ✅ recomendado
2. NestJS + TypeScript no backend — ✅ recomendado
3. Drizzle ORM (em vez de Prisma) — ponto onde cabe discordância se preferir mais DX e menos SQL manual
4. Next.js + Tailwind + shadcn/ui no front — ✅ recomendado
5. PWA para o PDV na Fase 1, Tauri só na Fase 3 — ✅ recomendado (evita over-engineering cedo)
6. Auth própria (JWT+RBAC) em vez de Keycloak/Clerk — ✅ recomendado por custo
7. Railway/Fly.io + Vercel no início, migração para AWS/GCP só quando o custo justificar — ✅ recomendado

Se você aprovar como está, o próximo passo é eu montar o esqueleto do monorepo (Fase 0 do roadmap). Se quiser ajustar algum ponto específico (ex.: trocar Drizzle por Prisma), me diga qual e eu ajusto só essa parte.

---
Ver também: [03-build-vs-buy-pagamentos-fiscal.md](03-build-vs-buy-pagamentos-fiscal.md) e [../PRECOS-E-CUSTOS.md](../PRECOS-E-CUSTOS.md).
