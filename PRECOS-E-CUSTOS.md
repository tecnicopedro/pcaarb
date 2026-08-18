# PCAARB — Catálogo de Preços e Custos

> **Status: preço da assinatura FECHADO e implementado** (`packages/shared/src/schemas/billing.ts`, `SUBSCRIPTION_PLAN_CATALOG`) — não é mais rascunho. Os custos variáveis (fiscal, gateway) continuam estimativa de mercado até validar com os fornecedores de verdade; o preço em si será ajustado se as primeiras conversas reais com lojista mostrarem que está errado, mas é o número em produção agora. Este documento deve ser revisado a cada fase do roadmap.

## 1. Estrutura de custos

### 1.1 Custos fixos (independem do número de clientes, na faixa inicial)

| Item | Estimativa mensal | Observação |
|---|---|---|
| Hosting backend + Postgres (Railway/Fly.io) | R$ 100 – 300 | Faixa inicial, poucos tenants |
| Frontend (Vercel) | R$ 0 | Free tier cobre a fase inicial |
| Redis gerenciado | R$ 0 – 50 | Muitos provedores têm free tier pequeno |
| Domínio | ~R$ 5 (anualizado) | .com.br ou .com |
| E-mail transacional (envio de nota, cobrança) | R$ 0 – 50 | Free tier costuma cobrir até alguns milhares de e-mails/mês |
| Monitoramento (Sentry) | R$ 0 | Free tier |
| CI/CD (GitHub Actions) | R$ 0 | Free tier suficiente para repositório privado pequeno |
| **Total fixo estimado (fase inicial)** | **R$ 150 – 400/mês** | Antes de qualquer cliente pagante |

### 1.2 Custos variáveis (por cliente/loja/transação)

| Item | Estimativa | Observação |
|---|---|---|
| Emissão de NFC-e (Focus NFe / eNotas / PlugNotas) | R$ 0,08 – 0,35 por nota emitida | Varia por volume — planos com franquia mensal costumam sair mais baratos que pay-per-use acima de certo volume |
| Taxa de gateway de pagamento (Pagar.me/Mercado Pago) | ~1,99% a 4,99% + R$ 0,39 por transação, variando por forma de pagamento e prazo de recebimento | Essa taxa normalmente é **repassada ao lojista** (é o custo dele de aceitar cartão/Pix), não custo direto do PCAARB — mas se o PCAARB decidir fazer split/comissão, entra na conta |
| Armazenamento adicional (fotos de produto, anexos fiscais) | Marginal | Baixo impacto até escala relevante |

### 1.3 Custos que crescem por degrau (faixas de escala)

| Faixa de tenants ativos | Hosting estimado/mês | Observação |
|---|---|---|
| 1 – 20 lojas | R$ 150 – 300 | Cabe em plano de entrada do Railway/Fly.io |
| 20 – 100 lojas | R$ 400 – 900 | Ainda em managed hosting, sem precisar migrar arquitetura |
| 100 – 500 lojas | R$ 1.200 – 3.000 | Ponto onde vale reavaliar reservas/planos anuais e considerar mover peças críticas (ex.: banco) para infraestrutura dedicada |
| 500+ lojas | Avaliar migração para AWS/GCP com Terraform | Ponto de virada mencionado em docs/02 |

## 2. Modelo de precificação (assinatura mensal por loja) — implementado

| Plano | Público | O que inclui | Preço |
|---|---|---|---|
| **Starter** | Loja única, 1 caixa | Cadastros, PDV, estoque básico, financeiro básico, 1 usuário admin + 1 operador | **R$ 119/mês** |
| **Profissional** | Loja única ou pequena rede, múltiplos caixas | Tudo do Starter + compras, inventário, centro de custo/DRE, relatórios/BI, **fidelidade**, **comissão de vendedores**, usuários ilimitados, permissões granulares | **R$ 249/mês** |
| **Multi-loja** | Redes/franquias | Tudo do Profissional + visão consolidada multi-loja (módulo ainda não construído — ver Fase 3 do roadmap) | **R$ 349/mês** base + **R$ 99**/loja adicional |
| **Enterprise** | Operações grandes, precisa de API/white-label | Tudo + API pública, SSO, suporte dedicado, SLA | Sob consulta (não assinável via checkout self-service) |

