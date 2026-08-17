-- Mesmo padrão de isolamento das migrations 0002, 0004, 0006, 0008 e 0010.
-- FORCE (não só ENABLE) porque a migration 0011, que fez isso retroativamente
-- para as tabelas existentes na época, já tinha rodado antes destas duas
-- tabelas existirem — sem o FORCE explícito aqui, mesmo a role pcaarb_app
-- (não superuser) ainda bypassaria RLS por ser dona das tabelas.
ALTER TABLE "purchase_orders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "purchase_orders" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_purchase_orders" ON "purchase_orders"
	USING ("tenant_id" = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE "purchase_order_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "purchase_order_items" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_purchase_order_items" ON "purchase_order_items"
	USING ("tenant_id" = current_setting('app.tenant_id', true)::uuid);
