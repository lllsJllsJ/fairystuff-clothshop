import { sql } from "drizzle-orm"
import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  unique,
  uuid,
} from "drizzle-orm/pg-core"

/**
 * Single source of truth for both migrations (`drizzle-kit generate`) and
 * TypeScript types. There is no hand-written `types/database.ts` — see
 * carstockpro's CLAUDE.md for the footgun this replaces.
 *
 * Generated columns (products.margin, orders.total_cost, orders.profit,
 * order_items.line_total, order_items.line_cost) are declared below as
 * ordinary columns so reads type correctly, but the actual
 * `GENERATED ALWAYS AS (...) STORED` DDL — along with triggers, the
 * pg_trgm indexes, and check constraints — lives in the hand-written
 * `drizzle/0001_init_extras.sql`, which converts them after the initial
 * migration. Drizzle does not model any of that; see plan §4. Consequence:
 * these columns are NOT compile-time protected from being sent on an
 * insert/update — Postgres will reject the write at runtime (23P05 /
 * "cannot insert into generated column"). Never send margin, totalCost,
 * profit, lineTotal, or lineCost in a write payload.
 */

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const userRole = pgEnum("user_role", ["owner", "staff"])

export const productStatus = pgEnum("product_status", [
  "draft",
  "active",
  "archived",
])

/** Internal owner workflow. Customer-facing stages are derived in
 * `src/lib/order-status.ts` and deliberately expose less detail. */
export const orderStatus = pgEnum("order_status", [
  "new",
  "accepted",
  "preorder",
  "packaging",
  "shipping",
  "complete",
  "cancelled",
  "refund",
])

export const customerOrderStage = pgEnum("customer_order_stage", [
  "received",
  "preparing",
  "shipping",
  "complete",
  "cancelled",
  "refunded",
])

export const authTokenType = pgEnum("auth_token_type", [
  "verify_email",
  "reset_password",
])

// ---------------------------------------------------------------------------
// users — owner/staff only. Auth.js owns no tables under the JWT strategy.
// `staff` is the fail-safe default role and has no capability in v1. There is
// no public registration: accounts are created only by scripts/create-owner.ts
// (or promoted from `staff` by an owner in /admin/users). Guest checkout
// (see src/app/[locale]/(shop)/checkout) needs no account at all — the
// `customer` role was removed once accounts stopped gating checkout; see
// CLAUDE.md's "preorder codes are server-minted" invariant for what replaced
// it.
// ---------------------------------------------------------------------------

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  // Nullable: owner/staff sign-in prefers email, but the column stayed
  // nullable through the guest-checkout migration rather than backfilling a
  // NOT NULL constraint onto rows that predate it. Anything reading this
  // column must still handle null.
  email: text("email").unique(),
  passwordHash: text("password_hash").notNull(),
  fullname: text("fullname"),
  phone: text("phone").unique(),
  shippingAddress: text("shipping_address"),
  role: userRole("role").notNull().default("staff"),
  // Cosmetic as of the guest-checkout migration: `authorize()` in src/auth.ts
  // no longer gates sign-in on this column (that gate existed only for the
  // now-removed `customer` role, which could register without ever proving
  // an email). Kept for its historical data and because `verifyUserEmail`
  // (admin/users/actions.ts) still writes it — do NOT re-add a login gate on
  // this column without checking that first, since it would risk locking out
  // an `owner`/`staff` account that never verified an email.
  emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
})

export const authTokens = pgTable(
  "auth_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: authTokenType("type").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("auth_tokens_user_type_idx").on(table.userId, table.type),
    index("auth_tokens_expires_at_idx").on(table.expiresAt),
  ]
)

// ---------------------------------------------------------------------------
// productTypes — reference list backing the CreatableCombobox. products
// stores productType as free text (carstockpro's brands pattern); this
// table only holds the managed suggestion list.
// ---------------------------------------------------------------------------

export const productTypes = pgTable("product_types", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  nameEn: text("name_en"),
  slug: text("slug").notNull().unique(),
  /**
   * Short uppercase key this type's product codes are built from —
   * `TS` -> `TS-001`, `TS-002`, ... (see src/lib/product-code.ts).
   * Nullable so an existing row predating this column, or a type learned
   * from free-typed input before a prefix could be derived, is still
   * valid; the generator derives and persists one on first use. Unique so
   * two types can never mint codes into the same sequence.
   */
  codePrefix: text("code_prefix").unique(),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
})

// Customer-facing character taxonomy. Unlike productTypes, characters are
// relational because a product may match more than one character.
export const characters = pgTable("characters", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  nameEn: text("name_en"),
  slug: text("slug").notNull().unique(),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
})

// ---------------------------------------------------------------------------
// products — no `color` column; colour lives on variants (colour x size
// matrix). Public columns: productCode, productName, productType,
// description, sellPrice. Private: originalPrice, buyingSource, sourceLink,
// margin. See src/db/queries/storefront.ts (Phase 4) for the enforced split.
// ---------------------------------------------------------------------------

