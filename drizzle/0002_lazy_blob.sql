ALTER TABLE "orders" ADD COLUMN "advertising_cost" numeric(12, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" DROP COLUMN "total_cost";--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "total_cost" numeric(12, 2)
  GENERATED ALWAYS AS (items_cost + shipping_cost + packing_cost + advertising_cost) STORED;--> statement-breakpoint
ALTER TABLE "orders" DROP COLUMN "profit";--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "profit" numeric(12, 2)
  GENERATED ALWAYS AS (items_total - items_cost - shipping_cost - packing_cost - advertising_cost) STORED;
