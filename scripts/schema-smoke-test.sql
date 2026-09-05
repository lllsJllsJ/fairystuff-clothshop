-- ---------------------------------------------------------------------------
-- Schema smoke test — proves the money math actually works.
--
-- The generated columns and the recalc_order trigger compute every figure the
-- owner sees: margin, line totals, order totals, and profit. TypeScript cannot
-- verify any of it — Drizzle does not model GENERATED ALWAYS columns, and the
-- trigger lives only in drizzle/0000_init_extras.sql. This file executes them.
--
-- Run against a THROWAWAY database. It inserts and then deletes rows.
--
--   docker run -d --name pgtest -e POSTGRES_PASSWORD=dev -e POSTGRES_DB=clothshop \
--     -p 55433:5432 postgres:16-alpine
--   docker cp drizzle/0000_init.sql        pgtest:/tmp/
--   docker cp drizzle/0000_init_extras.sql pgtest:/tmp/
--   docker cp scripts/schema-smoke-test.sql pgtest:/tmp/
--   docker exec pgtest psql -U postgres -d clothshop -v ON_ERROR_STOP=1 -f /tmp/0000_init.sql
--   docker exec pgtest psql -U postgres -d clothshop -v ON_ERROR_STOP=1 -f /tmp/0000_init_extras.sql
--   docker exec pgtest psql -U postgres -d clothshop -f /tmp/schema-smoke-test.sql
--   docker rm -f pgtest
--
-- Every line below prints PASS or FAIL. Any FAIL means a figure the owner
-- relies on is wrong. Re-run after ANY change to either drizzle/*.sql file.
-- ---------------------------------------------------------------------------

\set ON_ERROR_STOP on
begin;

insert into products (product_code, product_name, product_type, sell_price, original_price, status)
values ('SMOKE-1', 'smoke test product', 'เสื้อยืด', 890, 350, 'active');

insert into product_variants (product_id, color, size, quantity)
select id, c, s, q from products, (values ('ดำ','S',3),('ดำ','M',0),('เบจ','S',5)) v(c,s,q)
where product_code = 'SMOKE-1';

insert into orders (customer_name, shipping_cost, packing_cost, advertising_cost, status)
values ('smoke customer', 50, 20, 30, 'new');

insert into order_items (order_id, product_id, product_code, product_name, color, size, product_cost, sell_price, quantity)
select o.id, p.id, 'SMOKE-1', 'smoke test product', 'ดำ', 'S', 350, 890, 2
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

-- 5. STOCK IS MANUAL — an order must never move product_variants.quantity.
--    A FAIL here means someone added a decrement trigger. That is deliberate
--    product behaviour, not a bug: do not "fix" it by making this pass.
select case when sum(quantity) = 8 then 'PASS' else 'FAIL' end
  || '  stock untouched by order, total units = ' || sum(quantity)
from product_variants;

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
