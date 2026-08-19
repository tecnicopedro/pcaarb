# PCAARB — Payments and Fiscal: Build vs. Buy

*English version of [the original Portuguese analysis](03-build-vs-buy-pagamentos-fiscal.md).*

## 1. Why this decision matters early

Payments and fiscal document issuance are the two points where a Brazilian POS system can stall the entire business if handled poorly — and they're also the two points where "build it ourselves" looks attractive (full control) but is, in practice, the wrong call for this project's stage. The recommendation is to **buy/integrate** both, explained below.

## 2. Payments (card, Pix, boleto)

### Recommendation: integrate an existing gateway, don't process payments directly

**Why:**
- **PCI-DSS compliance:** to handle card data directly, PCAARB would need PCI-DSS certification — an expensive, recurring process (annual audit) that adds no differentiation to the product. Already-certified gateways absorb that cost and risk.
- **Speed:** a gateway delivers Pix, card (credit/debit), and boleto ready to go, with an SDK and webhooks — weeks of integration versus months/years of accrediting directly with card networks and banks.
- **Store owner trust:** retail store owners already recognize brands like Mercado Pago/Pagar.me; "we process your money on our own untested infrastructure" is a sales obstacle, not a differentiator.

**Options evaluated:**

| Gateway | Strengths | Note |
|---|---|---|
| **Pagar.me** (Stone) | Native split payments (useful if PCAARB charges a commission on sales in the future), good documentation, focused on marketplaces/SaaS | Initial favorite |
| **Mercado Pago** | Very high brand recognition with end consumers, Pix and its own card-reader hardware available | Strong alternative, especially if we want integrated physical card readers early |
| Stripe | Excellent DX, but more limited Pix/boleto support in Brazil | Not recommended as primary for the Brazilian use case |

**How to integrate without becoming hostage to a vendor:** build an internal interface (`PaymentProvider`) in the backend, with one adapter per gateway. The rest of the system talks to the interface, not directly to the gateway — switching vendors or adding a second one (for redundancy) becomes the work of one new adapter, not a rewrite.

## 3. Fiscal (NFC-e / NF-e / SAT)

### Recommendation: use an intermediary fiscal API, don't integrate directly with each state's SEFAZ

**Why:**
- **Fiscal rules vary by state and change frequently** — keeping that current would require a dedicated fiscal-compliance team on its own, which isn't PCAARB's focus.
- **Digital certificates, contingency, and certification** are complex on their own (each state has its own contingency particulars for when SEFAZ is down) — a specialized API has already solved this for thousands of customers.
- **A fiscal error is an expensive error:** a rejected or poorly issued receipt creates a real (fiscal/legal) problem for PCAARB's customer — not an area to "learn by doing."

**Options evaluated:**

| Provider | Strengths |
|---|---|
| **Focus NFe** | Competitive pricing, simple API, good reputation among Brazilian retail SaaS products |
| **PlugNotas (Tecnospeed)** | Broad fiscal-document coverage, an established company in the market |
| **eNotas** | Good documentation, also SaaS-focused |

Any of the three is a defensible choice — the final decision can wait until close to Phase 1, comparing price per issued receipt and support quality at that time.

**Same abstraction approach:** an internal `FiscalProvider` interface, one adapter per vendor — if a provider raises prices or support quality drops, the adapter is swapped without touching the rest of the system.

## 4. What we ALWAYS build in-house

This is the actual product, and where engineering effort is invested:

- Sales logic, POS, cash register, inventory
- Each module's business rules (finance, purchasing, CRM...)
- Multi-tenancy, permissions, billing for our own customers
- Reports and BI
- The entire user experience

Payments and fiscal come in as **pieces connected via an adapter**, never as the center of development.

## 5. When to revisit this

It only makes sense to reconsider building payments/fiscal in-house if, at very large scale (thousands of stores, high transaction volume), partners' per-transaction cost clearly exceeds the cost of running it internally **and** there's already capital and a dedicated team to take on the regulatory compliance that requires. In practice, most established retail SaaS products (including ones that compete with TOTVS) never migrate to this — the partner gateway/fiscal provider charges a small fraction of the margin and solves a large regulatory problem. This is not on the current roadmap.

---
See also: [02-tech-stack-proposal.md](02-tech-stack-proposal.md) and [../PRECOS-E-CUSTOS.md](../PRECOS-E-CUSTOS.md) (where these partners' fees factor into the cost structure).
