import { sql } from "drizzle-orm"
import {
  bigint,
  date,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
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
 * `drizzle/0000_init_extras.sql`, which converts them after the initial
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

/**
 * `source_shipped` = the supplier (Buying Source) has dispatched to us,
 * before we pack and ship to the customer.
 */
export const orderStatus = pgEnum("order_status", [
  "new",
  "source_shipped",
  "packed",
  "shipped",
  "completed",
  "cancelled",
])

// ---------------------------------------------------------------------------
// users — replaces carstockpro's profiles + auth.users split. Auth.js owns
// no tables under the JWT strategy. `staff` is the fail-safe default role;
// it has no capability in v1. No public signup route — the only way an
// owner account is created is `scripts/create-owner.ts`.
// ---------------------------------------------------------------------------

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  fullname: text("fullname"),
  role: userRole("role").notNull().default("staff"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
})

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
    /**
     * Generated column (sellPrice - originalPrice). See the file-level note
     * above — the GENERATED ALWAYS AS expression is added by
     * 0000_init_extras.sql, not here.
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
    // The pg_trgm GIN indexes on productName and productCode need the
    // gin_trgm_ops operator class, which drizzle-kit does not model
    // portably — those two live in 0000_init_extras.sql (plan §4).
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
    /** Check (quantity >= 0) is added in 0000_init_extras.sql. */
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

// ---------------------------------------------------------------------------
// orders — itemsTotal / itemsCost are trigger-maintained (recalc_order(),
// see 0000_init_extras.sql) rather than generated, because a stored
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
    shippingCost: numeric("shipping_cost", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    packingCost: numeric("packing_cost", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    /** Trigger-maintained by recalc_order() — never set directly. */
    itemsTotal: numeric("items_total", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    /** Trigger-maintained by recalc_order() — never set directly. */
    itemsCost: numeric("items_cost", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    /** Generated column (itemsCost + shippingCost + packingCost). */
    totalCost: numeric("total_cost", { precision: 12, scale: 2 }),
    /** Generated column (itemsTotal - itemsCost - shippingCost - packingCost). */
    profit: numeric("profit", { precision: 12, scale: 2 }),
    status: orderStatus("status").notNull().default("new"),
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
    /** Check (quantity > 0) is added in 0000_init_extras.sql. */
    quantity: integer("quantity").notNull().default(1),
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
