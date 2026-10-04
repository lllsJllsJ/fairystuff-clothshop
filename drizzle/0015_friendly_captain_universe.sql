CREATE TYPE "public"."product_discount_type" AS ENUM('percent', 'price');--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "regular_price" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "discount_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "discount_type" "product_discount_type";--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "discount_value" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "discount_starts_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "discount_ends_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "shop_settings" ADD COLUMN "sale_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "shop_settings" ADD COLUMN "sale_percent" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "shop_settings" ADD COLUMN "sale_starts_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "shop_settings" ADD COLUMN "sale_ends_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_discount_check" CHECK ((("products"."discount_type" is null and "products"."discount_value" is null) or ("products"."discount_type" = 'percent' and "products"."discount_value" between 1 and 90) or ("products"."discount_type" = 'price' and "products"."discount_value" > 0)));--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_discount_window_check" CHECK (("products"."discount_starts_at" is null or "products"."discount_ends_at" is null or "products"."discount_ends_at" > "products"."discount_starts_at"));--> statement-breakpoint
ALTER TABLE "shop_settings" ADD CONSTRAINT "shop_settings_sale_percent_check" CHECK (("shop_settings"."sale_percent" is null or "shop_settings"."sale_percent" between 1 and 90));--> statement-breakpoint
ALTER TABLE "shop_settings" ADD CONSTRAINT "shop_settings_sale_window_check" CHECK (("shop_settings"."sale_starts_at" is null or "shop_settings"."sale_ends_at" is null or "shop_settings"."sale_ends_at" > "shop_settings"."sale_starts_at"));