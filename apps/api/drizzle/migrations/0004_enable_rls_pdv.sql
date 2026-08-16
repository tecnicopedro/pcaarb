-- Mesmo padrão de isolamento das tabelas de Cadastros (migration 0002):
-- toda tabela do PDV carrega tenant_id (inclusive sale_items/sale_payments,
-- denormalizado de propósito) e é sempre acessada com o tenant já resolvido
-- do JWT via runWithTenant().
ALTER TABLE "cash_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cash_movements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sales" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sale_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sale_payments" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_cash_sessions" ON "cash_sessions"
	USING ("tenant_id" = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY "tenant_isolation_cash_movements" ON "cash_movements"
	USING ("tenant_id" = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY "tenant_isolation_sales" ON "sales"
	USING ("tenant_id" = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY "tenant_isolation_sale_items" ON "sale_items"
	USING ("tenant_id" = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY "tenant_isolation_sale_payments" ON "sale_payments"
	USING ("tenant_id" = current_setting('app.tenant_id', true)::uuid);
