-- ============================================================================
-- clothshop — 0005_preorder_extras.sql
--
-- Hand-written `--custom` migration (registered in drizzle/meta/_journal.json,
-- applied automatically by `npm run db:migrate`) for the preorder redesign.
-- Runs after 0003 (new columns + preorder_shipments) and 0004 (drops
-- product_variants.quantity and orders.shipping_confirmed_at). Holds what
-- Drizzle cannot model:
--   1. Backfill order_items.master_cost from the existing product_cost
--   2. recalc_order() now also maintains orders.items_master_cost
--   3. recalc_preorder_shipping() + trigger on preorder_shipments, keeping
--      orders.preorder_shipping_cost = Σ cost
--   4. orders.total_cost / orders.profit regenerated to include
--      preorder_shipping_cost
--   5. Check constraint preorder_shipments.cost >= 0
--   6. Reference data: 1688 / Taobao item statuses, is_preorder flags, and
--      the "Accepted" -> "Paid" label (only where still the default text)
--
-- Idempotent: safe to re-run by hand.
-- ============================================================================

-- 1. master_cost baseline for lines that predate it: the cost they were
--    saved with is the best available record of the catalogue price.
update public.order_items
  set master_cost = product_cost
  where master_cost = 0 and product_cost <> 0;
--> statement-breakpoint

-- 2. recalc_order() — adds items_master_cost. master_cost is a plain column,
--    so the product is computed here rather than via a generated column.
create or replace function public.recalc_order(p_order uuid)
returns void language sql as $$
  update public.orders o
  set items_total = coalesce(t.tot, 0),
      items_cost = coalesce(t.cst, 0),
      items_master_cost = coalesce(t.mst, 0)
  from (
    select coalesce(sum(line_total), 0) tot,
           coalesce(sum(line_cost), 0) cst,
           coalesce(sum(master_cost * quantity), 0) mst
    from public.order_items where order_id = p_order
  ) t
  where o.id = p_order;
$$;
--> statement-breakpoint

-- 3. Preorder shipping total.
create or replace function public.recalc_preorder_shipping(p_order uuid)
returns void language sql as $$
  update public.orders o
  set preorder_shipping_cost = coalesce(
    (select sum(cost) from public.preorder_shipments where order_id = p_order),
    0
  )
  where o.id = p_order;
$$;
--> statement-breakpoint

create or replace function public.preorder_shipments_recalc_trigger()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    perform public.recalc_preorder_shipping(old.order_id);
    return old;
  end if;

  perform public.recalc_preorder_shipping(new.order_id);

  if tg_op = 'UPDATE' and old.order_id is distinct from new.order_id then
    perform public.recalc_preorder_shipping(old.order_id);
  end if;

  return new;
end $$;
--> statement-breakpoint

drop trigger if exists preorder_shipments_recalc on public.preorder_shipments;
--> statement-breakpoint
create trigger preorder_shipments_recalc
  after insert or update or delete on public.preorder_shipments
  for each row execute function public.preorder_shipments_recalc_trigger();
--> statement-breakpoint

-- 4. Regenerate total_cost / profit with the preorder shipping leg included.
--    A generated expression cannot be altered in place — drop and re-add.
alter table public.orders drop column if exists total_cost;
--> statement-breakpoint
alter table public.orders
  add column total_cost numeric(12, 2)
  generated always as (
    items_cost + shipping_cost + preorder_shipping_cost + packing_cost + advertising_cost
  ) stored;
--> statement-breakpoint

alter table public.orders drop column if exists profit;
--> statement-breakpoint
alter table public.orders
  add column profit numeric(12, 2)
  generated always as (
    items_total - items_cost - shipping_cost - preorder_shipping_cost - packing_cost - advertising_cost
  ) stored;
--> statement-breakpoint

-- Backfill the two trigger-maintained totals for existing orders.
select public.recalc_order(id) from public.orders;
--> statement-breakpoint
select public.recalc_preorder_shipping(id) from public.orders;
--> statement-breakpoint

-- 5. Check constraint.
alter table public.preorder_shipments
  drop constraint if exists preorder_shipments_cost_check;
--> statement-breakpoint
alter table public.preorder_shipments
  add constraint preorder_shipments_cost_check check (cost >= 0);
--> statement-breakpoint

-- 6. Reference data.
insert into public.order_item_statuses
  ("code", "label_th", "label_en", "sort_order", "is_default", "is_received", "is_refunded", "is_preorder", "is_active")
values
  ('preorder_1688', 'พรีออเดอร์-1688', 'Preorder-1688', 5, false, false, false, true, true),
  ('preorder_taobao', 'พรีออเดอร์-Taobao', 'Preorder-Taobao', 6, false, false, false, true, true)
on conflict ("code") do nothing;
--> statement-breakpoint

update public.order_item_statuses
  set is_preorder = true
  where code in ('preorder_shanghai', 'preorder_hk', 'preorder_other', 'preorder_1688', 'preorder_taobao');
--> statement-breakpoint

-- The enum value stays `accepted`; only the default label changes. A label
-- the owner already customised in Settings is left alone.
update public.order_status_labels
  set label_th = 'ชำระเงินแล้ว', label_en = 'Paid'
  where status = 'accepted' and label_en = 'Accepted';
