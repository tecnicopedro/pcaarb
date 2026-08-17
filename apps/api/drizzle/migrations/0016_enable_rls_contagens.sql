-- Mesmo padrão de isolamento das migrations 0002, 0004, 0006, 0008, 0010 e 0014.
-- FORCE (não só ENABLE) pelo mesmo motivo de sempre: migration 0011 já rodou
-- antes destas duas tabelas existirem.
ALTER TABLE "stock_counts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "stock_counts" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_stock_counts" ON "stock_counts"
	USING ("tenant_id" = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE "stock_count_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "stock_count_items" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_stock_count_items" ON "stock_count_items"
	USING ("tenant_id" = current_setting('app.tenant_id', true)::uuid);