Trial de 14 dias em qualquer plano, sem cartão de crédito. Cancelamento
imediato, sem multa, a qualquer momento (`POST /billing/cancel`). Fatura
recorrente cobrada via gateway configurado (`PAYMENT_PROVIDER`, hoje o
mesmo mock de sandbox do PDV — troca pro Pagar.me real quando a conta do
lojista existir, ver docs/03).

**Add-ons cobrados à parte:**
- Notas fiscais emitidas: repassar o custo do provedor fiscal com uma margem pequena (ex.: custo R$ 0,15 → cobrar R$ 0,25 – 0,35 por nota, ou incluir uma franquia mensal no plano e cobrar excedente).
- App mobile de PDV offline (Fase 3): possível add-on por terminal.
- Módulos avançados de BI/IA (Fase 4): add-on de plano superior.

## 3. Margem estimada (ilustrativo)

Considerando plano **Profissional a R$ 249/mês**, com custo variável direto (infra rateada + fiscal, sem contar taxa de gateway que é repassada ao lojista) estimado em ~R$ 15–25/loja/mês na faixa de 20-100 lojas:

- Margem bruta por loja: ~90%
- Esse tipo de margem é típico de SaaS bem operado e dá espaço para investir em aquisição de cliente (marketing/vendas) sem inviabilizar o negócio.

## 4. Referência de mercado (concorrentes, faixas públicas aproximadas)

| Concorrente | Faixa de preço conhecida | Posicionamento |
|---|---|---|
| Bling | ~R$ 60 – 400+/mês | ERP leve, forte em integração com e-commerce |
| Omie | ~R$ 130 – 500+/mês | ERP + financeiro, mira pequenas empresas em geral (não só varejo) |
| Varejo Fácil | Sob consulta, historicamente mais caro | Foco em varejo de porte médio |
| Linx/TOTVS Varejo | Sob consulta, tíquete alto, implantação com consultoria | Enterprise, ciclo de venda longo |

O PCAARB mira o espaço entre Bling/Omie (mais barato, mas menos robusto em PDV físico) e Linx/TOTVS (robusto, mas caro e pesado de implantar) — esse é o "vácuo" competitivo real.

## 5. Break-even ilustrativo

Com custo fixo mensal estimado em R$ 150 – 400 (fase inicial, seção 1.1) e ticket médio do plano Starter em ~R$ 109:

- **~2 a 4 clientes pagantes já cobrem o custo fixo de infraestrutura da fase inicial.**

Isso não inclui seu tempo/custo de desenvolvimento (que já está sendo investido como trabalho, não caixa) nem custo de aquisição de cliente — mas mostra que a barreira de custo operacional para começar a validar é baixa, o que é uma boa notícia dado o orçamento inicial restrito.

## 6. Próximos passos para validar este documento

1. Cotar preço real por nota fiscal com Focus NFe/eNotas/PlugNotas (varia por plano de volume).
2. Confirmar taxas atualizadas de Pagar.me e Mercado Pago (mudam com frequência).
3. Entrevistar 5-10 lojistas do público-alvo sobre quanto pagam hoje (planilha, concorrente, ou nada) para calibrar o plano Starter.
4. Revisar este documento ao final da Fase 1 do roadmap, com custo real observado em vez de estimativa.

---
Ver também: [docs/03-build-vs-buy-pagamentos-fiscal.md](docs/03-build-vs-buy-pagamentos-fiscal.md) para o racional por trás dos custos de fiscal/pagamento.
