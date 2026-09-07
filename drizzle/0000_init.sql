CREATE TYPE "public"."auth_token_type" AS ENUM('verify_email', 'reset_password');--> statement-breakpoint
CREATE TYPE "public"."customer_order_stage" AS ENUM('received', 'preparing', 'shipping', 'complete', 'cancelled', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('new', 'accepted', 'preorder', 'packaging', 'shipping', 'complete', 'cancelled', 'refund');--> statement-breakpoint
CREATE TYPE "public"."product_status" AS ENUM('draft', 'active', 'archived');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('owner', 'staff');--> statement-breakpoint
CREATE TABLE "auth_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" "auth_token_type" NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "characters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"name_en" text,
	"slug" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "characters_name_unique" UNIQUE("name"),
	CONSTRAINT "characters_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "customer_status_labels" (
	"stage" "customer_order_stage" PRIMARY KEY NOT NULL,
	"label_th" text NOT NULL,
	"label_en" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_item_statuses" (
	"code" text PRIMARY KEY NOT NULL,
	"label_th" text NOT NULL,
	"label_en" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"is_received" boolean DEFAULT false NOT NULL,
	"is_refunded" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"product_id" uuid,
	"product_variant_id" uuid,
	"product_code" text NOT NULL,
	"product_name" text NOT NULL,
	"product_type" text,
	"color" text,
	"size" text,
	"product_cost" numeric(12, 2) DEFAULT '0' NOT NULL,
	"sell_price" numeric(12, 2) DEFAULT '0' NOT NULL,
	"preorder_min_days" integer,
	"preorder_max_days" integer,
	"quantity" integer DEFAULT 1 NOT NULL,
	"status_code" text DEFAULT 'not_ordered' NOT NULL,
	"refund_reason" text,
	"refunded_at" timestamp with time zone,
	"line_total" numeric(12, 2),
	"line_cost" numeric(12, 2),
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_status_labels" (
	"status" "order_status" PRIMARY KEY NOT NULL,
	"label_th" text NOT NULL,
	"label_en" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_no" bigint GENERATED ALWAYS AS IDENTITY (sequence name "orders_order_no_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"order_date" date DEFAULT CURRENT_DATE NOT NULL,
	"customer_name" text NOT NULL,
	"customer_address" text,
	"customer_phone" text,
	"preorder_code" text NOT NULL,
	"checkout_key" uuid,
	"shipping_cost" numeric(12, 2) DEFAULT '0' NOT NULL,
	"packing_cost" numeric(12, 2) DEFAULT '0' NOT NULL,
	"advertising_cost" numeric(12, 2) DEFAULT '0' NOT NULL,
	"shipping_confirmed_at" timestamp with time zone,
	"items_total" numeric(12, 2) DEFAULT '0' NOT NULL,
	"items_cost" numeric(12, 2) DEFAULT '0' NOT NULL,
	"total_cost" numeric(12, 2),
	"profit" numeric(12, 2),
	"status" "order_status" DEFAULT 'new' NOT NULL,
	"refund_reason" text,
	"refunded_at" timestamp with time zone,
	"note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_preorder_code_unique" UNIQUE("preorder_code")
);
--> statement-breakpoint
CREATE TABLE "product_characters" (
	"product_id" uuid NOT NULL,
	"character_id" uuid NOT NULL,
	CONSTRAINT "product_characters_product_id_character_id_pk" PRIMARY KEY("product_id","character_id")
);
--> statement-breakpoint
CREATE TABLE "product_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"url" text NOT NULL,
	"storage_key" text,
	"alt" text,
	"color" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"name_en" text,
	"slug" text NOT NULL,
	"code_prefix" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_types_name_unique" UNIQUE("name"),
	CONSTRAINT "product_types_slug_unique" UNIQUE("slug"),
	CONSTRAINT "product_types_code_prefix_unique" UNIQUE("code_prefix")
);
--> statement-breakpoint
CREATE TABLE "product_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"color" text DEFAULT '-' NOT NULL,
	"size" text NOT NULL,
	"quantity" integer DEFAULT 0 NOT NULL,
	"sku" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_variants_product_color_size_unique" UNIQUE("product_id","color","size")
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_code" text NOT NULL,
	"product_name" text NOT NULL,
	"product_type" text,
	"description" text,
	"sell_price" numeric(12, 2) DEFAULT '0' NOT NULL,
	"original_price" numeric(12, 2) DEFAULT '0' NOT NULL,
	"buying_source" text,
	"source_link" text,
	"preorder_min_days" integer,
	"preorder_max_days" integer,
	"margin" numeric(12, 2),
	"status" "product_status" DEFAULT 'active' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_preorder_days_check" CHECK ((("products"."preorder_min_days" is null and "products"."preorder_max_days" is null) or ("products"."preorder_min_days" between 1 and 3650 and "products"."preorder_max_days" between "products"."preorder_min_days" and 3650)))
);
--> statement-breakpoint
CREATE TABLE "shop_settings" (
	"id" text PRIMARY KEY DEFAULT 'default' NOT NULL,
	"line_id" text,
	"instagram_handle" text,
	"facebook_url" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text,
	"password_hash" text NOT NULL,
	"fullname" text,
	"phone" text,
	"shipping_address" text,
	"role" "user_role" DEFAULT 'staff' NOT NULL,
	"email_verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_phone_unique" UNIQUE("phone")
);
--> statement-breakpoint
ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_variant_id_product_variants_id_fk" FOREIGN KEY ("product_variant_id") REFERENCES "public"."product_variants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_status_code_order_item_statuses_code_fk" FOREIGN KEY ("status_code") REFERENCES "public"."order_item_statuses"("code") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_characters" ADD CONSTRAINT "product_characters_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_characters" ADD CONSTRAINT "product_characters_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auth_tokens_user_type_idx" ON "auth_tokens" USING btree ("user_id","type");--> statement-breakpoint
CREATE INDEX "auth_tokens_expires_at_idx" ON "auth_tokens" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "order_item_statuses_one_default_idx" ON "order_item_statuses" USING btree ("is_default") WHERE "order_item_statuses"."is_default" = true;--> statement-breakpoint
CREATE INDEX "order_items_order_id_idx" ON "order_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_items_product_code_idx" ON "order_items" USING btree ("product_code");--> statement-breakpoint
CREATE INDEX "orders_status_idx" ON "orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "orders_order_date_idx" ON "orders" USING btree ("order_date" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "orders_checkout_key_idx" ON "orders" USING btree ("checkout_key") WHERE "orders"."checkout_key" is not null;--> statement-breakpoint
CREATE INDEX "product_characters_character_id_idx" ON "product_characters" USING btree ("character_id");--> statement-breakpoint
CREATE INDEX "product_images_product_id_idx" ON "product_images" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "product_variants_product_id_idx" ON "product_variants" USING btree ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "products_product_code_lower_idx" ON "products" USING btree (lower("product_code"));--> statement-breakpoint
CREATE INDEX "products_status_idx" ON "products" USING btree ("status");--> statement-breakpoint
CREATE INDEX "products_product_type_idx" ON "products" USING btree ("product_type");--> statement-breakpoint
CREATE INDEX "products_created_at_idx" ON "products" USING btree ("created_at" DESC NULLS LAST);