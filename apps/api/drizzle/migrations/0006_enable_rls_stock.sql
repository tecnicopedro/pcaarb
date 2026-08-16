-- Mesmo padrão de isolamento das migrations 0002 e 0004.
ALTER TABLE "stock_movements" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_stock_movements" ON "stock_movements"
	USING ("tenant_id" = current_setting('app.tenant_id', true)::uuid);
