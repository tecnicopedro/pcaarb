CREATE TABLE "stores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- store_id entra opcional nas duas tabelas existentes de propósito: elas já
-- têm linhas (tenants em produção/teste local), e Postgres não aceita
-- ADD COLUMN NOT NULL sem DEFAULT numa tabela não-vazia. Backfill roda logo
-- abaixo (uma loja padrão por tenant existente, nome = razão social), e só
-- depois disso a coluna vira NOT NULL de verdade — igual ao dado real.
ALTER TABLE "cash_sessions" ADD COLUMN "store_id" uuid;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "store_id" uuid;--> statement-breakpoint
ALTER TABLE "stores" ADD CONSTRAINT "stores_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

INSERT INTO "stores" ("tenant_id", "name")
SELECT "id", "company_name" FROM "tenants";
--> statement-breakpoint

UPDATE "cash_sessions" AS cs
SET "store_id" = s."id"
FROM "stores" AS s
WHERE s."tenant_id" = cs."tenant_id" AND cs."store_id" IS NULL;
--> statement-breakpoint

UPDATE "sales" AS sa
SET "store_id" = s."id"
FROM "stores" AS s
WHERE s."tenant_id" = sa."tenant_id" AND sa."store_id" IS NULL;
--> statement-breakpoint

ALTER TABLE "cash_sessions" ALTER COLUMN "store_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "sales" ALTER COLUMN "store_id" SET NOT NULL;
