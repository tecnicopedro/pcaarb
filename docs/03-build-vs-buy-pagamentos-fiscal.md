# PCAARB — Pagamentos e Fiscal: Construir vs. Integrar

## 1. Por que essa decisão importa cedo

Pagamento e emissão fiscal são os dois pontos onde um sistema de PDV brasileiro pode travar o negócio inteiro se for mal resolvido — e são também os dois pontos onde "construir do zero" parece atraente (dá controle total) mas é, na prática, a decisão errada para o estágio do projeto. Recomendo **comprar/integrar** os dois, e explico o porquê e o como abaixo.

## 2. Pagamentos (cartão, Pix, boleto)

### Recomendação: integrar um gateway existente, não processar pagamento diretamente

**Por quê:**
- **Compliance PCI-DSS:** para tocar dado de cartão diretamente, o PCAARB precisaria de certificação PCI-DSS — processo caro, recorrente (auditoria anual) e que não agrega nenhuma diferenciação ao produto. Gateways já certificados absorvem esse custo e risco.
- **Velocidade:** um gateway entrega Pix, cartão (crédito/débito) e boleto prontos, com SDK e webhooks — semanas de integração contra meses/anos de credenciamento próprio junto a bandeiras e bancos.
- **Confiança do lojista:** lojista de varejo já reconhece marcas como Mercado Pago/Pagar.me; "processamos seu dinheiro com nossa própria infraestrutura não testada" é um obstáculo de venda, não um diferencial.

**Opções avaliadas:**

| Gateway | Pontos fortes | Observação |
|---|---|---|
| **Pagar.me** (Stone) | Split de pagamento nativo (útil se PCAARB cobrar comissão sobre venda no futuro), boa documentação, foco em marketplaces/SaaS | Favorito inicial |
| **Mercado Pago** | Reconhecimento de marca altíssimo com o consumidor final, Pix e maquininha própria disponíveis | Forte alternativa, especialmente se quisermos maquininha física integrada cedo |
| Stripe | Excelente DX, mas suporte a Pix/boleto mais limitado no Brasil | Não recomendado como principal para o caso de uso brasileiro |

**Como integrar sem virar refém de um fornecedor:** construir uma interface interna (`PaymentProvider`) no backend, com um adapter por gateway. O resto do sistema fala com a interface, não com o gateway diretamente — troca de fornecedor ou adição de um segundo (para redundância) vira trabalho de um adapter novo, não uma reescrita.

## 3. Fiscal (NFC-e / NF-e / SAT)

### Recomendação: usar uma API fiscal intermediária, não integrar direto com a SEFAZ de cada estado

**Por quê:**
- **Regra fiscal varia por estado e muda com frequência** — manter isso atualizado exigiria uma equipe dedicada só de compliance fiscal, o que não é o foco do PCAARB.
- **Certificado digital, contingência e homologação** são complexos por si só (cada estado tem particularidades de contingência quando a SEFAZ está fora do ar) — uma API especializada já resolveu isso para milhares de clientes.
- **Erro fiscal é erro caro:** nota rejeitada ou mal emitida gera problema real (fiscal/jurídico) para o cliente do PCAARB — não é área para "aprender fazendo".

**Opções avaliadas:**

| Provedor | Pontos fortes |
|---|---|
| **Focus NFe** | Preço competitivo, API simples, boa reputação entre SaaS de varejo brasileiros |
| **PlugNotas (Tecnospeed)** | Cobertura ampla de documentos fiscais, empresa consolidada no mercado |
| **eNotas** | Boa documentação, foco também em SaaS |

Qualquer uma das três é uma escolha defensável — a decisão final pode esperar até estarmos perto da Fase 1, comparando preço por nota emitida e qualidade de suporte no momento.

**Mesma lógica de abstração:** interface interna `FiscalProvider`, adapter por fornecedor — se um provedor subir preço ou piorar suporte, trocamos o adapter sem tocar no resto do sistema.

## 4. O que SEMPRE construímos internamente

Isso é o produto de fato, e é onde investimos o esforço de engenharia:

- Lógica de venda, PDV, caixa, estoque
- Regras de negócio de cada módulo (financeiro, compras, CRM...)
- Multi-tenancy, permissões, billing dos nossos próprios clientes
- Relatórios e BI
- Toda a experiência de usuário

Pagamento e fiscal entram como **peças conectadas via adapter**, nunca como o centro do desenvolvimento.

## 5. Quando reavaliar

Only faz sentido reconsiderar "construir" pagamento/fiscal próprio se, em escala muito grande (milhares de lojas, alto volume de transação), o custo por transação dos parceiros superar claramente o custo de operar isso internamente **e** já existir capital e equipe dedicada para assumir o compliance regulatório que isso exige. Na prática, a maioria dos SaaS de varejo consolidados (incluindo os que competem com a TOTVS) nunca migra para isso — o gateway/fiscal parceiro cobra uma fração pequena da margem e resolve um problema regulatório grande. Não é um item do roadmap atual.

---
Ver também: [02-stack-tecnologico.md](02-stack-tecnologico.md) e [../PRECOS-E-CUSTOS.md](../PRECOS-E-CUSTOS.md) (onde as taxas desses parceiros entram na estrutura de custo).