export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productCode: text("product_code").notNull(),
    productName: text("product_name").notNull(),
    productType: text("product_type"),
    description: text("description"),
    sellPrice: numeric("sell_price", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    originalPrice: numeric("original_price", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    buyingSource: text("buying_source"),
    sourceLink: text("source_link"),
    preorderMinDays: integer("preorder_min_days"),
    preorderMaxDays: integer("preorder_max_days"),
    /**
     * Generated column (sellPrice - originalPrice). See the file-level note
     * above — the GENERATED ALWAYS AS expression is added by
     * 0001_init_extras.sql, not here.
     */
    margin: numeric("margin", { precision: 12, scale: 2 }),
    status: productStatus("status").notNull().default("active"),
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("products_product_code_lower_idx").on(
      sql`lower(${table.productCode})`
    ),
    index("products_status_idx").on(table.status),
    index("products_product_type_idx").on(table.productType),
    index("products_created_at_idx").on(table.createdAt.desc()),
    check(
      "products_preorder_days_check",
      sql`((${table.preorderMinDays} is null and ${table.preorderMaxDays} is null) or (${table.preorderMinDays} between 1 and 3650 and ${table.preorderMaxDays} between ${table.preorderMinDays} and 3650))`
    ),
    // The pg_trgm GIN indexes on productName and productCode need the
    // gin_trgm_ops operator class, which drizzle-kit does not model
    // portably — those two live in 0001_init_extras.sql (plan §4).
  ]
)

export const productCharacters = pgTable(
  "product_characters",
  {
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    characterId: uuid("character_id")
      .notNull()
      .references(() => characters.id, { onDelete: "restrict" }),
  },
  (table) => [
    primaryKey({ columns: [table.productId, table.characterId] }),
    index("product_characters_character_id_idx").on(table.characterId),
  ]
)

// ---------------------------------------------------------------------------
// productVariants — the colour x size matrix. DELIBERATE: nothing here is
// decremented by orderItems. Orders and stock are independent ledgers; the
// owner adjusts quantities in the product editor. Do not "fix" this with a
// trigger.
// ---------------------------------------------------------------------------

export const productVariants = pgTable(
  "product_variants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    /** "-" = a one-colour item (no real colour axis). */
    color: text("color").notNull().default("-"),
    size: text("size").notNull(),
    /** Check (quantity >= 0) is added in 0001_init_extras.sql. */
    quantity: integer("quantity").notNull().default(0),
    sku: text("sku"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("product_variants_product_color_size_unique").on(
      table.productId,
      table.color,
      table.size
    ),
    index("product_variants_product_id_idx").on(table.productId),
  ]
)

// ---------------------------------------------------------------------------
// productImages — sortOrder 0 is the cover. `color` nullable: a specific
// colour swaps the detail gallery when its swatch is picked; null shows for
// every colour.
// ---------------------------------------------------------------------------

export const productImages = pgTable(
  "product_images",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    storageKey: text("storage_key"),
    alt: text("alt"),
    color: text("color"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("product_images_product_id_idx").on(table.productId)]
)

export const orderItemStatuses = pgTable(
  "order_item_statuses",
  {
    code: text("code").primaryKey(),
    labelTh: text("label_th").notNull(),
    labelEn: text("label_en").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    isDefault: boolean("is_default").notNull().default(false),
    isReceived: boolean("is_received").notNull().default(false),
    isRefunded: boolean("is_refunded").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("order_item_statuses_one_default_idx")
      .on(table.isDefault)
      .where(sql`${table.isDefault} = true`),
  ]
)

export const orderStatusLabels = pgTable("order_status_labels", {
  status: orderStatus("status").primaryKey(),
  labelTh: text("label_th").notNull(),
  labelEn: text("label_en").notNull(),
})

export const customerStatusLabels = pgTable("customer_status_labels", {
  stage: customerOrderStage("stage").primaryKey(),
  labelTh: text("label_th").notNull(),
  labelEn: text("label_en").notNull(),
})

