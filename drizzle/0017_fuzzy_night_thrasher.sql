ALTER TABLE "shop_settings" ADD COLUMN "sale_label_th" text;--> statement-breakpoint
ALTER TABLE "shop_settings" ADD COLUMN "sale_label_en" text;--> statement-breakpoint
ALTER TABLE "shop_settings" ADD CONSTRAINT "shop_settings_sale_label_length_check" CHECK ((char_length(coalesce("shop_settings"."sale_label_th", '')) <= 40 and char_length(coalesce("shop_settings"."sale_label_en", '')) <= 40));