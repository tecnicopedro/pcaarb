-- Primeiro uso real do isolamento por Row-Level Security preparado na Fase 0
-- (ver src/database/tenant-context.ts). Categorias, produtos, clientes e
-- fornecedores são dados de negócio sempre acessados com o tenant já
-- resolvido do JWT, então RLS entra aqui como segunda camada de defesa além
-- do filtro `WHERE tenant_id = ...` que os services já aplicam.
ALTER TABLE "categories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "products" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "customers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "suppliers" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_categories" ON "categories"
	USING ("tenant_id" = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY "tenant_isolation_products" ON "products"
	USING ("tenant_id" = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY "tenant_isolation_customers" ON "customers"
	USING ("tenant_id" = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY "tenant_isolation_suppliers" ON "suppliers"
	USING ("tenant_id" = current_setting('app.tenant_id', true)::uuid);
