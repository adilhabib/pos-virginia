const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const Database = require("better-sqlite3");

const DB_PATH = path.join(__dirname, "database", "pos.db");
const SCHEMA_PATH = path.join(__dirname, "database", "schema.sql");
const SEED_PATH = path.join(__dirname, "database", "seed_data.sql");
const BACKUP_DIR = path.join(__dirname, "backup", "daily_backups");
const RECEIPTS_DIR = path.join(__dirname, "backup", "receipts");

let db;

function ensureDirectories() {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  fs.mkdirSync(RECEIPTS_DIR, { recursive: true });
}

function hashPin(pin) {
  return crypto.createHash("sha256").update(String(pin)).digest("hex");
}

function userRole(userId) {
  if (!userId) return null;
  const row = db
    .prepare(
      `SELECT r.name AS role
       FROM users u
       JOIN roles r ON r.id = u.role_id
       WHERE u.id = ? AND u.active = 1`
    )
    .get(userId);
  return row ? row.role : null;
}

function isAdminOrManager(userId) {
  const role = userRole(userId);
  return role === "ADMIN" || role === "MANAGER";
}

function runSqlScript(filePath) {
  const sql = fs.readFileSync(filePath, "utf8");
  db.exec(sql);
}

function initDb() {
  ensureDirectories();
  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  runSqlScript(SCHEMA_PATH);
  ensureSchemaMigrations();

  const hasUsers = db.prepare("SELECT COUNT(*) AS count FROM users").get().count > 0;
  if (!hasUsers && fs.existsSync(SEED_PATH)) {
    runSqlScript(SEED_PATH);
  }
}

function ensureSchemaMigrations() {
  const orderCols = db.prepare("PRAGMA table_info(orders)").all().map((c) => c.name);
  if (!orderCols.includes("discount_cents")) {
    db.exec("ALTER TABLE orders ADD COLUMN discount_cents INTEGER NOT NULL DEFAULT 0");
  }
  if (!orderCols.includes("customer_name")) {
    db.exec("ALTER TABLE orders ADD COLUMN customer_name TEXT");
  }
  if (!orderCols.includes("customer_phone")) {
    db.exec("ALTER TABLE orders ADD COLUMN customer_phone TEXT");
  }
  const cashSessionCols = db.prepare("PRAGMA table_info(cash_sessions)").all().map((c) => c.name);
  if (!cashSessionCols.includes("denomination_json")) {
    db.exec("ALTER TABLE cash_sessions ADD COLUMN denomination_json TEXT");
  }
  const ingredientCols = db.prepare("PRAGMA table_info(ingredients)").all().map((c) => c.name);
  if (!ingredientCols.includes("unit_cost_cents")) {
    db.exec("ALTER TABLE ingredients ADD COLUMN unit_cost_cents INTEGER NOT NULL DEFAULT 0");
  }
}

function writeAudit(userId, action, payload = null) {
  db.prepare(
    `INSERT INTO audit_logs (user_id, action, payload_json, created_at)
     VALUES (?, ?, ?, datetime('now'))`
  ).run(userId || null, action, payload ? JSON.stringify(payload) : null);
}

function currentCashSessionId() {
  const row = db
    .prepare("SELECT id FROM cash_sessions WHERE status='OPEN' ORDER BY id DESC LIMIT 1")
    .get();
  return row ? row.id : null;
}

function makeBackupIfNeeded() {
  const date = new Date().toISOString().slice(0, 10);
  const backupPath = path.join(BACKUP_DIR, `pos-${date}.db`);
  if (!fs.existsSync(backupPath) && fs.existsSync(DB_PATH)) {
    fs.copyFileSync(DB_PATH, backupPath);
  }
}

function getMenuItems() {
  return db
    .prepare(
      `SELECT id, name, category, price_cents, active
       FROM menu_items
       WHERE active = 1
       ORDER BY category, name`
    )
    .all();
}

function getAllMenuItems() {
  return db
    .prepare(
      `SELECT id, name, category, price_cents, active
       FROM menu_items
       ORDER BY category, name`
    )
    .all();
}

function verifyStockForOrder(orderId) {
  const shortages = db
    .prepare(
      `SELECT i.id AS ingredient_id,
              i.name AS ingredient_name,
              i.stock_qty AS current_stock,
              SUM(r.qty_per_item * oi.quantity) AS required_qty
       FROM order_items oi
       JOIN recipes r ON r.menu_item_id = oi.menu_item_id
       JOIN ingredients i ON i.id = r.ingredient_id
       WHERE oi.order_id = ?
       GROUP BY i.id, i.name, i.stock_qty
       HAVING required_qty > current_stock`
    )
    .all(orderId);
  return shortages;
}

