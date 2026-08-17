-- Mesmo padrão de isolamento das migrations 0002, 0004, 0006, 0008, 0010, 0014 e 0016.
-- FORCE pelo mesmo motivo de sempre: migration 0011 já rodou antes desta tabela existir.
ALTER TABLE "cost_centers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cost_centers" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_cost_centers" ON "cost_centers"
	USING ("tenant_id" = current_setting('app.tenant_id', true)::uuid);