export const shopSettings = pgTable("shop_settings", {
  id: text("id").primaryKey().default("default"),
  lineId: text("line_id"),
  instagramHandle: text("instagram_handle"),
  facebookUrl: text("facebook_url"),
  /**
   * Brand identity, editable from Admin -> Settings -> Brand. Null means
   * "not set yet" — every reader falls back to the src/lib/brand.ts
   * placeholder constants (see resolvedBrandName/resolvedBrandDescription
   * in src/db/queries/settings.ts), so an unconfigured shop still renders
   * sensible copy instead of blank text. brandName is a single value
   * (brand names aren't translated); the description is a TH/EN pair,
   * mirroring BRAND_TAGLINE_TH/EN.
   */
  brandName: text("brand_name"),
  brandDescriptionTh: text("brand_description_th"),
  brandDescriptionEn: text("brand_description_en"),
  /** Canonical stored URL (same-origin /api/images/... proxy, see
   * src/lib/brand-image-keys.ts) and the underlying object-storage key —
   * the key is kept so a replaced/removed logo's old object can be
   * deleted, mirroring productImages.storageKey. */
  logoUrl: text("logo_url"),
  logoStorageKey: text("logo_storage_key"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
})

// ---------------------------------------------------------------------------
// orders — itemsTotal / itemsCost are trigger-maintained (recalc_order(),
// see 0001_init_extras.sql) rather than generated, because a stored
// generated column may not reference another generated column and
// totalCost/profit below need to be generated from them. totalCost and
// profit are themselves generated columns.
// ---------------------------------------------------------------------------

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Human-readable reference number; not the primary key. */
    orderNo: bigint("order_no", { mode: "number" })
      .notNull()
      .generatedAlwaysAsIdentity(),
    orderDate: date("order_date")
      .notNull()
      .default(sql`CURRENT_DATE`),
    customerName: text("customer_name").notNull(),
    customerAddress: text("customer_address"),
    customerPhone: text("customer_phone"),
    /**
     * Random, unguessable public tracking code (see src/lib/preorder-code.ts).
     * Server-minted, immutable once assigned — mirrors the
     * products.productCode invariant. NOT NULL as of migration 0009
     * (0008 added it nullable and backfilled every existing row first — an
     * ADD COLUMN ... NOT NULL with no default fails outright on a populated
     * table). Deliberately excludes the sequential `orderNo` from any public
     * surface, since printing that on a guessable URL would defeat the point
     * of a random code.
     */
    preorderCode: text("preorder_code").notNull().unique(),
    checkoutKey: uuid("checkout_key"),
    shippingCost: numeric("shipping_cost", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    packingCost: numeric("packing_cost", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    advertisingCost: numeric("advertising_cost", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    shippingConfirmedAt: timestamp("shipping_confirmed_at", {
      withTimezone: true,
    }),
    /** Trigger-maintained by recalc_order() — never set directly. */
    itemsTotal: numeric("items_total", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    /** Trigger-maintained by recalc_order() — never set directly. */
    itemsCost: numeric("items_cost", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    /** Generated column (itemsCost + shippingCost + packingCost + advertisingCost). */
    totalCost: numeric("total_cost", { precision: 12, scale: 2 }),
    /** Net profit after product, shipping, packing, and advertising costs. */
    profit: numeric("profit", { precision: 12, scale: 2 }),
    status: orderStatus("status").notNull().default("new"),
    refundReason: text("refund_reason"),
    refundedAt: timestamp("refunded_at", { withTimezone: true }),
    note: text("note"),
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("orders_status_idx").on(table.status),
    index("orders_order_date_idx").on(table.orderDate.desc()),
    uniqueIndex("orders_checkout_key_idx")
      .on(table.checkoutKey)
      .where(sql`${table.checkoutKey} is not null`),
  ]
)

// ---------------------------------------------------------------------------
// orderItems — product fields SNAPSHOTTED at order time so later product
// edits never rewrite history. productId is a soft link (on delete set
// null) for reporting only — reports must group by productCode (the
// snapshot), not productId, since a deleted product's history must not
// lie. See plan Risk 4.
// ---------------------------------------------------------------------------

export const orderItems = pgTable(
  "order_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    productId: uuid("product_id").references(() => products.id, {
      onDelete: "set null",
    }),
    productVariantId: uuid("product_variant_id").references(
      () => productVariants.id,
      { onDelete: "set null" }
    ),
    productCode: text("product_code").notNull(),
    productName: text("product_name").notNull(),
    productType: text("product_type"),
    color: text("color"),
    size: text("size"),
    productCost: numeric("product_cost", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    sellPrice: numeric("sell_price", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    /**
     * Lead-time SNAPSHOT — copied from `products.preorderMinDays`/
     * `preorderMaxDays` at order-insert time, same principle as
     * `productCost`/`sellPrice`/`productName` above: a later edit to the
     * product's preorder window must never rewrite an already-placed
     * order's estimate. Both null is the normal case (most items aren't
     * preorders); no check constraint here since the source columns on
     * `products` are already constrained and a null pair is always valid
     * on a line item.
     */
    preorderMinDays: integer("preorder_min_days"),
    preorderMaxDays: integer("preorder_max_days"),
    /** Check (quantity > 0) is added in 0001_init_extras.sql. */
    quantity: integer("quantity").notNull().default(1),
    statusCode: text("status_code")
      .notNull()
      .default("not_ordered")
      .references(() => orderItemStatuses.code, { onDelete: "restrict" }),
    refundReason: text("refund_reason"),
    refundedAt: timestamp("refunded_at", { withTimezone: true }),
    /** Generated column (sellPrice * quantity). */
    lineTotal: numeric("line_total", { precision: 12, scale: 2 }),
    /** Generated column (productCost * quantity). */
    lineCost: numeric("line_cost", { precision: 12, scale: 2 }),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("order_items_order_id_idx").on(table.orderId),
    index("order_items_product_code_idx").on(table.productCode),
  ]
)
