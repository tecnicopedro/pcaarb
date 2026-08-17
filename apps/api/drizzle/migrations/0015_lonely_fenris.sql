CREATE TYPE "public"."stock_count_status" AS ENUM('open', 'completed', 'canceled');--> statement-breakpoint
CREATE TABLE "stock_counts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"status" "stock_count_status" DEFAULT 'open' NOT NULL,
	"notes" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "stock_count_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"stock_count_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"product_name" text NOT NULL,
	"expected_quantity" integer NOT NULL,
	"counted_quantity" integer
);
--> statement-breakpoint
ALTER TABLE "stock_counts" ADD CONSTRAINT "stock_counts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_counts" ADD CONSTRAINT "stock_counts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_count_items" ADD CONSTRAINT "stock_count_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_count_items" ADD CONSTRAINT "stock_count_items_stock_count_id_stock_counts_id_fk" FOREIGN KEY ("stock_count_id") REFERENCES "public"."stock_counts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_count_items" ADD CONSTRAINT "stock_count_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;