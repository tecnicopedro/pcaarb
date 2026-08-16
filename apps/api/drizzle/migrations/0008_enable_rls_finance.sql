-- Mesmo padrão de isolamento das migrations 0002, 0004 e 0006.
ALTER TABLE "finance_entries" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_finance_entries" ON "finance_entries"
	USING ("tenant_id" = current_setting('app.tenant_id', true)::uuid);
