-- Mesmo padrão de isolamento das migrations 0002, 0004, 0006, 0008, 0010, 0014, 0016 e 0018.
-- FORCE pelo mesmo motivo de sempre: migration 0011 já rodou antes destas tabelas existirem.
ALTER TABLE "loyalty_programs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "loyalty_programs" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_loyalty_programs" ON "loyalty_programs"
	USING ("tenant_id" = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE "loyalty_ledger_entries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "loyalty_ledger_entries" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_loyalty_ledger_entries" ON "loyalty_ledger_entries"
	USING ("tenant_id" = current_setting('app.tenant_id', true)::uuid);
