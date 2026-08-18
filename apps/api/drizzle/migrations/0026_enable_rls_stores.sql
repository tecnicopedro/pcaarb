-- Mesmo padrão de isolamento das migrations 0002, 0004, 0006, 0008, 0010, 0014, 0016, 0018, 0021 e 0023.
-- FORCE pelo mesmo motivo de sempre: migration 0011 já rodou antes desta tabela existir.
ALTER TABLE "stores" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "stores" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_stores" ON "stores"
	USING ("tenant_id" = current_setting('app.tenant_id', true)::uuid);
