-- Mesmo padrão de isolamento das migrations 0002, 0004, 0006, 0008, 0010, 0014, 0016, 0018, 0021, 0023, 0026, 0028 e 0032.
-- FORCE pelo mesmo motivo de sempre: migration 0011 já rodou antes desta tabela existir.
ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_logs" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_audit_logs" ON "audit_logs"
	USING ("tenant_id" = current_setting('app.tenant_id', true)::uuid);
