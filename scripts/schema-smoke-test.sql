-- ---------------------------------------------------------------------------
-- Schema smoke test — proves the money math actually works.
--
-- The generated columns and the recalc_order / recalc_preorder_shipping
-- triggers compute every figure the owner sees: margin, line totals, order
-- totals, actual-vs-master cost, preorder shipping, and profit. TypeScript
-- cannot verify any of it — Drizzle does not model GENERATED ALWAYS columns,
-- and the triggers live only in drizzle/0001_init_extras.sql and
-- drizzle/0005_preorder_extras.sql. This file executes them.
--
-- Run against a THROWAWAY database. It inserts and then deletes rows.
--
--   docker run -d --name pgtest -e POSTGRES_PASSWORD=dev -e POSTGRES_DB=clothshop \
--     -p 55433:5432 postgres:16-alpine
--   (apply every drizzle/NNNN_*.sql in order, then this file — or just run
--   `npm run smoke`, which does exactly that in a throwaway container)
--   docker rm -f pgtest
--
-- Every line below prints PASS or FAIL. Any FAIL means a figure the owner
-- relies on is wrong. Re-run after ANY change to either drizzle/*.sql file.
-- ---------------------------------------------------------------------------

\set ON_ERROR_STOP on
begin;

insert into products (product_code, product_name, product_type, sell_price, original_price, status)
values ('SMOKE-1', 'smoke test product', 'เสื้อยืด', 890, 350, 'active');

insert into product_variants (product_id, color, size, is_available)
select id, c, s, a from products, (values ('ดำ','S',true),('ดำ','M',false),('เบจ','S',true)) v(c,s,a)
where product_code = 'SMOKE-1';

insert into orders (customer_name, preorder_code, shipping_cost, packing_cost, advertising_cost, status)
values ('smoke customer', 'PO-SMOKE00001', 50, 20, 30, 'new');

insert into order_items (order_id, product_id, product_code, product_name, color, size, product_cost, master_cost, sell_price, quantity)
select o.id, p.id, 'SMOKE-1', 'smoke test product', 'ดำ', 'S', 350, 350, 890, 2
from orders o, products p where p.product_code = 'SMOKE-1';

-- 1. products.margin = sell_price - original_price
select case when margin = 540.00 then 'PASS' else 'FAIL' end || '  margin = ' || margin
from products where product_code = 'SMOKE-1';

-- 2. order_items.line_total / line_cost
select case when line_total = 1780.00 and line_cost = 700.00 then 'PASS' else 'FAIL' end
  || '  line_total=' || line_total || ' line_cost=' || line_cost
from order_items where product_code = 'SMOKE-1';

-- 3. orders totals: trigger-maintained items_*, generated total_cost/profit
select case when items_total = 1780.00 and items_cost = 700.00
             and total_cost = 800.00 and profit = 980.00
            then 'PASS' else 'FAIL' end
  || '  items_total=' || items_total || ' total_cost=' || total_cost || ' profit=' || profit
from orders;

-- 4. changing a line quantity recomputes the order
update order_items set quantity = 5 where product_code = 'SMOKE-1';
select case when items_total = 4450.00 and profit = 2600.00 then 'PASS' else 'FAIL' end
  || '  after qty change: items_total=' || items_total || ' profit=' || profit
from orders;

-- 4b. actual cost override: items_cost follows product_cost, while
--     items_master_cost stays on the master snapshot.
update order_items set product_cost = 400 where product_code = 'SMOKE-1';
select case when items_cost = 2000.00 and items_master_cost = 1750.00 and profit = 2350.00
            then 'PASS' else 'FAIL' end
  || '  actual vs master: items_cost=' || items_cost || ' master=' || items_master_cost
  || ' profit=' || profit
from orders;

-- 4c. preorder shipping legs roll into preorder_shipping_cost, total_cost, profit
insert into preorder_shipments (order_id, order_item_id, leg, tracking_no, cost)
select order_id, id, 'cn_cn'::preorder_leg, 'YT1', 35 from order_items where product_code = 'SMOKE-1'
union all
select order_id, id, 'cn_th'::preorder_leg, 'CNTH1', 120 from order_items where product_code = 'SMOKE-1';
select case when preorder_shipping_cost = 155.00 and total_cost = 2255.00 and profit = 2195.00
            then 'PASS' else 'FAIL' end
  || '  preorder legs: preorder_shipping_cost=' || preorder_shipping_cost
  || ' total_cost=' || total_cost || ' profit=' || profit
from orders;

delete from preorder_shipments where leg = 'cn_th';
select case when preorder_shipping_cost = 35.00 and profit = 2315.00 then 'PASS' else 'FAIL' end
  || '  after deleting a leg: preorder_shipping_cost=' || preorder_shipping_cost || ' profit=' || profit
from orders;

-- 4d. a negative shipment cost is rejected by the check constraint
do $$
begin
  begin
    insert into preorder_shipments (order_id, order_item_id, leg, cost)
      select order_id, id, 'th_th', -1 from order_items where product_code = 'SMOKE-1';
    raise notice 'FAIL  negative preorder shipment cost was accepted';
  exception when check_violation then
    raise notice 'PASS  negative preorder shipment cost rejected';
  end;
end $$;

-- 4e. parcels belong to a line item: deleting the line removes its parcels
--     (and the order's preorder_shipping_cost follows via the trigger)
insert into order_items (order_id, product_code, product_name, product_cost, master_cost, sell_price, quantity)
select id, 'SMOKE-2', 'second lot', 100, 100, 200, 1 from orders;
insert into preorder_shipments (order_id, order_item_id, leg, cost)
select order_id, id, 'cn_cn', 10 from order_items where product_code = 'SMOKE-2';
delete from order_items where product_code = 'SMOKE-2';
select case when preorder_shipping_cost = 35.00
             and (select count(*) from preorder_shipments) = 1
            then 'PASS' else 'FAIL' end
  || '  line delete cascades its parcels: preorder_shipping_cost=' || preorder_shipping_cost
from orders;

-- 5. AVAILABILITY IS MANUAL — an order must never flip is_available.
--    A FAIL here means someone added an order-driven toggle. That is
--    deliberate product behaviour, not a bug.
select case when count(*) filter (where is_available) = 2 then 'PASS' else 'FAIL' end
  || '  availability untouched by order, available variants = '
  || count(*) filter (where is_available)
from product_variants;

-- 5b. ORDER HISTORY IS A SNAPSHOT — repricing the product (as an import
--     upsert does) must not move any figure on an existing order.
update products set sell_price = 999, original_price = 500 where product_code = 'SMOKE-1';
select case when oi.sell_price = 890.00 and oi.product_cost = 400.00 and oi.master_cost = 350.00
             and o.items_total = 4450.00 and o.profit = 2315.00
            then 'PASS' else 'FAIL' end
  || '  order unchanged after product reprice: sell=' || oi.sell_price
  || ' actual=' || oi.product_cost || ' master=' || oi.master_cost || ' profit=' || o.profit
from order_items oi join orders o on o.id = oi.order_id
where oi.product_code = 'SMOKE-1';

-- 6. order history survives deleting the product (snapshot, not FK — Risk 4)
delete from products where product_code = 'SMOKE-1';
select case when count(*) = 1 and bool_and(product_id is null) then 'PASS' else 'FAIL' end
  || '  order line survived product delete, product_id nulled'
from order_items where product_code = 'SMOKE-1';

-- 7. cancelled and fully refunded orders are excluded from revenue
update orders set status = 'cancelled';
select case when coalesce(sum(oi.line_total), 0) = 0 then 'PASS' else 'FAIL' end
  || '  revenue excluding cancelled/refund = ' || coalesce(sum(oi.line_total), 0)
from order_items oi join orders o on o.id = oi.order_id
where o.status not in ('cancelled', 'refund');

-- 8. deleting an order cascades to its line items
delete from orders;
select case when count(*) = 0 then 'PASS' else 'FAIL' end
  || '  orphaned order_items after order delete = ' || count(*)
from order_items;

rollback;
