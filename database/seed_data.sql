INSERT INTO roles (name, permissions_json) VALUES
('ADMIN', '["ALL"]'),
('MANAGER', '["ORDERS","INVENTORY","CASH","REPORTS"]'),
('CASHIER', '["ORDERS","CHECKOUT","CASH"]');

INSERT INTO users (username, pin_hash, role_id, active) VALUES
('admin', '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4', 1, 1),
('manager', 'edee29f882543b956620b26d0ee0e7e950399b1c4222f5de05e06425b4c995e9', 2, 1),
('cashier', '888df25ae35772424a560c7152a1de794440e0ea5cfee62828333a456a506e05', 3, 1);

INSERT INTO menu_items (name, category, price_cents, active) VALUES
('Classic Burger', 'Burger', 599, 1),
('Cheese Burger', 'Burger', 699, 1),
('Crispy Chicken Burger', 'Burger', 749, 1),
('Fries - Regular', 'Sides', 299, 1),
('Fries - Large', 'Sides', 399, 1),
('Soda', 'Drinks', 199, 1),
('Iced Tea', 'Drinks', 249, 1);

INSERT INTO ingredients (name, unit, stock_qty, unit_cost_cents, low_stock_threshold, supplier) VALUES
('Burger Bun', 'pcs', 300, 45, 40, 'Local Bakery'),
('Beef Patty', 'pcs', 220, 220, 30, 'Prime Meats'),
('Chicken Patty', 'pcs', 180, 180, 25, 'Poultry Supply Co'),
('Cheese Slice', 'pcs', 250, 35, 35, 'Dairy Hub'),
('Lettuce', 'g', 5000, 1, 800, 'Fresh Farm'),
('Tomato', 'g', 4500, 1, 700, 'Fresh Farm'),
('Fries Potato', 'g', 16000, 1, 2500, 'AgriFoods'),
('Cooking Oil', 'ml', 15000, 1, 3000, 'Oil Traders'),
('Soda Syrup', 'ml', 13000, 1, 2500, 'Beverage Partners'),
('Tea Mix', 'g', 3000, 2, 500, 'Beverage Partners');

INSERT INTO recipes (menu_item_id, ingredient_id, qty_per_item) VALUES
(1, 1, 1), (1, 2, 1), (1, 5, 20), (1, 6, 20),
 (2, 1, 1), (2, 2, 1), (2, 4, 1), (2, 5, 20), (2, 6, 20),
 (3, 1, 1), (3, 3, 1), (3, 5, 20), (3, 6, 20),
 (4, 7, 120), (4, 8, 12),
 (5, 7, 180), (5, 8, 16),
 (6, 9, 90),
 (7, 10, 12);
