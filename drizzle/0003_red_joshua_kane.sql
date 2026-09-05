CREATE TYPE "public"."auth_token_type" AS ENUM('verify_email', 'reset_password');--> statement-breakpoint
CREATE TYPE "public"."customer_order_stage" AS ENUM('received', 'preparing', 'shipping', 'complete', 'cancelled', 'refunded');--> statement-breakpoint
ALTER TYPE "public"."user_role" ADD VALUE 'customer';--> statement-breakpoint
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
CREATE TABLE "order_status_labels" (
	"status" "order_status" PRIMARY KEY NOT NULL,
	"label_th" text NOT NULL,
	"label_en" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_characters" (
	"product_id" uuid NOT NULL,
	"character_id" uuid NOT NULL,
	CONSTRAINT "product_characters_product_id_character_id_pk" PRIMARY KEY("product_id","character_id")
);
--> statement-breakpoint
CREATE TABLE "shop_settings" (
	"id" text PRIMARY KEY DEFAULT 'default' NOT NULL,
	"line_id" text,
	"instagram_handle" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "order_status_labels" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "status" SET DEFAULT 'new'::text;--> statement-breakpoint
DROP TYPE "public"."order_status";--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('new', 'accepted', 'preorder', 'packaging', 'shipping', 'complete', 'cancelled', 'refund');--> statement-breakpoint
UPDATE "orders" SET "status" = CASE "status"
	WHEN 'source_shipped' THEN 'preorder'
	WHEN 'packed' THEN 'packaging'
	WHEN 'shipped' THEN 'shipping'
	WHEN 'completed' THEN 'complete'
	ELSE "status"
END;--> statement-breakpoint
ALTER TABLE "order_status_labels" ALTER COLUMN "status" SET DATA TYPE "public"."order_status" USING "status"::"public"."order_status";--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "status" SET DEFAULT 'new'::"public"."order_status";--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "status" SET DATA TYPE "public"."order_status" USING "status"::"public"."order_status";--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "product_variant_id" uuid;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "status_code" text DEFAULT 'not_ordered' NOT NULL;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "refund_reason" text;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "refunded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "customer_email" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "customer_id" uuid;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "checkout_key" uuid;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "shipping_confirmed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "refund_reason" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "refunded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "preorder_min_days" integer;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "preorder_max_days" integer;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email_verified_at" timestamp with time zone;--> statement-breakpoint
INSERT INTO "order_item_statuses" ("code", "label_th", "label_en", "sort_order", "is_default", "is_received", "is_refunded", "is_active") VALUES
	('not_ordered', 'ยังไม่ได้สั่ง', 'Not ordered', 0, true, false, false, true),
	('preorder_shanghai', 'พรีออเดอร์-เซี่ยงไฮ้', 'Preorder-Shanghai', 10, false, false, false, true),
	('preorder_hk', 'พรีออเดอร์-ฮ่องกง', 'Preorder-HK', 20, false, false, false, true),
	('preorder_other', 'พรีออเดอร์-อื่นๆ', 'Preorder-Other', 30, false, false, false, true),
	('received', 'ได้รับสินค้าแล้ว', 'Received', 40, false, true, false, true),
	('refund_required', 'ต้องคืนเงิน', 'Refund required', 50, false, false, false, true),
	('refunded', 'คืนเงินแล้ว', 'Refunded', 60, false, false, true, true);--> statement-breakpoint
INSERT INTO "shop_settings" ("id") VALUES ('default');--> statement-breakpoint
INSERT INTO "order_status_labels" ("status", "label_th", "label_en") VALUES
	('new', 'รับออเดอร์ใหม่', 'New'),
	('accepted', 'รับออเดอร์แล้ว', 'Accepted'),
	('preorder', 'กำลังพรีออเดอร์', 'Preorder'),
	('packaging', 'กำลังแพ็ก', 'Packaging'),
	('shipping', 'กำลังจัดส่ง', 'Shipping'),
	('complete', 'สำเร็จ', 'Complete'),
	('cancelled', 'ยกเลิก', 'Cancelled'),
	('refund', 'คืนเงิน', 'Refund');--> statement-breakpoint
INSERT INTO "customer_status_labels" ("stage", "label_th", "label_en") VALUES
	('received', 'รับคำสั่งซื้อแล้ว', 'Received'),
	('preparing', 'กำลังเตรียมสินค้า', 'Preparing'),
	('shipping', 'กำลังจัดส่ง', 'Shipping'),
	('complete', 'สำเร็จ', 'Complete'),
	('cancelled', 'ยกเลิก', 'Cancelled'),
	('refunded', 'คืนเงินแล้ว', 'Refunded');--> statement-breakpoint
UPDATE "users" SET "email_verified_at" = COALESCE("created_at", now()) WHERE "role" IN ('owner', 'staff');--> statement-breakpoint
ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_characters" ADD CONSTRAINT "product_characters_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_characters" ADD CONSTRAINT "product_characters_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auth_tokens_user_type_idx" ON "auth_tokens" USING btree ("user_id","type");--> statement-breakpoint
CREATE INDEX "auth_tokens_expires_at_idx" ON "auth_tokens" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "order_item_statuses_one_default_idx" ON "order_item_statuses" USING btree ("is_default") WHERE "order_item_statuses"."is_default" = true;--> statement-breakpoint
CREATE INDEX "product_characters_character_id_idx" ON "product_characters" USING btree ("character_id");--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_variant_id_product_variants_id_fk" FOREIGN KEY ("product_variant_id") REFERENCES "public"."product_variants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_status_code_order_item_statuses_code_fk" FOREIGN KEY ("status_code") REFERENCES "public"."order_item_statuses"("code") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_users_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "orders_customer_id_idx" ON "orders" USING btree ("customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_checkout_key_idx" ON "orders" USING btree ("checkout_key") WHERE "orders"."checkout_key" is not null;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_preorder_days_check" CHECK ((("products"."preorder_min_days" is null and "products"."preorder_max_days" is null) or ("products"."preorder_min_days" between 1 and 3650 and "products"."preorder_max_days" between "products"."preorder_min_days" and 3650)));
