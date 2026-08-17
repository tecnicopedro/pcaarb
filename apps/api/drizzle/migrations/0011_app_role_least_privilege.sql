-- Achado crítico da revisão de segurança: a conexão usada pela aplicação
-- (mesma role `pcaarb`/dono das tabelas usado nas migrations) é SUPERUSER,
-- e superusers ignoram RLS incondicionalmente (isso não depende de
-- FORCE ROW LEVEL SECURITY — apenas afeta o dono da tabela quando ele NÃO é
-- superuser). Na prática, todas as policies "tenant_isolation_*" criadas nas
-- migrations 0002/0004/0006/0008/0010 nunca chegaram a filtrar nada: uma
-- query sem `app.tenant_id` setado devolve linhas de todos os tenants
-- misturadas. O isolamento real dependia só dos filtros `WHERE tenant_id = ...`
-- manuais nos services — sem nenhuma rede de segurança no banco.
--
-- Correção: a aplicação passa a conectar com uma role separada, sem
-- SUPERUSER/BYPASSRLS e sem ser dona das tabelas, então RLS se aplica a ela
-- por padrão. FORCE ROW LEVEL SECURITY é aplicado mesmo assim, como defesa
-- adicional caso alguém volte a rodar a app com a role dona das tabelas.
--
-- Credencial abaixo é só para dev local (mesmo padrão de POSTGRES_PASSWORD
-- em docker-compose.yml). Em produção, crie a role com uma senha gerada por
-- secrets manager, nunca versionada.
DO $$
BEGIN
	IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'pcaarb_app') THEN
		CREATE ROLE "pcaarb_app" LOGIN PASSWORD 'pcaarb_app' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION;
	END IF;
END
$$;

GRANT CONNECT ON DATABASE "pcaarb" TO "pcaarb_app";
GRANT USAGE ON SCHEMA "public" TO "pcaarb_app";

-- Tabelas já existentes.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA "public" TO "pcaarb_app";
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA "public" TO "pcaarb_app";

-- Tabelas criadas por futuras migrations (rodadas pela role dona/`pcaarb`).
ALTER DEFAULT PRIVILEGES FOR ROLE "pcaarb" IN SCHEMA "public"
	GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "pcaarb_app";
ALTER DEFAULT PRIVILEGES FOR ROLE "pcaarb" IN SCHEMA "public"
	GRANT USAGE, SELECT ON SEQUENCES TO "pcaarb_app";

-- Defesa em profundidade: força RLS mesmo para o dono da tabela (não afeta
-- superuser, mas protege se a app um dia conectar como dono não-superuser).
ALTER TABLE "categories" FORCE ROW LEVEL SECURITY;
ALTER TABLE "products" FORCE ROW LEVEL SECURITY;
ALTER TABLE "customers" FORCE ROW LEVEL SECURITY;
ALTER TABLE "suppliers" FORCE ROW LEVEL SECURITY;
ALTER TABLE "cash_sessions" FORCE ROW LEVEL SECURITY;
ALTER TABLE "cash_movements" FORCE ROW LEVEL SECURITY;
ALTER TABLE "sales" FORCE ROW LEVEL SECURITY;
ALTER TABLE "sale_items" FORCE ROW LEVEL SECURITY;
ALTER TABLE "sale_payments" FORCE ROW LEVEL SECURITY;
ALTER TABLE "stock_movements" FORCE ROW LEVEL SECURITY;
ALTER TABLE "finance_entries" FORCE ROW LEVEL SECURITY;
ALTER TABLE "fiscal_documents" FORCE ROW LEVEL SECURITY;
