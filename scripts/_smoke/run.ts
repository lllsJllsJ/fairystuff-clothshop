/**
 * Runtime smoke test for the query layer.
 *
 * Runs the REAL functions from src/db/queries/* against a local Docker
 * Postgres, through the REAL src/db/index.ts — no test double in the path.
 * (Only `server-only` is stubbed, via tsconfig.smoke.json, because that
 * package throws when required outside a bundler.)
 *
 * `tsc` cannot catch a Drizzle expression that compiles to valid-but-wrong
 * SQL. This can, and has: it caught a correlated subquery whose unqualified
 * column names silently resolved to the wrong table.
 */
import { db } from "../../src/db"
import { characters, orderItems, orders, productCharacters, productImages, productTypes, productVariants, products } from "../../src/db/schema"
import { getPublicProducts, getPublicProductByCode, getPublicCharacters, getActiveProductCodes } from "../../src/db/queries/storefront"
import { getProducts, getProductById, getProductCodes } from "../../src/db/queries/products"
import { getOrders, getOrderById } from "../../src/db/queries/orders"
import { getProductTypes } from "../../src/db/queries/product-types"
import { getDashboardData } from "../../src/db/queries/dashboard"
import { getReportsData } from "../../src/db/queries/reports"

const PRIVATE = [
  "originalPrice",
  "buyingSource",
  "sourceLink",
  "margin",
  "quantity",
  "productType",
  "preorderMinDays",
  "preorderMaxDays",
]
let pass = 0
let fail = 0

