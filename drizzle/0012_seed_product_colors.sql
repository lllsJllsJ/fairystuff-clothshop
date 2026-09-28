-- ============================================================================
-- clothshop — 0012_seed_product_colors.sql  (hand-written --custom,
-- journaled; applied automatically by `npm run db:migrate`)
--
-- Colour names are English-only (src/lib/colors.ts). This:
--   1. converts Thai colour names already on product variants and image
--      colour tags to English (ขาว -> White, ...), and snaps a known English
--      name to its canonical spelling (purple -> Purple). A variant whose
--      converted name already exists on the same product + size is left as
--      it was rather than violating the (product, colour, size) key.
--      order_items.color is a snapshot and is NOT touched.
--   2. seeds the palette (0011) with the presets the product editor used to
--      hard-code, then every colour now on a variant ("-" sentinel excluded).
--
-- Keep the mapping below in step with THAI_COLOR_TO_ENGLISH. Idempotent.
-- ============================================================================

drop table if exists pg_temp.color_map;
--> statement-breakpoint

create temporary table color_map (src text primary key, en text not null);
--> statement-breakpoint

insert into color_map (src, en) values
  ('ดำ', 'Black'), ('สีดำ', 'Black'), ('ขาว', 'White'), ('สีขาว', 'White'),
  ('เทา', 'Grey'), ('ชมพู', 'Pink'), ('แดง', 'Red'), ('ส้ม', 'Orange'),
  ('เหลือง', 'Yellow'), ('เขียว', 'Green'), ('ฟ้า', 'Light Blue'),
  ('น้ำเงิน', 'Blue'), ('กรม', 'Navy'), ('กรมท่า', 'Navy'), ('ม่วง', 'Purple'),
  ('น้ำตาล', 'Brown'), ('ครีม', 'Cream'), ('เบจ', 'Beige'), ('ทอง', 'Gold'),
  ('เงิน', 'Silver'), ('หลายสี', 'Multicolor');
--> statement-breakpoint

-- Canonical English spellings, matched case-insensitively.
insert into color_map (src, en)
  select distinct lower(en), en from color_map
  on conflict (src) do nothing;
--> statement-breakpoint

do $$
declare
  r record;
begin
  for r in
    select v.id, m.en
    from public.product_variants v
    join color_map m on m.src = btrim(v.color) or m.src = lower(btrim(v.color))
    where v.color <> m.en
  loop
    begin
      update public.product_variants set color = r.en, updated_at = now() where id = r.id;
    exception when unique_violation then
      null; -- same product + size already has the English name; keep this row as is
    end;
  end loop;
end $$;
--> statement-breakpoint

update public.product_images i
  set color = m.en
  from color_map m
  where (m.src = btrim(i.color) or m.src = lower(btrim(i.color))) and i.color <> m.en;
--> statement-breakpoint

insert into public.product_colors (name, sort_order)
  values ('Black', 0), ('White', 1), ('Pink', 2), ('Yellow', 3), ('Grey', 4), ('Blue', 5)
  on conflict (name) do nothing;
--> statement-breakpoint

insert into public.product_colors (name, sort_order)
  select c.color, 5 + row_number() over (order by c.first_seen, c.color)
  from (
    select color, min(created_at) as first_seen
    from public.product_variants
    where color <> '-' and btrim(color) <> ''
    group by color
  ) c
  on conflict (name) do nothing;
--> statement-breakpoint

drop table if exists pg_temp.color_map;
