ALTER TABLE "product_types" ADD COLUMN "code_prefix" text;--> statement-breakpoint
ALTER TABLE "product_types" ADD CONSTRAINT "product_types_code_prefix_unique" UNIQUE("code_prefix");