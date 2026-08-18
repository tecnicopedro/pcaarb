CREATE TYPE "public"."marketplace_listing_status" AS ENUM('pending', 'synced', 'error');--> statement-breakpoint
CREATE TYPE "public"."marketplace_order_status" AS ENUM('imported', 'needs_attention');--> statement-breakpoint
CREATE TABLE "marketplace_channels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"provider" text DEFAULT 'mock' NOT NULL,
	"name" text NOT NULL,
	"external_store_id" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "marketplace_listings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"channel_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"external_product_id" text,
	"status" "marketplace_listing_status" DEFAULT 'pending' NOT NULL,
	"last_synced_at" timestamp with time zone,
	"last_sync_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "marketplace_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"channel_id" uuid NOT NULL,
	"external_order_id" text NOT NULL,
	"total_cents" integer NOT NULL,
	"status" "marketplace_order_status" NOT NULL,
	"issue" text,
	"imported_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "marketplace_order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"external_product_id" text NOT NULL,
	"product_id" uuid,
	"quantity" integer NOT NULL,
	"unit_price_cents" integer NOT NULL,
	"applied" boolean NOT NULL,
	"issue" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "marketplace_channels" ADD CONSTRAINT "marketplace_channels_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace_listings" ADD CONSTRAINT "marketplace_listings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace_listings" ADD CONSTRAINT "marketplace_listings_channel_id_marketplace_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."marketplace_channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace_listings" ADD CONSTRAINT "marketplace_listings_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace_orders" ADD CONSTRAINT "marketplace_orders_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace_orders" ADD CONSTRAINT "marketplace_orders_channel_id_marketplace_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."marketplace_channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace_order_items" ADD CONSTRAINT "marketplace_order_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace_order_items" ADD CONSTRAINT "marketplace_order_items_order_id_marketplace_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."marketplace_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace_order_items" ADD CONSTRAINT "marketplace_order_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "marketplace_listings_channel_product_unique" ON "marketplace_listings" USING btree ("channel_id","product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "marketplace_listings_channel_external_product_unique" ON "marketplace_listings" USING btree ("channel_id","external_product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "marketplace_orders_channel_external_order_unique" ON "marketplace_orders" USING btree ("channel_id","external_order_id");