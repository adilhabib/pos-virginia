-- Virginia POS - Supabase PostgreSQL seed data
-- Run after database/supabase_schema.sql

begin;

insert into public.roles (id, name, permissions_json)
values
  (1, 'ADMIN', '["ALL"]'),
  (2, 'MANAGER', '["ORDERS","INVENTORY","CASH","REPORTS"]'),
  (3, 'CASHIER', '["ORDERS","CHECKOUT","CASH"]')
on conflict (id) do update set
  name = excluded.name,
  permissions_json = excluded.permissions_json;

insert into public.users (id, username, pin_hash, role_id, active)
values
  (1, 'admin', '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4', 1, 1),
  (2, 'manager', 'edee29f882543b956620b26d0ee0e7e950399b1c4222f5de05e06425b4c995e9', 2, 1),
  (3, 'cashier', '888df25ae35772424a560c7152a1de794440e0ea5cfee62828333a456a506e05', 3, 1)
on conflict (id) do update set
  username = excluded.username,
  pin_hash = excluded.pin_hash,
  role_id = excluded.role_id,
  active = excluded.active;

insert into public.menu_items (id, name, category, price_cents, active)
values
  (1, 'Classic Burger', 'Burger', 599, 1),
  (2, 'Cheese Burger', 'Burger', 699, 1),
  (3, 'Crispy Chicken Burger', 'Burger', 749, 1),
  (4, 'Fries - Regular', 'Sides', 299, 1),
  (5, 'Fries - Large', 'Sides', 399, 1),
  (6, 'Soda', 'Drinks', 199, 1),
  (7, 'Iced Tea', 'Drinks', 249, 1)
on conflict (id) do update set
  name = excluded.name,
  category = excluded.category,
  price_cents = excluded.price_cents,
  active = excluded.active;

insert into public.ingredients (id, name, unit, stock_qty, unit_cost_cents, low_stock_threshold, supplier)
values
  (1, 'Burger Bun', 'pcs', 300, 45, 40, 'Local Bakery'),
  (2, 'Beef Patty', 'pcs', 220, 220, 30, 'Prime Meats'),
  (3, 'Chicken Patty', 'pcs', 180, 180, 25, 'Poultry Supply Co'),
  (4, 'Cheese Slice', 'pcs', 250, 35, 35, 'Dairy Hub'),
  (5, 'Lettuce', 'g', 5000, 1, 800, 'Fresh Farm'),
  (6, 'Tomato', 'g', 4500, 1, 700, 'Fresh Farm'),
  (7, 'Fries Potato', 'g', 16000, 1, 2500, 'AgriFoods'),
  (8, 'Cooking Oil', 'ml', 15000, 1, 3000, 'Oil Traders'),
  (9, 'Soda Syrup', 'ml', 13000, 1, 2500, 'Beverage Partners'),
  (10, 'Tea Mix', 'g', 3000, 2, 500, 'Beverage Partners')
on conflict (id) do update set
  name = excluded.name,
  unit = excluded.unit,
  stock_qty = excluded.stock_qty,
  unit_cost_cents = excluded.unit_cost_cents,
  low_stock_threshold = excluded.low_stock_threshold,
  supplier = excluded.supplier,
  updated_at = now();

insert into public.recipes (menu_item_id, ingredient_id, qty_per_item)
values
  (1, 1, 1), (1, 2, 1), (1, 5, 20), (1, 6, 20),
  (2, 1, 1), (2, 2, 1), (2, 4, 1), (2, 5, 20), (2, 6, 20),
  (3, 1, 1), (3, 3, 1), (3, 5, 20), (3, 6, 20),
  (4, 7, 120), (4, 8, 12),
  (5, 7, 180), (5, 8, 16),
  (6, 9, 90),
  (7, 10, 12)
on conflict (menu_item_id, ingredient_id) do update set
  qty_per_item = excluded.qty_per_item;

insert into public.promotions (code, name, promo_type, value_num, cap_cents, category, start_time, end_time, days_mask, active, auto_apply)
values
  (null, 'Happy Hour 10%', 'PERCENT_TOTAL', 10, null, null, '14:00', '17:00', null, 1, 1),
  ('WELCOME5', 'Welcome PKR 5 Off', 'FIXED_TOTAL', 500, null, null, null, null, null, 1, 0),
  ('BURGER15', '15% Off Burger Category', 'CATEGORY_PERCENT', 15, null, 'Burger', null, null, null, 1, 0)
on conflict (code) do update set
  name = excluded.name,
  promo_type = excluded.promo_type,
  value_num = excluded.value_num,
  cap_cents = excluded.cap_cents,
  category = excluded.category,
  start_time = excluded.start_time,
  end_time = excluded.end_time,
  days_mask = excluded.days_mask,
  active = excluded.active,
  auto_apply = excluded.auto_apply;

commit;
