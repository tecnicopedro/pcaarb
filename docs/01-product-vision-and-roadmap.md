# PCAARB — Product Vision and Roadmap

*English version of [the original Portuguese planning document](01-visao-geral-e-roadmap.md), written before Phase 0 started.*

> **Note (2026-08-18):** this document describes the vision and the phased roadmap — it's still valid as a plan. For what has actually been implemented and tested phase by phase, see the "Current status" section in [README.md](../README.md) (or [README.pt-BR.md](../README.pt-BR.md) for the full detailed log).

## 1. What PCAARB is

A business management SaaS (ERP) with point-of-sale as the entry point. The thesis is simple: small/medium Brazilian retailers today choose between two bad extremes — heavy, expensive legacy systems in the TOTVS/Linx/Consinco mold (powerful, but slow, ugly, expensive to implement) or tools too lightweight to grow with the business (spreadsheets, POS apps with no real back office behind them).

PCAARB sits in the middle: it's born as a POS plus essential back office, with the quality and performance of a "category A" product from the very first module, and grows in layers until it covers the same ground TOTVS covers — without inheriting TOTVS's implementation complexity and price tag.

## 2. Target audience

- **Initial phase:** small retail (single store, 1–3 checkout lanes) — grocery stores, clothing shops, pet shops, small pharmacies, convenience stores.
- **Expansion phase:** small and mid-size chains (multi-store), franchises.
- **Advanced phase:** operations that would today use mid-size TOTVS/Linx deployments — multiple branches, serious need for BI and accounting integrations.

We won't target large retail/heavy industry early — that's TOTVS/SAP territory, with long sales cycles and requirements that don't fit the project's initial budget.

## 3. Intended differentiators vs. the reference point (TOTVS)

1. **Self-service onboarding** — the store owner creates an account and starts selling the same day, no consulting-led implementation.
2. **Modern product UX** — fast interface, few clicks to a sale, a POS designed for a cashier, not a systems analyst.
3. **Transparent, subscription-based pricing** — no five-figure implementation contract.
4. **API-first from day one** — any module can eventually be consumed by third parties (a differentiator TOTVS only delivers in its enterprise products).
5. **Native multi-tenant** — architecture designed for SaaS from the foundation up, not an on-premise product retrofitted for it.

## 4. Architecture principles

- **Modular:** each module (Sales, Inventory, Finance, Fiscal, CRM...) is an internally isolated domain, even while running as a modular monolith at first — makes it easier to split into services later, if/when that makes sense.
- **Multi-tenant from day 1:** every piece of data carries a `tenant_id`; we never "adapt it later" — it's cheaper to do it right now than to migrate later with customers already in production.
- **API-first:** the frontend and future partners consume the same public API; no business logic leaking into the frontend.
- **POS is the module most sensitive to performance and reliability** — it needs to keep selling even with unstable internet (offline-first, or at least fault-tolerant to network failures).
- **Fiscal and payments are regulated and commoditized** — they are not where we build competitive advantage (see [docs/03](03-build-vs-buy-payments-fiscal.md)).

## 5. Phased roadmap

### Phase 0 — Foundation (infrastructure, not a customer-visible feature)
- Monorepo, CI/CD, environments (dev/staging/prod)
- Authentication, multi-tenancy, basic RBAC
- Internal billing structure (subscription, trial, block on non-payment)
- Minimal observability (errors, logs)

**Exit criterion:** we can create a tenant, log in, and it correctly expires/blocks at the end of the trial.

### Phase 1 — Commercial MVP (what we sell first)
- Catalogs: products, customers, suppliers, categories
- POS: counter sale, opening/closing the cash register, cash drops/reinforcements, multiple payment methods
- Basic inventory: stock in, stock out, adjustment, per-product balance
- Basic finance: accounts payable/receivable, simple cash flow
- Fiscal: NFC-e (Brazilian consumer fiscal receipt) issuance via a partner (see docs/03) — **mandatory to sell in Brazilian retail**, not optional
- Integrated payments: card and Pix via a partner gateway

**Exit criterion:** a real store can run its day-to-day (open the register, sell, issue a fiscal receipt, close the register) without depending on a parallel spreadsheet.

### Phase 2 — Consolidation
- Purchasing (supplier order, receiving, automatic stock entry)
- Advanced inventory: multiple warehouses, store-to-store transfers, physical counts
- Advanced finance: bank reconciliation, simplified P&L, cost centers
- Basic reports/BI: ABC curve, average ticket, product/seller rankings
- User management and granular per-module permissions

**Exit criterion:** the store owner no longer needs a spreadsheet or a parallel system for any day-to-day routine.

### Phase 3 — Expansion
- CRM and loyalty (points, cashback, per-customer purchase history)
- Multi-store / franchises (consolidated view + independent per-unit operation)
- Offline-first mobile POS app (sales keep working without internet, sync later)
- E-commerce/marketplace integration (unified stock and orders)
- Basic HR (time tracking, sales commission)

**Exit criterion:** a chain of 5–10 stores runs entirely on the platform.

### Phase 4 — Advanced / Enterprise
- Advanced BI (demand forecasting, AI-suggested pricing)
- Accounting integrations (Brazilian fiscal/accounting bookkeeping exports, accountant-ready exports)
- Documented public API + integrations/partner marketplace
- White-label for resale by partners/accountants
- SSO/enterprise auth for larger customers

**Exit criterion:** we can serve the customer profile that today would only consider a mid-size TOTVS/Linx deployment.

## 6. Known risks and mitigation

| Risk | Mitigation |
|---|---|
| Brazilian fiscal complexity (varies by state/tax regime) | Outsource via a specialized API (docs/03), don't build SEFAZ integration in-house |
| A poorly designed multi-tenant model forces expensive rework later | Solve data isolation from Phase 0, never "later" |
| POS goes down mid-sale = the customer loses trust immediately | Prioritize POS resilience/offline capability over pretty features |
| Limited initial budget | A stack with strong free tiers/low fixed cost until there's revenue (docs/02 and PRECOS-E-CUSTOS.md) |
| "TOTVS-style" scope is huge | Phased roadmap with exit criteria — don't try to compete on everything from day 1 |

---
Next document: [02-tech-stack-proposal.md](02-tech-stack-proposal.md) — the technical proposal that implements this vision.
