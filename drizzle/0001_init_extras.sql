-- ============================================================================
-- clothshop — 0001_init_extras.sql
--
-- Hand-written companion to the drizzle-kit generated 0000_init.sql. This
-- file is a `--custom` migration registered in drizzle/meta/_journal.json,
-- so `npm run db:migrate` applies it automatically right after 0000_init.sql
-- — no separate manual step. Contains everything Drizzle cannot model
-- portably:
--   1. pg_trgm extension + the two GIN search indexes
--   2. Generated columns: products.margin, orders.total_cost, orders.profit,
--      order_items.line_total, order_items.line_cost
--   3. set_updated_at() + BEFORE UPDATE triggers on products,
--      product_variants, orders
--   4. recalc_order() + its AFTER INSERT/UPDATE/DELETE trigger on order_items
--   5. Check constraints on the two quantity columns
--   6. Reference data: order_item_statuses, the default shop_settings row,
--      order_status_labels, customer_status_labels
--
-- No RLS — with no browser-side database access (Railway Postgres has no
-- public API), RLS would guard a door nobody can reach. The server-action
-- role check (isOwner() / requireOwner()) is the actual security boundary.
-- Do not add RLS policies to these tables.
--
-- Idempotent: safe to re-run by hand during debugging.
--
-- WARNING: if drizzle/meta/ is ever deleted and `npm run db:generate` is
-- re-run, that regenerates 0000_init.sql but NOT this file — a fresh
-- 0001_init_extras.sql would need to be recreated from src/db/schema.ts's
-- own documentation of these features (see that file's header comments) and
-- re-registered with `drizzle-kit generate --custom`. Do not hand-edit
-- drizzle/meta/_journal.json to reattach an orphaned copy of this file.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. pg_trgm + search indexes
-- ----------------------------------------------------------------------------
create extension if not exists pg_trgm;
--> statement-breakpoint

create index if not exists products_product_name_trgm_idx
  on public.products using gin (product_name gin_trgm_ops);
--> statement-breakpoint

create index if not exists products_product_code_trgm_idx
  on public.products using gin (product_code gin_trgm_ops);
--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- 2. Generated columns
--
-- drizzle-kit created these as ordinary nullable numeric columns (so reads
-- type correctly from src/db/schema.ts). Converting an ordinary column into
-- a generated one requires dropping and re-adding it — there is no
-- `ALTER COLUMN ... ADD GENERATED`.
-- ----------------------------------------------------------------------------

-- products.margin = sellPrice - originalPrice
alter table public.products drop column if exists margin;
--> statement-breakpoint
alter table public.products
  add column margin numeric(12, 2)
  generated always as (sell_price - original_price) stored;
--> statement-breakpoint

-- orders.total_cost = itemsCost + shippingCost + packingCost + advertisingCost
-- orders.profit     = itemsTotal - totalCost
--
-- itemsTotal / itemsCost are plain, trigger-maintained columns (see
-- recalc_order() below) — NOT generated columns themselves, because a
-- stored generated column may not reference another generated column and
-- total_cost / profit need to be generated from them.
alter table public.orders drop column if exists total_cost;
--> statement-breakpoint
alter table public.orders
  add column total_cost numeric(12, 2)
  generated always as (items_cost + shipping_cost + packing_cost + advertising_cost) stored;
--> statement-breakpoint

alter table public.orders drop column if exists profit;
--> statement-breakpoint
alter table public.orders
  add column profit numeric(12, 2)
  generated always as (
    items_total - items_cost - shipping_cost - packing_cost - advertising_cost
  ) stored;
--> statement-breakpoint

-- order_items.line_total = sellPrice * quantity
-- order_items.line_cost  = productCost * quantity
alter table public.order_items drop column if exists line_total;
--> statement-breakpoint
alter table public.order_items
  add column line_total numeric(12, 2)
  generated always as (sell_price * quantity) stored;
--> statement-breakpoint

alter table public.order_items drop column if exists line_cost;
--> statement-breakpoint
alter table public.order_items
  add column line_cost numeric(12, 2)
  generated always as (product_cost * quantity) stored;
--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- 3. updated_at trigger — copied verbatim from carstockpro's
--    supabase/migrations/0001_init.sql (public.set_updated_at()).
-- ----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;
--> statement-breakpoint

drop trigger if exists products_set_updated_at on public.products;
--> statement-breakpoint
create trigger products_set_updated_at
  before update on public.products
  for each row execute function public.set_updated_at();
--> statement-breakpoint

drop trigger if exists product_variants_set_updated_at on public.product_variants;
--> statement-breakpoint
create trigger product_variants_set_updated_at
  before update on public.product_variants
  for each row execute function public.set_updated_at();
--> statement-breakpoint

drop trigger if exists orders_set_updated_at on public.orders;
--> statement-breakpoint
create trigger orders_set_updated_at
  before update on public.orders
  for each row execute function public.set_updated_at();
--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- 4. Order-totals recalculation — carstockpro's compute_sale_profit()
--    pattern, adapted for a multi-line order. itemsTotal/itemsCost on the
--    parent order are recomputed from the sum of line_total/line_cost on
--    order_items whenever a line is inserted, updated, or deleted.
-- ----------------------------------------------------------------------------
create or replace function public.recalc_order(p_order uuid)
returns void language sql as $$
  update public.orders o
  set items_total = coalesce(t.tot, 0), items_cost = coalesce(t.cst, 0)
  from (
    select coalesce(sum(line_total), 0) tot, coalesce(sum(line_cost), 0) cst
    from public.order_items where order_id = p_order
  ) t
  where o.id = p_order;
$$;
--> statement-breakpoint

create or replace function public.order_items_recalc_trigger()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    perform public.recalc_order(old.order_id);
    return old;
  end if;

  perform public.recalc_order(new.order_id);

  -- A line moved to a different order (order_id changed on UPDATE) also
  -- needs its old parent recalculated, or that order's totals would still
  -- include a line that no longer belongs to it.
  if tg_op = 'UPDATE' and old.order_id is distinct from new.order_id then
    perform public.recalc_order(old.order_id);
  end if;

  return new;
end $$;
--> statement-breakpoint

drop trigger if exists order_items_recalc on public.order_items;
--> statement-breakpoint
create trigger order_items_recalc
  after insert or update or delete on public.order_items
  for each row execute function public.order_items_recalc_trigger();
--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- 5. Check constraints
-- ----------------------------------------------------------------------------
alter table public.product_variants
  drop constraint if exists product_variants_quantity_check;
--> statement-breakpoint
alter table public.product_variants
  add constraint product_variants_quantity_check check (quantity >= 0);
--> statement-breakpoint

alter table public.order_items
  drop constraint if exists order_items_quantity_check;
--> statement-breakpoint
alter table public.order_items
  add constraint order_items_quantity_check check (quantity > 0);
--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- 6. Reference data — workflow labels and defaults. Not optional seed data:
--    order_items.status_code defaults to 'not_ordered' with an FK to
--    order_item_statuses.code, so a database without this row rejects every
--    order insert. Lifted verbatim from the old chain's
--    0003_red_joshua_kane.sql.
-- ----------------------------------------------------------------------------
insert into public.order_item_statuses
  ("code", "label_th", "label_en", "sort_order", "is_default", "is_received", "is_refunded", "is_active")
values
  ('not_ordered', 'ยังไม่ได้สั่ง', 'Not ordered', 0, true, false, false, true),
  ('preorder_shanghai', 'พรีออเดอร์-เซี่ยงไฮ้', 'Preorder-Shanghai', 10, false, false, false, true),
  ('preorder_hk', 'พรีออเดอร์-ฮ่องกง', 'Preorder-HK', 20, false, false, false, true),
  ('preorder_other', 'พรีออเดอร์-อื่นๆ', 'Preorder-Other', 30, false, false, false, true),
  ('received', 'ได้รับสินค้าแล้ว', 'Received', 40, false, true, false, true),
  ('refund_required', 'ต้องคืนเงิน', 'Refund required', 50, false, false, false, true),
  ('refunded', 'คืนเงินแล้ว', 'Refunded', 60, false, false, true, true);
--> statement-breakpoint

insert into public.shop_settings ("id") values ('default');
--> statement-breakpoint

insert into public.order_status_labels ("status", "label_th", "label_en")
values
  ('new', 'รับออเดอร์ใหม่', 'New'),
  ('accepted', 'รับออเดอร์แล้ว', 'Accepted'),
  ('preorder', 'กำลังพรีออเดอร์', 'Preorder'),
  ('packaging', 'กำลังแพ็ก', 'Packaging'),
  ('shipping', 'กำลังจัดส่ง', 'Shipping'),
  ('complete', 'สำเร็จ', 'Complete'),
  ('cancelled', 'ยกเลิก', 'Cancelled'),
  ('refund', 'คืนเงิน', 'Refund');
--> statement-breakpoint

insert into public.customer_status_labels ("stage", "label_th", "label_en")
values
  ('received', 'รับคำสั่งซื้อแล้ว', 'Received'),
  ('preparing', 'กำลังเตรียมสินค้า', 'Preparing'),
  ('shipping', 'กำลังจัดส่ง', 'Shipping'),
  ('complete', 'สำเร็จ', 'Complete'),
  ('cancelled', 'ยกเลิก', 'Cancelled'),
  ('refunded', 'คืนเงินแล้ว', 'Refunded');
