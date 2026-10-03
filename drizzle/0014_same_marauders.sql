ALTER TABLE "products" ADD COLUMN "display_order" integer;--> statement-breakpoint
CREATE INDEX "products_display_order_idx" ON "products" USING btree ("display_order");