function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`)
  if (ok) pass++
  else fail++
}

/** Deep scan for any private key name anywhere in a returned structure. */
function scanPrivate(value: unknown, path = "$"): string[] {
  if (value === null || typeof value !== "object") return []
  if (Array.isArray(value)) return value.flatMap((v, i) => scanPrivate(v, `${path}[${i}]`))
  const hits: string[] = []
  for (const [k, v] of Object.entries(value)) {
    if (PRIVATE.includes(k)) hits.push(`${path}.${k}`)
    hits.push(...scanPrivate(v, `${path}.${k}`))
  }
  return hits
}

async function seed() {
  await db.delete(orderItems); await db.delete(orders)
  await db.delete(productImages); await db.delete(productVariants); await db.delete(productCharacters)
  await db.delete(products); await db.delete(productTypes)

  await db.insert(productTypes).values([
    { name: "เสื้อยืด", nameEn: "T-Shirt", slug: "t-shirt", sortOrder: 1 },
    { name: "เดรส", nameEn: "Dress", slug: "dress", sortOrder: 2 },
  ])

  const [character] = await db.insert(characters).values({ name: "มิกกี้", nameEn: "Mickey", slug: "mickey" }).returning({ id: characters.id })
  const [live] = await db.insert(products).values({
    productCode: "TEE-001", productName: "เสื้อยืดลายดอก", productType: "เสื้อยืด",
    sellPrice: "890", originalPrice: "350", buyingSource: "Chatuchak",
    sourceLink: "https://example.com/supplier", status: "active",
  }).returning({ id: products.id })
  await db.insert(productCharacters).values({ productId: live.id, characterId: character.id })

  await db.insert(products).values({
    productCode: "DRAFT-9", productName: "ยังไม่เปิดขาย", productType: "เดรส",
    sellPrice: "1200", originalPrice: "600", status: "draft",
  })

  await db.insert(productVariants).values([
    { productId: live.id, color: "ดำ", size: "S", quantity: 3 },
    { productId: live.id, color: "ดำ", size: "M", quantity: 0 },
    { productId: live.id, color: "เบจ", size: "S", quantity: 5 },
  ])
  await db.insert(productImages).values([
    { productId: live.id, url: "https://img.example.com/a-800.webp", storageKey: "products/x/a-800.webp", sortOrder: 0 },
    { productId: live.id, url: "https://img.example.com/b-800.webp", storageKey: "products/x/b-800.webp", color: "เบจ", sortOrder: 1 },
  ])

  const [ord] = await db.insert(orders).values({
    customerName: "คุณมานี", customerPhone: "0812345678",
    shippingCost: "50", packingCost: "20", advertisingCost: "30", status: "new",
  }).returning({ id: orders.id })

  await db.insert(orderItems).values({
    orderId: ord.id, productId: live.id, productCode: "TEE-001",
    productName: "เสื้อยืดลายดอก", productType: "เสื้อยืด", color: "ดำ", size: "S",
    productCost: "350", sellPrice: "890", quantity: 2,
  })
  return { productId: live.id, orderId: ord.id }
}

async function main() {
  const ids = await seed()
  console.log("--- storefront (public) ---")

  const list = await getPublicProducts({})
  check("getPublicProducts returns only active", list.rows.length === 1 && list.rows[0].productCode === "TEE-001",
    `${list.rows.length} row(s), draft excluded`)
  const listLeaks = scanPrivate(list.rows)
  check("getPublicProducts leaks nothing private", listLeaks.length === 0, listLeaks.join(", ") || "clean")
  check("getPublicProducts exposes preorder colours + characters",
    Array.isArray(list.rows[0]?.colors) && list.rows[0]?.characters[0]?.slug === "mickey",
    `colors=${JSON.stringify(list.rows[0]?.colors)}`)

  const detail = await getPublicProductByCode("TEE-001")
  const detLeaks = scanPrivate(detail)
  check("getPublicProductByCode leaks nothing private", detLeaks.length === 0, detLeaks.join(", ") || "clean")
  check("detail variants expose no private stock quantity",
    !!detail && detail.variants.every((v) => !("quantity" in v)),
    `${detail?.variants.length} variants`)
  check("draft product is not publicly reachable", (await getPublicProductByCode("DRAFT-9")) === null)
  check("lookup is case-insensitive", (await getPublicProductByCode("tee-001")) !== null)

  const publicCharacters = await getPublicCharacters()
  check("getPublicCharacters only lists characters with live products",
    publicCharacters.length === 1 && publicCharacters[0].slug === "mickey", JSON.stringify(publicCharacters))
  const codes = await getActiveProductCodes()
  check("getActiveProductCodes excludes draft", codes.length === 1 && codes[0] === "TEE-001")

  console.log("--- admin ---")
  const admin = await getProducts({})
  check("getProducts returns both statuses", admin.rows.length === 2, `${admin.rows.length} rows`)
  check("admin DOES see cost fields", !!admin.rows.find((r) => r.productCode === "TEE-001")?.originalPrice)
  check("getProductById joins variants + images",
    (await getProductById(ids.productId))?.variants.length === 3)
  check("getProductCodes returns codes", (await getProductCodes()).length === 2)
  check("getProductTypes returns reference list", (await getProductTypes()).length === 2)

  const ord = await getOrders({})
  check("getOrders returns rows with itemCount",
    ord.rows.length === 1 && ord.rows[0].itemCount === 1, `itemCount=${ord.rows[0]?.itemCount}`)
  check("getOrders includes advertising cost", ord.rows[0]?.advertisingCost === "30.00",
    `advertisingCost=${ord.rows[0]?.advertisingCost}`)
  check("getOrders profit includes advertising cost", ord.rows[0]?.profit === "980.00", `profit=${ord.rows[0]?.profit}`)
  check("getOrders search by customer name", (await getOrders({ search: "มานี" })).rows.length === 1)
  check("getOrders search by order number", (await getOrders({ search: String(ord.rows[0].orderNo) })).rows.length === 1)
  check("getOrders search miss returns none", (await getOrders({ search: "ไม่มีอยู่จริง" })).rows.length === 0)
  check("getOrderById joins items", (await getOrderById(ids.orderId))?.items.length === 1)

  console.log("--- transactions (pooled driver; Risk 3 no longer applies) ---")
  const before = (await db.select().from(products)).length
  try {
    await db.transaction(async (tx) => {
      await tx.insert(products).values({
        productCode: "TX-ROLLBACK", productName: "should not survive",
        sellPrice: "1", originalPrice: "1", status: "active",
      })
      throw new Error("deliberate failure mid-transaction")
    })
  } catch {
    /* expected */
  }
  const after = (await db.select().from(products)).length
  check("db.transaction() rolls back on throw", after === before,
    `${before} rows before, ${after} after`)

  await db.transaction(async (tx) => {
    await tx.insert(products).values({
      productCode: "TX-COMMIT", productName: "should survive",
      sellPrice: "1", originalPrice: "1", status: "draft",
    })
  })
  check("db.transaction() commits on success",
    (await db.select().from(products)).length === before + 1)

  console.log("--- aggregates ---")
  const dash = await getDashboardData()
  check("getDashboardData executes", !!dash, Object.keys(dash).join(","))
  check("dashboard SKU counts distinguish ready and sold out",
    dash.totalSkus === 3 && dash.readyToShipSkus === 2 && dash.soldOutVariantCount === 1)
  check("dashboard separates gross and net profit",
    dash.totalProfit === 1080 && dash.netProfit === 980 && dash.advertisingCost === 30,
    `gross=${dash.totalProfit} net=${dash.netProfit} advertising=${dash.advertisingCost}`)
  const rep = await getReportsData({})
  check("getReportsData executes", !!rep, Object.keys(rep).join(","))
  check("reports include advertising cost",
    rep.orders[0]?.advertisingCost === 30 && rep.orders[0]?.profit === 980)

  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail === 0 ? 0 : 1)
}

main().catch((e) => { console.error("RUNNER ERROR:", e); process.exit(1) })
