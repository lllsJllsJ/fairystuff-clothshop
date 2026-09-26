-- ============================================================================
-- clothshop — 0007_backfill_shipment_items.sql  (hand-written --custom,
-- journaled; applied automatically by `npm run db:migrate`)
--
-- Preorder shipments moved from per-ORDER to per-LINE-ITEM (each item may be
-- a different lot). 0006 added preorder_shipments.order_item_id as nullable;
-- this assigns any parcel logged before that to its order's first line item
-- (by sort_order) so 0008 can make the column NOT NULL. Parcels on an order
-- with no line items at all cannot be attributed and are removed — the
-- order_items FK cascade would have removed them anyway had the items been
-- deleted after the fact. Idempotent.
-- ============================================================================

update public.preorder_shipments s
  set order_item_id = (
    select oi.id from public.order_items oi
    where oi.order_id = s.order_id
    order by oi.sort_order, oi.created_at
    limit 1
  )
  where s.order_item_id is null;
--> statement-breakpoint

delete from public.preorder_shipments where order_item_id is null;