function recalcOrderTotals(orderId) {
  const subtotal = db
    .prepare("SELECT COALESCE(SUM(line_total_cents),0) AS subtotal FROM order_items WHERE order_id = ?")
    .get(orderId).subtotal;
  const order = db.prepare("SELECT discount_cents FROM orders WHERE id = ?").get(orderId);
  const discount = Math.max(0, Math.min(Number(order?.discount_cents || 0), Number(subtotal || 0)));
  const total = Number(subtotal || 0) - discount;

  db.prepare(
    `UPDATE orders
     SET subtotal_cents = ?,
         discount_cents = ?,
         tax_cents = 0,
         total_cents = ?,
         updated_at = datetime('now')
     WHERE id = ?`
  ).run(subtotal, discount, total, orderId);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function buildReceiptData(orderId) {
  const order = db
    .prepare(
      `SELECT o.*, u.username AS cashier
       FROM orders o
       LEFT JOIN users u ON u.id = o.cashier_user_id
       WHERE o.id = ?`
    )
    .get(orderId);
  if (!order) return null;

  const items = db
    .prepare(
      `SELECT oi.quantity, oi.unit_price_cents, oi.line_total_cents, mi.name AS item_name
       FROM order_items oi
       JOIN menu_items mi ON mi.id = oi.menu_item_id
       WHERE oi.order_id = ?`
    )
    .all(orderId);

  const payment = db
    .prepare(
      `SELECT method, amount_cents, received_cents, change_cents, created_at
       FROM payments
       WHERE order_id = ?
       ORDER BY id DESC
       LIMIT 1`
    )
    .get(orderId);

  return { order, items, payment };
}

function centsToMoney(cents) {
  return new Intl.NumberFormat("en-PK", {
    style: "currency",
    currency: "PKR",
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(Number(cents || 0) / 100);
}

function receiptHtml(data) {
  const { order, items, payment } = data;
  const rows = items
    .map(
      (item) => `
      <tr>
        <td>${escapeHtml(item.item_name)} x${item.quantity}</td>
        <td style="text-align:right">${centsToMoney(item.line_total_cents)}</td>
      </tr>`
    )
    .join("");

  return `<!doctype html>
  <html>
    <head>
      <meta charset="UTF-8" />
      <style>
        body { font-family: Arial, sans-serif; padding: 10px; font-size: 12px; color: #111; }
        h2 { margin: 0 0 6px; font-size: 16px; }
        .muted { color: #666; margin: 2px 0; }
        table { width: 100%; border-collapse: collapse; margin-top: 8px; }
        td { padding: 4px 0; border-bottom: 1px dashed #ddd; vertical-align: top; }
        .totals { margin-top: 8px; }
        .line { display: flex; justify-content: space-between; margin: 3px 0; }
        .total { font-weight: 700; font-size: 14px; margin-top: 6px; }
      </style>
    </head>
    <body>
      <h2>Virginia POS Receipt</h2>
      <div class="muted">Order #${order.id}</div>
      <div class="muted">Cashier: ${escapeHtml(order.cashier || "-")}</div>
      <div class="muted">Date: ${escapeHtml(payment?.created_at || order.updated_at || order.created_at)}</div>
      <div class="muted">Customer: ${escapeHtml(order.customer_name || "Guest")}</div>
      <div class="muted">Phone: ${escapeHtml(order.customer_phone || "-")}</div>
      <table><tbody>${rows}</tbody></table>
      <div class="totals">
        <div class="line"><span>Subtotal</span><span>${centsToMoney(order.subtotal_cents)}</span></div>
        <div class="line"><span>Discount</span><span>${centsToMoney(order.discount_cents)}</span></div>
        <div class="line total"><span>Total</span><span>${centsToMoney(order.total_cents)}</span></div>
        <div class="line"><span>Cash Received</span><span>${centsToMoney(payment?.received_cents)}</span></div>
        <div class="line"><span>Change</span><span>${centsToMoney(payment?.change_cents)}</span></div>
      </div>
    </body>
  </html>`;
}

async function generateReceiptPdf(orderId) {
  const data = buildReceiptData(orderId);
  if (!data) throw new Error("Order not found for receipt.");

  const printWin = new BrowserWindow({
    width: 360,
    height: 700,
    show: false,
    webPreferences: {
      sandbox: true
    }
  });

  try {
    const html = receiptHtml(data);
    await printWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

    let pdf;
    try {
      pdf = await printWin.webContents.printToPDF({
        printBackground: true,
        pageSize: "A6"
      });
    } catch (_) {
      pdf = await printWin.webContents.printToPDF({
        printBackground: true
      });
    }

    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filePath = path.join(RECEIPTS_DIR, `receipt-order-${orderId}-${stamp}.pdf`);
    fs.writeFileSync(filePath, pdf);

    try {
      await new Promise((resolve) => {
        printWin.webContents.print({ silent: false, printBackground: true }, () => resolve());
      });
    } catch (_) {
      void 0;
    }

    return filePath;
  } finally {
    if (!printWin.isDestroyed()) printWin.destroy();
  }
}

function createMainWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  win.loadFile(path.join(__dirname, "renderer", "index.html"));
}

function registerIpc() {
  ipcMain.handle("auth:login", (_, payload) => {
    const { username, pin } = payload;
    const user = db
      .prepare(
        `SELECT u.id, u.username, u.pin_hash, r.name AS role
         FROM users u
         JOIN roles r ON r.id = u.role_id
         WHERE u.username = ? AND u.active = 1`
      )
      .get(username);

    if (!user || user.pin_hash !== hashPin(pin)) {
      return { ok: false, error: "Invalid username or PIN." };
    }

    writeAudit(user.id, "LOGIN_SUCCESS", { username });
    return {
      ok: true,
      user: { id: user.id, username: user.username, role: user.role }
    };
  });

  ipcMain.handle("menu:list", (_, payload = {}) => {
    const { userId, includeInactive } = payload || {};
    if (includeInactive) {
      if (!isAdminOrManager(userId)) return { ok: false, error: "Only admin/manager can manage menu." };
      return { ok: true, items: getAllMenuItems() };
    }
    return { ok: true, items: getMenuItems() };
  });

  ipcMain.handle("menu:create", (_, payload = {}) => {
    const { userId, name, category, priceCents, active } = payload;
    if (!isAdminOrManager(userId)) return { ok: false, error: "Only admin/manager can create menu items." };
    if (!name || !category) return { ok: false, error: "Name and category are required." };
    const price = Number(priceCents);
    if (!Number.isFinite(price) || price < 0) return { ok: false, error: "Invalid price." };

    const result = db
      .prepare(
        `INSERT INTO menu_items (name, category, price_cents, active)
         VALUES (?, ?, ?, ?)`
      )
      .run(String(name).trim(), String(category).trim(), Math.round(price), active ? 1 : 0);

    writeAudit(userId, "MENU_ITEM_CREATED", { menuItemId: result.lastInsertRowid, name, category, priceCents: price });
    return { ok: true, id: result.lastInsertRowid };
  });

  ipcMain.handle("menu:update", (_, payload = {}) => {
    const { userId, menuItemId, name, category, priceCents, active } = payload;
    if (!isAdminOrManager(userId)) return { ok: false, error: "Only admin/manager can update menu items." };

    const item = db.prepare("SELECT id FROM menu_items WHERE id = ?").get(menuItemId);
    if (!item) return { ok: false, error: "Menu item not found." };

    const updates = [];
    const values = [];
    if (name != null) {
      updates.push("name = ?");
      values.push(String(name).trim());
    }
    if (category != null) {
      updates.push("category = ?");
      values.push(String(category).trim());
    }
    if (priceCents != null) {
      const price = Number(priceCents);
      if (!Number.isFinite(price) || price < 0) return { ok: false, error: "Invalid price." };
      updates.push("price_cents = ?");
      values.push(Math.round(price));
    }
    if (active != null) {
      updates.push("active = ?");
      values.push(active ? 1 : 0);
    }
    if (!updates.length) return { ok: false, error: "No fields to update." };

    values.push(menuItemId);
    db.prepare(`UPDATE menu_items SET ${updates.join(", ")} WHERE id = ?`).run(...values);
    writeAudit(userId, "MENU_ITEM_UPDATED", { menuItemId, name, category, priceCents, active });
    return { ok: true };
  });

  ipcMain.handle("orders:create", (_, { cashierUserId, notes }) => {
    const openSessionId = currentCashSessionId();
    if (!openSessionId) return { ok: false, error: "Open a cash shift before creating orders." };
    const stmt = db.prepare(
      `INSERT INTO orders
       (status, subtotal_cents, tax_cents, total_cents, cashier_user_id, notes, created_at, updated_at)
       VALUES ('DRAFT', 0, 0, 0, ?, ?, datetime('now'), datetime('now'))`
    );
    const result = stmt.run(cashierUserId, notes || null);
    writeAudit(cashierUserId, "ORDER_CREATED", { orderId: result.lastInsertRowid });
    return { ok: true, orderId: result.lastInsertRowid };
  });

  ipcMain.handle("orders:get", (_, { orderId }) => {
    const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId);
    if (!order) return { ok: false, error: "Order not found." };
    const items = db
      .prepare(
        `SELECT oi.id, oi.order_id, oi.menu_item_id, oi.quantity, oi.unit_price_cents, oi.line_total_cents, oi.modifiers_json,
                mi.name AS item_name, mi.category
         FROM order_items oi
         JOIN menu_items mi ON mi.id = oi.menu_item_id
         WHERE oi.order_id = ?`
      )
      .all(orderId);
    return { ok: true, order, items };
  });

  ipcMain.handle("orders:add-item", (_, { orderId, menuItemId, quantity, modifiers }) => {
    const order = db.prepare("SELECT id, status FROM orders WHERE id = ?").get(orderId);
    if (!order) return { ok: false, error: "Order not found." };
    if (order.status !== "DRAFT" && order.status !== "HOLD") {
      return { ok: false, error: "Only DRAFT/HOLD orders can be edited." };
    }

    const menuItem = db.prepare("SELECT id, price_cents FROM menu_items WHERE id = ?").get(menuItemId);
    if (!menuItem) return { ok: false, error: "Menu item not found." };

    const qty = Number(quantity || 1);
    if (qty <= 0) return { ok: false, error: "Quantity must be positive." };

    const existing = db
      .prepare(
        `SELECT id, quantity
         FROM order_items
         WHERE order_id = ? AND menu_item_id = ? AND modifiers_json IS NULL
         LIMIT 1`
      )
      .get(orderId, menuItemId);

    if (existing) {
      const newQty = existing.quantity + qty;
      db.prepare(
        `UPDATE order_items
         SET quantity = ?, line_total_cents = ? * ?
         WHERE id = ?`
      ).run(newQty, menuItem.price_cents, newQty, existing.id);
    } else {
      const lineTotal = menuItem.price_cents * qty;
      db.prepare(
        `INSERT INTO order_items
         (order_id, menu_item_id, quantity, unit_price_cents, line_total_cents, modifiers_json)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(orderId, menuItemId, qty, menuItem.price_cents, lineTotal, modifiers ? JSON.stringify(modifiers) : null);
    }

    recalcOrderTotals(orderId);

    return { ok: true };
  });

  ipcMain.handle("orders:update-item-qty", (_, { orderId, orderItemId, quantity }) => {
    const order = db.prepare("SELECT id, status FROM orders WHERE id = ?").get(orderId);
    if (!order) return { ok: false, error: "Order not found." };
    if (order.status !== "DRAFT" && order.status !== "HOLD") {
      return { ok: false, error: "Only DRAFT/HOLD orders can be edited." };
    }

    const item = db
      .prepare("SELECT id, unit_price_cents FROM order_items WHERE id = ? AND order_id = ?")
      .get(orderItemId, orderId);
    if (!item) return { ok: false, error: "Order item not found." };

    const qty = Number(quantity);
    if (qty <= 0) {
      db.prepare("DELETE FROM order_items WHERE id = ?").run(orderItemId);
    } else {
      db.prepare(
        `UPDATE order_items
         SET quantity = ?, line_total_cents = ? * ?
         WHERE id = ?`
      ).run(qty, item.unit_price_cents, qty, orderItemId);
    }

    recalcOrderTotals(orderId);
    return { ok: true };
  });

  ipcMain.handle("orders:update-discount", (_, { orderId, discountCents, userId }) => {
    const order = db.prepare("SELECT id, status, subtotal_cents FROM orders WHERE id = ?").get(orderId);
    if (!order) return { ok: false, error: "Order not found." };
    if (order.status === "PAID" || order.status === "CANCELLED") {
      return { ok: false, error: "Discount can be updated only before payment/cancel." };
    }

    const requested = Math.round(Number(discountCents || 0));
    if (!Number.isFinite(requested) || requested < 0) return { ok: false, error: "Invalid discount amount." };
    const discount = Math.min(requested, Number(order.subtotal_cents || 0));
    const total = Number(order.subtotal_cents || 0) - discount;

    db.prepare(
      `UPDATE orders
       SET discount_cents = ?, tax_cents = 0, total_cents = ?, updated_at = datetime('now')
       WHERE id = ?`
    ).run(discount, total, orderId);

    writeAudit(userId || null, "ORDER_DISCOUNT_UPDATED", { orderId, discountCents: discount });
    return { ok: true, discountCents: discount, totalCents: total };
  });

  ipcMain.handle("orders:update-customer", (_, { orderId, customerName, customerPhone, userId }) => {
    const order = db.prepare("SELECT id, status FROM orders WHERE id = ?").get(orderId);
    if (!order) return { ok: false, error: "Order not found." };
    if (order.status !== "DRAFT" && order.status !== "HOLD") {
      return { ok: false, error: "Customer details can be updated only for DRAFT/HOLD orders." };
    }

    db.prepare(
      `UPDATE orders
       SET customer_name = ?, customer_phone = ?, updated_at = datetime('now')
       WHERE id = ?`
    ).run(
      customerName ? String(customerName).trim() : null,
      customerPhone ? String(customerPhone).trim() : null,
      orderId
    );
    writeAudit(userId || null, "ORDER_CUSTOMER_UPDATED", { orderId, customerName, customerPhone });
    return { ok: true };
  });

  ipcMain.handle("orders:update-status", (_, { orderId, status, userId }) => {
    const allowed = ["DRAFT", "HOLD", "CANCELLED", "FINALIZED", "PAID"];
    if (!allowed.includes(status)) return { ok: false, error: "Invalid status." };

    const order = db.prepare("SELECT * FROM orders WHERE id=?").get(orderId);
    if (!order) return { ok: false, error: "Order not found." };

    if (status === "FINALIZED" && order.status !== "FINALIZED" && order.status !== "PAID") {
      const shortages = verifyStockForOrder(orderId);
      if (shortages.length) {
        return {
          ok: false,
          error: "Insufficient stock.",
          shortages
        };
      }

      const items = db
        .prepare("SELECT menu_item_id, quantity FROM order_items WHERE order_id = ?")
        .all(orderId);

      const deductTxn = db.transaction(() => {
        for (const item of items) {
          const recipeRows = db
            .prepare("SELECT ingredient_id, qty_per_item FROM recipes WHERE menu_item_id = ?")
            .all(item.menu_item_id);

          for (const recipe of recipeRows) {
            const qtyToDeduct = recipe.qty_per_item * item.quantity;
            db.prepare("UPDATE ingredients SET stock_qty = stock_qty - ?, updated_at = datetime('now') WHERE id = ?").run(
              qtyToDeduct,
              recipe.ingredient_id
            );

            db.prepare(
              `INSERT INTO inventory_movements
               (ingredient_id, movement_type, quantity, reason, reference_type, reference_id, user_id, created_at)
               VALUES (?, 'OUT', ?, 'Order Finalized', 'ORDER', ?, ?, datetime('now'))`
            ).run(recipe.ingredient_id, qtyToDeduct, orderId, userId || null);
          }
        }
      });
      deductTxn();
    }

    db.prepare("UPDATE orders SET status=?, updated_at=datetime('now') WHERE id=?").run(status, orderId);
    writeAudit(userId, "ORDER_STATUS_UPDATED", { orderId, status });
    return { ok: true };
  });

  ipcMain.handle("orders:pay-cash", async (_, { orderId, receivedCents, userId }) => {
    const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId);
    if (!order) return { ok: false, error: "Order not found." };
    if (order.status !== "FINALIZED") return { ok: false, error: "Order must be FINALIZED before payment." };

    const total = order.total_cents;
    const received = Number(receivedCents || 0);
    if (received < total) return { ok: false, error: "Insufficient cash received." };
    const change = received - total;

    const cashSessionId = currentCashSessionId();
    if (!cashSessionId) {
      return { ok: false, error: "Open a cash shift before taking payment." };
    }

    const tx = db.transaction(() => {
      db.prepare(
        `INSERT INTO payments
         (order_id, method, amount_cents, received_cents, change_cents, created_at)
         VALUES (?, 'CASH', ?, ?, ?, datetime('now'))`
      ).run(orderId, total, received, change);

      db.prepare("UPDATE orders SET status='PAID', paid_at=datetime('now'), updated_at=datetime('now') WHERE id=?").run(orderId);

      db.prepare(
        `INSERT INTO cash_transactions
         (session_id, transaction_type, amount_cents, reason, reference_type, reference_id, user_id, created_at)
         VALUES (?, 'IN', ?, 'Order Payment', 'ORDER', ?, ?, datetime('now'))`
      ).run(cashSessionId, total, orderId, userId || null);
    });
    tx();

    const receiptPath = await generateReceiptPdf(orderId);
    writeAudit(userId, "ORDER_PAID_CASH", { orderId, total, received, change, receiptPath });
    return { ok: true, totalCents: total, receivedCents: received, changeCents: change, receiptPath };
  });

  ipcMain.handle("inventory:list", () => {
    const rows = db
      .prepare(
        `SELECT id, name, unit, stock_qty, unit_cost_cents, low_stock_threshold, supplier, updated_at
         FROM ingredients
         ORDER BY name`
      )
      .all();
    return { ok: true, ingredients: rows };
  });

  ipcMain.handle("inventory:adjust", (_, { ingredientId, qty, reason, userId }) => {
    if (!isAdminOrManager(userId)) return { ok: false, error: "Only admin/manager can adjust inventory." };
    const ingredient = db.prepare("SELECT id FROM ingredients WHERE id=?").get(ingredientId);
    if (!ingredient) return { ok: false, error: "Ingredient not found." };
    const movementType = qty >= 0 ? "IN" : "OUT";
    const amount = Math.abs(Number(qty));

    const tx = db.transaction(() => {
      db.prepare("UPDATE ingredients SET stock_qty = stock_qty + ?, updated_at = datetime('now') WHERE id = ?").run(qty, ingredientId);
      db.prepare(
        `INSERT INTO inventory_movements
         (ingredient_id, movement_type, quantity, reason, reference_type, user_id, created_at)
         VALUES (?, ?, ?, ?, 'MANUAL', ?, datetime('now'))`
      ).run(ingredientId, movementType, amount, reason || "Manual adjustment", userId || null);
    });
    tx();

    writeAudit(userId, "INVENTORY_ADJUSTED", { ingredientId, qty, reason });
    return { ok: true };
  });

  ipcMain.handle("inventory:purchase", (_, { ingredientId, qty, supplierRef, userId }) => {
    if (!isAdminOrManager(userId)) return { ok: false, error: "Only admin/manager can record purchases." };
    const amount = Number(qty || 0);
    if (amount <= 0) return { ok: false, error: "Purchase quantity must be positive." };

    const tx = db.transaction(() => {
      db.prepare("UPDATE ingredients SET stock_qty = stock_qty + ?, updated_at = datetime('now') WHERE id = ?").run(amount, ingredientId);
      db.prepare(
        `INSERT INTO inventory_movements
         (ingredient_id, movement_type, quantity, reason, reference_type, reference_id, user_id, created_at)
         VALUES (?, 'IN', ?, 'Purchase Entry', 'PURCHASE', ?, ?, datetime('now'))`
      ).run(ingredientId, amount, supplierRef || null, userId || null);
    });
    tx();

    writeAudit(userId, "INVENTORY_PURCHASE", { ingredientId, qty: amount, supplierRef });
    return { ok: true };
  });

  ipcMain.handle("inventory:create-ingredient", (_, payload = {}) => {
    const { userId, name, unit, stockQty, unitCostCents, lowStockThreshold, supplier } = payload;
    if (!isAdminOrManager(userId)) return { ok: false, error: "Only admin/manager can create ingredients." };
    if (!name || !unit) return { ok: false, error: "Name and unit are required." };

    const result = db
      .prepare(
        `INSERT INTO ingredients (name, unit, stock_qty, unit_cost_cents, low_stock_threshold, supplier, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`
      )
      .run(
        String(name).trim(),
        String(unit).trim(),
        Number(stockQty || 0),
        Math.max(0, Math.round(Number(unitCostCents || 0))),
        Number(lowStockThreshold || 0),
        supplier ? String(supplier).trim() : null
      );
    writeAudit(userId, "INGREDIENT_CREATED", {
      ingredientId: result.lastInsertRowid,
      name,
      unit,
      stockQty,
      unitCostCents,
      lowStockThreshold,
      supplier
    });
    return { ok: true, ingredientId: result.lastInsertRowid };
  });

  ipcMain.handle("inventory:update-ingredient", (_, payload = {}) => {
    const { userId, ingredientId, name, unit, unitCostCents, lowStockThreshold, supplier } = payload;
    if (!isAdminOrManager(userId)) return { ok: false, error: "Only admin/manager can update ingredients." };
    const item = db.prepare("SELECT id FROM ingredients WHERE id = ?").get(ingredientId);
    if (!item) return { ok: false, error: "Ingredient not found." };

    db.prepare(
      `UPDATE ingredients
       SET name = ?, unit = ?, unit_cost_cents = ?, low_stock_threshold = ?, supplier = ?, updated_at = datetime('now')
       WHERE id = ?`
    ).run(
      String(name).trim(),
      String(unit).trim(),
      Math.max(0, Math.round(Number(unitCostCents || 0))),
      Number(lowStockThreshold || 0),
      supplier ? String(supplier).trim() : null,
      ingredientId
    );
    writeAudit(userId, "INGREDIENT_UPDATED", { ingredientId, name, unit, unitCostCents, lowStockThreshold, supplier });
    return { ok: true };
  });

  ipcMain.handle("cash:open-session", (_, { userId, openingCents }) => {
    const openId = currentCashSessionId();
    if (openId) return { ok: false, error: "An open cash session already exists." };
    const result = db.prepare(
      `INSERT INTO cash_sessions
       (opened_by_user_id, opening_cents, opened_at, status)
       VALUES (?, ?, datetime('now'), 'OPEN')`
    ).run(userId, Number(openingCents || 0));
    writeAudit(userId, "CASH_SESSION_OPENED", { sessionId: result.lastInsertRowid, openingCents });
    return { ok: true, sessionId: result.lastInsertRowid };
  });

  ipcMain.handle("cash:get-open-session", () => {
    const session = db
      .prepare("SELECT * FROM cash_sessions WHERE status='OPEN' ORDER BY id DESC LIMIT 1")
      .get();
    if (!session) return { ok: true, session: null };

    const inOut = db
      .prepare(
        `SELECT transaction_type, COALESCE(SUM(amount_cents),0) AS total
         FROM cash_transactions
         WHERE session_id = ?
         GROUP BY transaction_type`
      )
      .all(session.id);
    const sales = db
      .prepare("SELECT COALESCE(SUM(amount_cents),0) AS sales FROM cash_transactions WHERE session_id = ? AND reason='Order Payment'")
      .get(session.id).sales;

    return { ok: true, session, totals: { inOut, sales } };
  });

  ipcMain.handle("cash:add-transaction", (_, { sessionId, type, amountCents, reason, userId }) => {
    if (!["IN", "OUT"].includes(type)) return { ok: false, error: "Invalid transaction type." };
    const amount = Number(amountCents || 0);
    if (amount <= 0) return { ok: false, error: "Amount must be positive." };

    db.prepare(
      `INSERT INTO cash_transactions
       (session_id, transaction_type, amount_cents, reason, reference_type, user_id, created_at)
       VALUES (?, ?, ?, ?, 'MANUAL', ?, datetime('now'))`
    ).run(sessionId, type, amount, reason || "Manual cash movement", userId || null);

    writeAudit(userId, "CASH_TRANSACTION_ADDED", { sessionId, type, amount, reason });
    return { ok: true };
  });

  ipcMain.handle("cash:close-session", (_, { sessionId, userId, actualClosingCents, denominationCounts }) => {
    const session = db.prepare("SELECT * FROM cash_sessions WHERE id = ? AND status='OPEN'").get(sessionId);
    if (!session) return { ok: false, error: "Open session not found." };

    const rows = db
      .prepare(
        `SELECT transaction_type, COALESCE(SUM(amount_cents),0) AS total
         FROM cash_transactions
         WHERE session_id = ?
         GROUP BY transaction_type`
      )
      .all(sessionId);

    const totals = rows.reduce(
      (acc, row) => {
        if (row.transaction_type === "IN") acc.in += row.total;
        if (row.transaction_type === "OUT") acc.out += row.total;
        return acc;
      },
      { in: 0, out: 0 }
    );

    const expected = Number(session.opening_cents) + totals.in - totals.out;
    const actual = Number(actualClosingCents || 0);
    const variance = actual - expected;

    db.prepare(
      `UPDATE cash_sessions
       SET closed_by_user_id = ?, closing_cents = ?, expected_closing_cents = ?, variance_cents = ?, denomination_json = ?,
           closed_at = datetime('now'), status='CLOSED'
       WHERE id = ?`
    ).run(userId, actual, expected, variance, denominationCounts ? JSON.stringify(denominationCounts) : null, sessionId);

    writeAudit(userId, "CASH_SESSION_CLOSED", { sessionId, expected, actual, variance });
    return { ok: true, expected, actual, variance };
  });

  ipcMain.handle("reports:summary", (_, { range }) => {
    const ranges = {
      daily: "date('now', '-1 day')",
      weekly: "date('now', '-7 day')",
      monthly: "date('now', '-30 day')"
    };
    const sinceExpr = ranges[range] || ranges.daily;

    const sales = db
      .prepare(
        `SELECT COUNT(*) AS paid_orders, COALESCE(SUM(total_cents),0) AS gross_sales
         FROM orders
         WHERE status='PAID' AND date(created_at) >= ${sinceExpr}`
      )
      .get();

    const topItems = db
      .prepare(
        `SELECT mi.name, SUM(oi.quantity) AS qty
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
         JOIN menu_items mi ON mi.id = oi.menu_item_id
         WHERE o.status='PAID' AND date(o.created_at) >= ${sinceExpr}
         GROUP BY mi.name
         ORDER BY qty DESC
         LIMIT 5`
      )
      .all();

    const cashierSales = db
      .prepare(
        `SELECT u.username AS cashier,
                COUNT(*) AS paid_orders,
                COALESCE(SUM(o.total_cents),0) AS gross_sales
         FROM orders o
         LEFT JOIN users u ON u.id = o.cashier_user_id
         WHERE o.status='PAID' AND date(o.created_at) >= ${sinceExpr}
         GROUP BY u.username
         ORDER BY gross_sales DESC`
      )
      .all();

    const categoryMargin = db
      .prepare(
        `SELECT mi.category,
                ROUND(SUM(oi.line_total_cents - (
                  CASE
                    WHEN o.subtotal_cents > 0 THEN (oi.line_total_cents * 1.0 * o.discount_cents / o.subtotal_cents)
                    ELSE 0
                  END
                ))) AS net_sales_cents,
                ROUND(SUM(COALESCE(r.qty_per_item,0) * oi.quantity * COALESCE(i.unit_cost_cents,0))) AS estimated_cost_cents
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
         JOIN menu_items mi ON mi.id = oi.menu_item_id
         LEFT JOIN recipes r ON r.menu_item_id = oi.menu_item_id
         LEFT JOIN ingredients i ON i.id = r.ingredient_id
         WHERE o.status='PAID' AND date(o.created_at) >= ${sinceExpr}
         GROUP BY mi.category
         ORDER BY net_sales_cents DESC`
      )
      .all()
      .map((r) => ({
        ...r,
        gross_margin_cents: Number(r.net_sales_cents || 0) - Number(r.estimated_cost_cents || 0)
      }));

    const taxSummary = db
      .prepare(
        `SELECT COALESCE(SUM(subtotal_cents),0) AS taxable_sales_cents,
                COALESCE(SUM(discount_cents),0) AS total_discount_cents,
                COALESCE(SUM(tax_cents),0) AS tax_collected_cents,
                COALESCE(SUM(total_cents),0) AS net_sales_cents
         FROM orders
         WHERE status='PAID' AND date(created_at) >= ${sinceExpr}`
      )
      .get();

    const eodClose = (() => {
      const openingFloat = db
        .prepare(
          `SELECT COALESCE(SUM(opening_cents),0) AS total
           FROM cash_sessions
           WHERE date(opened_at, 'localtime') = date('now', 'localtime')`
        )
        .get().total;
      const cashIn = db
        .prepare(
          `SELECT COALESCE(SUM(amount_cents),0) AS total
           FROM cash_transactions
           WHERE transaction_type='IN'
             AND date(created_at, 'localtime') = date('now', 'localtime')`
        )
        .get().total;
      const cashOut = db
        .prepare(
          `SELECT COALESCE(SUM(amount_cents),0) AS total
           FROM cash_transactions
           WHERE transaction_type='OUT'
             AND date(created_at, 'localtime') = date('now', 'localtime')`
        )
        .get().total;
      const expectedClose = Number(openingFloat || 0) + Number(cashIn || 0) - Number(cashOut || 0);
      const actualClose = db
        .prepare(
          `SELECT COALESCE(SUM(closing_cents),0) AS total
           FROM cash_sessions
           WHERE closed_at IS NOT NULL
             AND date(closed_at, 'localtime') = date('now', 'localtime')`
        )
        .get().total;
      const variance = Number(actualClose || 0) - Number(expectedClose || 0);
      const closedSessions = db
        .prepare(
          `SELECT COUNT(*) AS count
           FROM cash_sessions
           WHERE status='CLOSED'
             AND date(closed_at, 'localtime') = date('now', 'localtime')`
        )
        .get().count;
      return { openingFloat, cashIn, cashOut, expectedClose, actualClose, variance, closedSessions };
    })();

    const lowStock = db
      .prepare(
        `SELECT id, name, stock_qty, low_stock_threshold
         FROM ingredients
         WHERE stock_qty <= low_stock_threshold
         ORDER BY stock_qty ASC`
      )
      .all();

    const cash = db
      .prepare(
        `SELECT id, opened_at, closed_at, opening_cents, expected_closing_cents, closing_cents, variance_cents, status
         FROM cash_sessions
         ORDER BY id DESC
         LIMIT 10`
      )
      .all();

    const audit = db
      .prepare(
        `SELECT al.id, al.action, al.payload_json, al.created_at, u.username
         FROM audit_logs al
         LEFT JOIN users u ON u.id = al.user_id
         ORDER BY al.id DESC
         LIMIT 100`
      )
      .all();

    return {
      ok: true,
      summary: { sales, topItems, cashierSales, categoryMargin, taxSummary, eodClose, lowStock, cash, audit }
    };
  });

  ipcMain.handle("reports:daily-register", () => {
    const sales = db
      .prepare(
        `SELECT p.id,
                p.created_at,
                o.id AS order_id,
                u.username AS cashier,
                p.method,
                p.amount_cents,
                p.received_cents,
                p.change_cents
         FROM payments p
         JOIN orders o ON o.id = p.order_id
         LEFT JOIN users u ON u.id = o.cashier_user_id
         WHERE date(p.created_at, 'localtime') = date('now', 'localtime')
         ORDER BY p.id DESC`
      )
      .all();

    const cashMovements = db
      .prepare(
        `SELECT ct.id,
                ct.created_at,
                ct.transaction_type,
                ct.amount_cents,
                ct.reason,
                ct.reference_type,
                ct.reference_id,
                u.username
         FROM cash_transactions ct
         LEFT JOIN users u ON u.id = ct.user_id
         WHERE date(ct.created_at, 'localtime') = date('now', 'localtime')
         ORDER BY ct.id DESC`
      )
      .all();

    const todaySessions = db
      .prepare(
        `SELECT id, status, opened_at, closed_at, opening_cents, expected_closing_cents, closing_cents, variance_cents
         FROM cash_sessions
         WHERE date(opened_at, 'localtime') = date('now', 'localtime')
            OR (closed_at IS NOT NULL AND date(closed_at, 'localtime') = date('now', 'localtime'))
         ORDER BY id DESC`
      )
      .all();

    const openingFloat = db
      .prepare(
        `SELECT COALESCE(SUM(opening_cents),0) AS total
         FROM cash_sessions
         WHERE date(opened_at, 'localtime') = date('now', 'localtime')`
      )
      .get().total;

    const actualClosed = db
      .prepare(
        `SELECT COALESCE(SUM(closing_cents),0) AS total
         FROM cash_sessions
         WHERE closed_at IS NOT NULL
           AND date(closed_at, 'localtime') = date('now', 'localtime')`
      )
      .get().total;

    const totals = {
      sales: db
        .prepare(
          `SELECT COALESCE(SUM(amount_cents),0) AS total
           FROM payments
           WHERE date(created_at, 'localtime') = date('now', 'localtime')`
        )
        .get().total,
      cashIn: db
        .prepare(
          `SELECT COALESCE(SUM(amount_cents),0) AS total
           FROM cash_transactions
           WHERE transaction_type = 'IN'
             AND date(created_at, 'localtime') = date('now', 'localtime')`
        )
        .get().total,
      cashOut: db
        .prepare(
          `SELECT COALESCE(SUM(amount_cents),0) AS total
           FROM cash_transactions
           WHERE transaction_type = 'OUT'
             AND date(created_at, 'localtime') = date('now', 'localtime')`
        )
        .get().total,
      openingFloat,
      actualClosed
    };
    totals.expectedDrawer = totals.openingFloat + totals.cashIn - totals.cashOut;

    return {
      ok: true,
      register: {
        date: new Date().toISOString().slice(0, 10),
        totals,
        sales,
        cashMovements,
        sessions: todaySessions
      }
    };
  });

  ipcMain.handle("reports:export-csv", async (_, { range }) => {
    const summaryResp = (() => {
      const ranges = {
        daily: "date('now', '-1 day')",
        weekly: "date('now', '-7 day')",
        monthly: "date('now', '-30 day')"
      };
      const sinceExpr = ranges[range] || ranges.daily;
      const rows = db
        .prepare(
          `SELECT o.id, o.created_at, o.total_cents, u.username AS cashier
           FROM orders o
           LEFT JOIN users u ON u.id = o.cashier_user_id
           WHERE o.status='PAID' AND date(o.created_at) >= ${sinceExpr}
           ORDER BY o.id DESC`
        )
        .all();
      return rows;
    })();

    const { canceled, filePath } = await dialog.showSaveDialog({
      title: "Export Sales CSV",
      defaultPath: `sales-${range || "daily"}.csv`,
      filters: [{ name: "CSV", extensions: ["csv"] }]
    });
    if (canceled || !filePath) return { ok: false, error: "Export canceled." };

    const lines = ["order_id,created_at,cashier,total"];
    for (const row of summaryResp) {
      lines.push(`${row.id},${row.created_at},${row.cashier || ""},${(row.total_cents / 100).toFixed(2)}`);
    }
    fs.writeFileSync(filePath, lines.join("\n"), "utf8");
    return { ok: true, filePath };
  });

  ipcMain.handle("system:print-receipt", async (_, { orderId }) => {
    const order = db.prepare("SELECT * FROM orders WHERE id=?").get(orderId);
    if (!order) return { ok: false, error: "Order not found." };
    const receiptPath = await generateReceiptPdf(orderId);
    writeAudit(null, "RECEIPT_PRINT_REQUESTED", { orderId, receiptPath });
    return { ok: true, message: "Receipt generated.", receiptPath };
  });

  ipcMain.handle("system:send-kot", (_, { orderId }) => {
    const order = db.prepare("SELECT * FROM orders WHERE id=?").get(orderId);
    if (!order) return { ok: false, error: "Order not found." };
    writeAudit(null, "KOT_PRINT_REQUESTED", { orderId });
    return { ok: true, message: "KOT print request queued (simulated)." };
  });

  ipcMain.handle("system:open-cash-drawer", () => {
    writeAudit(null, "CASH_DRAWER_OPENED", {});
    return { ok: true, message: "Cash drawer signal triggered (simulated)." };
  });
}

app.whenReady().then(() => {
  initDb();
  makeBackupIfNeeded();
  registerIpc();
  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  if (db) db.close();
});
