-- Mesmo padrão de isolamento das migrations 0002, 0004, 0006, 0008, 0010, 0014, 0016, 0018, 0021, 0023, 0026 e 0028.
-- FORCE pelo mesmo motivo de sempre: migration 0011 já rodou antes destas tabelas existirem.
ALTER TABLE "sale_returns" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sale_returns" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_sale_returns" ON "sale_returns"
	USING ("tenant_id" = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE "sale_return_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sale_return_items" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_sale_return_items" ON "sale_return_items"
	USING ("tenant_id" = current_setting('app.tenant_id', true)::uuid);
