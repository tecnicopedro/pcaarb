-- Mesmo padrão de isolamento das migrations 0002, 0004, 0006, 0008, 0010, 0014, 0016, 0018 e 0021.
-- FORCE pelo mesmo motivo de sempre: migration 0011 já rodou antes destas tabelas existirem.
ALTER TABLE "commission_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "commission_settings" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_commission_settings" ON "commission_settings"
	USING ("tenant_id" = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE "seller_commission_rates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "seller_commission_rates" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_seller_commission_rates" ON "seller_commission_rates"
	USING ("tenant_id" = current_setting('app.tenant_id', true)::uuid);
