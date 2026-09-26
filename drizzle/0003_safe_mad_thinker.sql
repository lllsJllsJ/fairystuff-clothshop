CREATE TYPE "public"."preorder_leg" AS ENUM('cn_cn', 'cn_th', 'th_th');--> statement-breakpoint
CREATE TYPE "public"."product_audience" AS ENUM('adult', 'kids');--> statement-breakpoint
CREATE TYPE "public"."product_kind" AS ENUM('single', 'set', 'fullset');--> statement-breakpoint
CREATE TABLE "preorder_shipments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"leg" "preorder_leg" NOT NULL,
	"carrier" text,
	"tracking_no" text,
	"cost" numeric(12, 2) DEFAULT '0' NOT NULL,
	"note" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "order_item_statuses" ADD COLUMN "is_preorder" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "master_cost" numeric(12, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "shipping_carrier" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "tracking_no" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "preorder_shipping_cost" numeric(12, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "items_master_cost" numeric(12, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "product_images" ADD COLUMN "source_url" text;--> statement-breakpoint
ALTER TABLE "product_variants" ADD COLUMN "is_available" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "audience" "product_audience" DEFAULT 'adult' NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "kind" "product_kind" DEFAULT 'single' NOT NULL;--> statement-breakpoint
ALTER TABLE "preorder_shipments" ADD CONSTRAINT "preorder_shipments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "preorder_shipments_order_id_idx" ON "preorder_shipments" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "products_audience_idx" ON "products" USING btree ("audience");--> statement-breakpoint
CREATE INDEX "products_kind_idx" ON "products" USING btree ("kind");