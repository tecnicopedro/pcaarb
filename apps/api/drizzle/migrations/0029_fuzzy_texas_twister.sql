ALTER TABLE "sales" ADD COLUMN "client_sale_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "sales_tenant_client_sale_id_unique" ON "sales" USING btree ("tenant_id","client_sale_id");