-- Mesmo padrão de isolamento das migrations 0002, 0004, 0006 e 0008.
ALTER TABLE "fiscal_documents" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_fiscal_documents" ON "fiscal_documents"
	USING ("tenant_id" = current_setting('app.tenant_id', true)::uuid);
