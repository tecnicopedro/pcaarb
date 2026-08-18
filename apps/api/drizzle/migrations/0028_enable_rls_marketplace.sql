-- Mesmo padrão de isolamento das migrations 0002, 0004, 0006, 0008, 0010, 0014, 0016, 0018, 0021, 0023 e 0026.
-- FORCE pelo mesmo motivo de sempre: migration 0011 já rodou antes destas tabelas existirem.
ALTER TABLE "marketplace_channels" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "marketplace_channels" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_marketplace_channels" ON "marketplace_channels"
	USING ("tenant_id" = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE "marketplace_listings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "marketplace_listings" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_marketplace_listings" ON "marketplace_listings"
	USING ("tenant_id" = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE "marketplace_orders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "marketplace_orders" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_marketplace_orders" ON "marketplace_orders"
	USING ("tenant_id" = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE "marketplace_order_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "marketplace_order_items" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_marketplace_order_items" ON "marketplace_order_items"
	USING ("tenant_id" = current_setting('app.tenant_id', true)::uuid);
