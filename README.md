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

**Fase 0 (fundação) concluída.** Monorepo, auth multi-tenant (registro/login/refresh com trial), RBAC via CASL, RLS no Postgres, CI — tudo validado contra banco real.

**Fase 1 (MVP comercial) em andamento — Cadastros, PDV e Estoque básico concluídos:**

- **Cadastros:** categorias, produtos, clientes e fornecedores — CRUD completo, multi-tenant de verdade via RLS, RBAC via CASL (`operador_caixa` só lê; `admin`/`owner` gerenciam; `financeiro` só lê). Preço sempre em centavos (inteiro), nunca float. Produto não tem exclusão definitiva — só `active: false` — porque venda referencia produto e apagar quebraria histórico.
- **PDV:** abertura/fechamento de caixa, sangria/suprimento, venda de balcão com múltiplos itens e pagamento dividido entre formas (dinheiro/cartão/Pix). Venda exige caixa aberto do próprio operador; total da venda precisa bater exatamente com a soma dos pagamentos informados; item de venda guarda snapshot do nome/preço do produto (preço pode mudar depois, histórico não). Quantidade é sempre inteira — venda fracionada/por peso fica para quando o público-alvo (mercearia, loja, pet shop, farmácia, conveniência) exigir.
- **Estoque básico:** entrada, saída e ajuste de saldo por produto, com ledger auditável (`stock_movements`) e saldo denormalizado no próprio produto. Venda no PDV desconta o estoque automaticamente dentro da mesma transação (ou os dois acontecem, ou nenhum) e bloqueia a venda se não houver saldo suficiente. Produtos podem opcionalmente sair do controle de estoque (`trackStock: false`) para itens sob encomenda ou serviços. Movimentação manual é restrita a `admin`/`owner` (`financeiro` só lê; `operador_caixa` não movimenta diretamente, só via venda).
- Frontend: `/painel/produtos` (cadastro + saldo de estoque + movimentação) e `/painel/pdv` (abrir caixa, montar carrinho, pagamento dividido, sangria/suprimento, fechar caixa)
- 20 testes e2e contra Postgres real (Cadastros + PDV + Estoque) cobrindo CRUD, isolamento entre tenants (RLS), RBAC, regras de negócio do PDV e o desconto atômico de estoque nas vendas

Próximos itens da Fase 1: financeiro básico (contas a pagar/receber, fluxo de caixa simples), integração fiscal (NFC-e) e de pagamento real (hoje o PDV registra a forma de pagamento mas não processa cartão/Pix via gateway — ver [docs/03](docs/03-build-vs-buy-pagamentos-fiscal.md)).

Pendências conhecidas: bloqueio automático por fim de trial (guard já existe, falta o job agendado); gestão de usuários (convidar/promover usuário) fica para a Fase 2 conforme roadmap — por ora só o owner criado no registro existe.

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
