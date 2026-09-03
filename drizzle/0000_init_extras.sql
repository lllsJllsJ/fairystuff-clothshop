-- ============================================================================
-- clothshop — 0000_init_extras.sql
--
-- Hand-written companion to the drizzle-kit generated 0000_init.sql. Apply
-- this AFTER 0000_init.sql. Contains everything Drizzle cannot model
-- portably (plan §4):
--   1. pg_trgm extension + the two GIN search indexes
--   2. Generated columns: products.margin, orders.total_cost, orders.profit,
--      order_items.line_total, order_items.line_cost
--   3. set_updated_at() + BEFORE UPDATE triggers on products,
--      product_variants, orders
--   4. recalc_order() + its AFTER INSERT/UPDATE/DELETE trigger on order_items
--   5. Check constraints on the two quantity columns
--
-- No RLS — see plan §4 / §15 Risk 1: with no browser-side database access
-- (Neon has no public API), RLS would guard a door nobody can reach. The
-- server-action role check (requireOwner() + the 5-step action shape) is
-- the actual security boundary. Do not add RLS policies to these tables.
--
-- Idempotent: safe to re-run.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. pg_trgm + search indexes
-- ----------------------------------------------------------------------------
create extension if not exists pg_trgm;

create index if not exists products_product_name_trgm_idx
  on public.products using gin (product_name gin_trgm_ops);

create index if not exists products_product_code_trgm_idx
  on public.products using gin (product_code gin_trgm_ops);

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
alter table public.products
  add column margin numeric(12, 2)
  generated always as (sell_price - original_price) stored;

-- orders.total_cost = itemsCost + shippingCost + packingCost
-- orders.profit     = itemsTotal - itemsCost - shippingCost - packingCost
--
-- itemsTotal / itemsCost are plain, trigger-maintained columns (see
-- recalc_order() below) — NOT generated columns themselves, because a
-- stored generated column may not reference another generated column and
-- total_cost / profit need to be generated from them.
alter table public.orders drop column if exists total_cost;
alter table public.orders
  add column total_cost numeric(12, 2)
  generated always as (items_cost + shipping_cost + packing_cost) stored;

alter table public.orders drop column if exists profit;
alter table public.orders
  add column profit numeric(12, 2)
  generated always as (
    items_total - items_cost - shipping_cost - packing_cost
  ) stored;

-- order_items.line_total = sellPrice * quantity
-- order_items.line_cost  = productCost * quantity
alter table public.order_items drop column if exists line_total;
alter table public.order_items
  add column line_total numeric(12, 2)
  generated always as (sell_price * quantity) stored;

alter table public.order_items drop column if exists line_cost;
alter table public.order_items
  add column line_cost numeric(12, 2)
  generated always as (product_cost * quantity) stored;

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

drop trigger if exists products_set_updated_at on public.products;
create trigger products_set_updated_at
  before update on public.products
  for each row execute function public.set_updated_at();

drop trigger if exists product_variants_set_updated_at on public.product_variants;
create trigger product_variants_set_updated_at
  before update on public.product_variants
  for each row execute function public.set_updated_at();

drop trigger if exists orders_set_updated_at on public.orders;
create trigger orders_set_updated_at
  before update on public.orders
  for each row execute function public.set_updated_at();

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

drop trigger if exists order_items_recalc on public.order_items;
create trigger order_items_recalc
  after insert or update or delete on public.order_items
  for each row execute function public.order_items_recalc_trigger();

-- ----------------------------------------------------------------------------
-- 5. Check constraints
-- ----------------------------------------------------------------------------
alter table public.product_variants
  drop constraint if exists product_variants_quantity_check;
alter table public.product_variants
  add constraint product_variants_quantity_check check (quantity >= 0);

alter table public.order_items
  drop constraint if exists order_items_quantity_check;
alter table public.order_items
  add constraint order_items_quantity_check check (quantity > 0);
