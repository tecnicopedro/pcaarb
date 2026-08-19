# PCAARB — Visão Geral e Roadmap de Produto

> **Nota (2026-08-18):** este documento descreve a visão e o roadmap por fases — continua válido como plano. Para o que já foi implementado e testado fase a fase, ver a seção "Status atual" em [README.pt-BR.md](../README.pt-BR.md) (o [README.md](../README.md) em inglês tem um resumo mais enxuto).

## 1. O que é o PCAARB

Um SaaS de gestão empresarial (ERP) com PDV como porta de entrada. A tese é simples: o pequeno/médio varejista brasileiro hoje escolhe entre dois extremos ruins — sistemas legados pesados e caros no estilo TOTVS/Linx/Consinco (poderosos, mas lentos, feios, caros de implantar) ou ferramentas leves demais que não crescem com o negócio (planilha, apps de PDV sem retaguarda de verdade).

PCAARB entra no meio: nasce como PDV + retaguarda essencial, com qualidade e desempenho de produto "categoria A" desde o primeiro módulo, e evolui em camadas até cobrir o mesmo terreno que a TOTVS cobre — sem herdar a complexidade de implantação e o preço dela.

## 2. Público-alvo

- **Fase inicial:** varejo de pequeno porte (loja única, 1-3 caixas) — mercearias, lojas de roupa, pet shops, farmácias de pequeno porte, conveniências.
- **Fase de expansão:** redes pequenas e médias (multi-loja), franquias.
- **Fase avançada:** operações que hoje usariam TOTVS/Linx de porte médio — múltiplas filiais, necessidade de BI e integrações contábeis sérias.

Não vamos atacar grande varejo/indústria pesada cedo — isso é terreno de TOTVS/SAP com ciclos de venda longos e exigências que não cabem no orçamento inicial do projeto.

## 3. Diferenciais pretendidos frente à referência (TOTVS)

1. **Onboarding self-service** — o lojista cria a conta e começa a vender no mesmo dia, sem implantação de consultoria.
2. **UX de produto moderno** — interface rápida, poucos cliques até a venda, PDV pensado para operador de caixa, não para analista de sistema.
3. **Preço transparente e por assinatura** — sem contrato de implantação de 5 dígitos.
4. **API-first desde o início** — qualquer módulo pode futuramente ser consumido por terceiros (diferencial que a TOTVS só entrega em produtos enterprise).
5. **Multi-tenant nativo** — arquitetura pensada para SaaS desde a fundação, não um on-premise adaptado.

## 4. Princípios de arquitetura

- **Modular:** cada módulo (Vendas, Estoque, Financeiro, Fiscal, CRM...) é um domínio isolado internamente, mesmo rodando como monólito modular no início — facilita separar em serviços depois, se/quando fizer sentido.
- **Multi-tenant desde o dia 1:** todo dado carrega `tenant_id`; nunca vamos "adaptar depois" — é mais barato fazer certo agora do que migrar depois com clientes em produção.
- **API-first:** front-end e futuros parceiros consomem a mesma API pública; nada de lógica de negócio vazando para o front.
- **PDV é o módulo mais sensível a desempenho e confiabilidade** — precisa continuar vendendo mesmo com internet instável (offline-first ou ao menos tolerante a falhas de rede).
- **Fiscal e pagamento são regulados e commoditizados** — não são onde construímos vantagem competitiva (ver [docs/03](03-build-vs-buy-pagamentos-fiscal.md)).

## 5. Roadmap por fases

### Fase 0 — Fundação (infraestrutura, não é feature visível ao cliente)
- Monorepo, CI/CD, ambientes (dev/staging/prod)
- Autenticação, multi-tenant, RBAC básico
- Estrutura de billing interno (assinatura, trial, bloqueio por inadimplência)
- Observabilidade mínima (erros, logs)

**Critério de saída:** conseguimos criar um tenant, logar, e ele expira/bloqueia corretamente ao fim do trial.

### Fase 1 — MVP comercial (o que vendemos primeiro)
- Cadastros: produtos, clientes, fornecedores, categorias
- PDV: venda balcão, abertura/fechamento de caixa, sangria/suprimento, múltiplas formas de pagamento
- Estoque básico: entrada, saída, ajuste, saldo por produto
- Financeiro básico: contas a pagar/receber, fluxo de caixa simples
- Fiscal: emissão de NFC-e via parceiro (ver docs/03) — **obrigatório para vender no varejo brasileiro**, não é opcional
- Pagamento integrado: cartão e Pix via gateway parceiro

**Critério de saída:** uma loja real consegue operar o dia a dia (abrir caixa, vender, emitir cupom fiscal, fechar caixa) sem depender de planilha paralela.

### Fase 2 — Consolidação
- Compras (pedido a fornecedor, recebimento, entrada automática em estoque)
- Estoque avançado: múltiplos depósitos, transferência entre lojas, inventário
- Financeiro avançado: conciliação bancária, DRE simplificado, centro de custo
- Relatórios/BI básico: curva ABC, ticket médio, ranking de produtos/vendedores
- Gestão de usuários e permissões granulares por módulo

**Critério de saída:** o lojista para de precisar de planilha ou sistema paralelo para qualquer rotina do dia a dia.

### Fase 3 — Expansão
- CRM e fidelidade (pontos, cashback, histórico de compra por cliente)
- Multi-loja / franquias (visão consolidada + operação independente por unidade)
- App mobile de PDV offline-first (venda continua mesmo sem internet, sincroniza depois)
- Integração com e-commerce/marketplaces (estoque e pedidos unificados)
- RH básico (ponto, comissão de vendedores)

**Critério de saída:** uma rede de 5-10 lojas opera integralmente na plataforma.

### Fase 4 — Avançado / Enterprise
- BI avançado (previsão de demanda, precificação sugerida por IA)
- Integrações contábeis (SPED fiscal/contábil, exportação para contador)
- API pública documentada + marketplace de integrações/parceiros
- White-label para revenda por parceiros/contadores
- SSO/enterprise auth para clientes maiores

**Critério de saída:** conseguimos atender o perfil de cliente que hoje só cogitaria TOTVS/Linx de porte médio.

## 6. Riscos conhecidos e mitigação

| Risco | Mitigação |
|---|---|
| Complexidade fiscal brasileira (varia por estado/regime) | Terceirizar via API especializada (docs/03), não construir SEFAZ in-house |
| Multi-tenant mal desenhado força retrabalho caro depois | Resolver isolamento de dados desde a Fase 0, nunca "depois" |
| PDV cai durante venda = cliente perde confiança imediatamente | Priorizar resiliência/offline no PDV antes de features bonitas |
| Orçamento inicial limitado | Stack com forte free-tier/baixo custo fixo até haver receita (docs/02 e PRECOS-E-CUSTOS.md) |
| Escopo "estilo TOTVS" é gigante | Roadmap em fases com critério de saída — não tentar competir em tudo desde o dia 1 |

---
Próximo documento: [02-stack-tecnologico.md](02-stack-tecnologico.md) — proposta técnica que implementa essa visão.
