const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
require("dotenv").config();
const Database = require("better-sqlite3");
const { createClient } = require("@supabase/supabase-js");

const SUPABASE_ONLY = String(process.env.POS_DATA_SOURCE || "").trim().toLowerCase() === "supabase";
const DB_PATH = SUPABASE_ONLY ? ":memory:" : path.join(__dirname, "database", "pos.db");
const SCHEMA_PATH = path.join(__dirname, "database", "schema.sql");
const SEED_PATH = path.join(__dirname, "database", "seed_data.sql");
const BACKUP_DIR = path.join(__dirname, "backup", "daily_backups");
const RECEIPTS_DIR = path.join(__dirname, "backup", "receipts");

let db;
let supabase = null;
const supabaseState = {
  enabled: false,
  url: null,
  lastCheckAt: null,
  lastSyncAt: null,
  lastSyncError: null
};

const SQLITE_TABLE_SYNC_ORDER = [
  "roles",
  "users",
  "menu_items",
  "promotions",
  "ingredients",
  "recipes",
  "orders",
  "order_items",
  "payments",
  "kitchen_tickets",
  "kitchen_ticket_items",
  "cash_sessions",
  "cash_transactions",
  "inventory_movements",
  "audit_logs"
];

const SYNC_TABLE_SELECT_BY_ID = {
  audit_logs: "SELECT * FROM audit_logs WHERE id = ?",
  cash_sessions: "SELECT * FROM cash_sessions WHERE id = ?",
  cash_transactions: "SELECT * FROM cash_transactions WHERE id = ?",
  ingredients: "SELECT * FROM ingredients WHERE id = ?",
  inventory_movements: "SELECT * FROM inventory_movements WHERE id = ?",
  kitchen_ticket_items: "SELECT * FROM kitchen_ticket_items WHERE id = ?",
  kitchen_tickets: "SELECT * FROM kitchen_tickets WHERE id = ?",
  menu_items: "SELECT * FROM menu_items WHERE id = ?",
  order_items: "SELECT * FROM order_items WHERE id = ?",
  orders: "SELECT * FROM orders WHERE id = ?",
  payments: "SELECT * FROM payments WHERE id = ?",
  promotions: "SELECT * FROM promotions WHERE id = ?",
  recipes: "SELECT * FROM recipes WHERE id = ?"
};

function initSupabase() {
  const configuredUrl = String(process.env.SUPABASE_URL || "").trim();
  const projectId = String(process.env.SUPABASE_PROJECT_ID || "").trim();
  const supabaseUrl = configuredUrl || (projectId ? `https://${projectId}.supabase.co` : "");
  const supabaseAnonKey = String(process.env.SUPABASE_ANON_KEY || "").trim();

  if (!supabaseUrl || !supabaseAnonKey) {
    supabaseState.enabled = false;
    supabaseState.url = supabaseUrl || null;
    supabaseState.lastCheckAt = new Date().toISOString();
    return;
  }

  try {
    supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false
      }
    });
    supabaseState.enabled = true;
    supabaseState.url = supabaseUrl;
    supabaseState.lastCheckAt = new Date().toISOString();
    supabaseState.lastSyncError = null;
  } catch (error) {
    supabase = null;
    supabaseState.enabled = false;
    supabaseState.lastCheckAt = new Date().toISOString();
    supabaseState.lastSyncError = String(error?.message || error || "Supabase init failed");
    console.error("[supabase] init failed:", error);
  }
}

function markSupabaseSyncError(error) {
  supabaseState.lastSyncError = String(error?.message || error || "Unknown sync error");
  supabaseState.lastCheckAt = new Date().toISOString();
}

async function syncUpsert(table, row) {
  if (!supabaseState.enabled || !supabase || !row) return;
  try {
    const { error } = await supabase.from(table).upsert(row, { onConflict: "id" });
    if (error) throw error;
    supabaseState.lastSyncAt = new Date().toISOString();
    supabaseState.lastSyncError = null;
    supabaseState.lastCheckAt = new Date().toISOString();
  } catch (error) {
    markSupabaseSyncError(error);
    console.error(`[supabase] upsert failed for ${table}:`, error);
  }
}

async function syncDeleteById(table, id) {
  if (!supabaseState.enabled || !supabase || id == null) return;
  try {
    const { error } = await supabase.from(table).delete().eq("id", id);
    if (error) throw error;
    supabaseState.lastSyncAt = new Date().toISOString();
    supabaseState.lastSyncError = null;
    supabaseState.lastCheckAt = new Date().toISOString();
  } catch (error) {
    markSupabaseSyncError(error);
    console.error(`[supabase] delete failed for ${table}:`, error);
  }
}

function syncTableRowById(table, id) {
  if (!supabaseState.enabled || id == null) return;
  const query = SYNC_TABLE_SELECT_BY_ID[table];
  if (!query) return;
  const row = db.prepare(query).get(id);
  if (!row) return;
  void syncUpsert(table, row);
}

function ensureDirectories() {
  if (!SUPABASE_ONLY) {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  }
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

async function fetchSupabaseTableRows(table) {
  if (!supabaseState.enabled || !supabase) return [];
  const pageSize = 1000;
  const rows = [];
  let from = 0;
  while (true) {
    const to = from + pageSize - 1;
    const { data, error } = await supabase.from(table).select("*").range(from, to);
    if (error) throw new Error(`[supabase:${table}] ${error.message}`);
    const batch = data || [];
    rows.push(...batch);
    if (batch.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

function replaceLocalTableRows(table, rows) {
  db.prepare(`DELETE FROM ${table}`).run();
  if (!rows.length) return;
  const columns = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  const placeholders = columns.map(() => "?").join(", ");
  const stmt = db.prepare(`INSERT INTO ${table} (${columns.join(", ")}) VALUES (${placeholders})`);
  const insertTxn = db.transaction((list) => {
    for (const row of list) {
      const values = columns.map((col) => (row[col] === undefined ? null : row[col]));
      stmt.run(...values);
    }
  });
  insertTxn(rows);
}

async function hydrateSqliteFromSupabase() {
  if (!SUPABASE_ONLY) return;
  if (!supabaseState.enabled || !supabase) {
    throw new Error("Supabase-only mode requires valid SUPABASE_URL/SUPABASE_ANON_KEY.");
  }
  for (const table of [...SQLITE_TABLE_SYNC_ORDER].reverse()) {
    db.prepare(`DELETE FROM ${table}`).run();
  }
  for (const table of SQLITE_TABLE_SYNC_ORDER) {
    const rows = await fetchSupabaseTableRows(table);
    replaceLocalTableRows(table, rows);
  }
}

async function backfillSupabaseFromSqlite() {
  if (!supabaseState.enabled || !supabase) return;
  for (const table of SQLITE_TABLE_SYNC_ORDER) {
    const rows = db.prepare(`SELECT * FROM ${table} ORDER BY id`).all();
    for (const row of rows) {
      await syncUpsert(table, row);
    }
  }
}

async function initDb() {
  ensureDirectories();
  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  runSqlScript(SCHEMA_PATH);
  ensureSchemaMigrations();

  if (SUPABASE_ONLY) {
    await hydrateSqliteFromSupabase();
  }

  const hasUsers = db.prepare("SELECT COUNT(*) AS count FROM users").get().count > 0;
  if (!hasUsers && fs.existsSync(SEED_PATH)) {
    runSqlScript(SEED_PATH);
    if (SUPABASE_ONLY) {
      await backfillSupabaseFromSqlite();
    }
  }
}

function ensureSchemaMigrations() {
  const orderCols = db.prepare("PRAGMA table_info(orders)").all().map((c) => c.name);
  if (!orderCols.includes("discount_cents")) {
    db.exec("ALTER TABLE orders ADD COLUMN discount_cents INTEGER NOT NULL DEFAULT 0");
  }
  if (!orderCols.includes("manual_discount_cents")) {
    db.exec("ALTER TABLE orders ADD COLUMN manual_discount_cents INTEGER NOT NULL DEFAULT 0");
    db.exec("UPDATE orders SET manual_discount_cents = COALESCE(discount_cents, 0)");
  }
  if (!orderCols.includes("promo_discount_cents")) {
    db.exec("ALTER TABLE orders ADD COLUMN promo_discount_cents INTEGER NOT NULL DEFAULT 0");
  }
  if (!orderCols.includes("promo_code")) {
    db.exec("ALTER TABLE orders ADD COLUMN promo_code TEXT");
  }
  if (!orderCols.includes("promo_id")) {
    db.exec("ALTER TABLE orders ADD COLUMN promo_id INTEGER");
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

  db.exec(
    `CREATE TABLE IF NOT EXISTS promotions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE,
      name TEXT NOT NULL,
      promo_type TEXT NOT NULL CHECK (promo_type IN ('PERCENT_TOTAL', 'FIXED_TOTAL', 'CATEGORY_PERCENT')),
      value_num REAL NOT NULL,
      cap_cents INTEGER,
      category TEXT,
      start_time TEXT,
      end_time TEXT,
      days_mask TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      auto_apply INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`
  );

  const hasPromotions = db.prepare("SELECT COUNT(*) AS count FROM promotions").get().count > 0;
  if (!hasPromotions) {
    db.exec(
      `INSERT INTO promotions
       (code, name, promo_type, value_num, cap_cents, category, start_time, end_time, days_mask, active, auto_apply)
       VALUES
       (NULL, 'Happy Hour 10%', 'PERCENT_TOTAL', 10, NULL, NULL, '14:00', '17:00', NULL, 1, 1),
       ('WELCOME5', 'Welcome PKR 5 Off', 'FIXED_TOTAL', 500, NULL, NULL, NULL, NULL, NULL, 1, 0),
       ('BURGER15', '15% Off Burger Category', 'CATEGORY_PERCENT', 15, NULL, 'Burger', NULL, NULL, NULL, 1, 0)`
    );
  }

  db.exec(
    `CREATE TABLE IF NOT EXISTS kitchen_tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL UNIQUE,
      status TEXT NOT NULL CHECK (status IN ('QUEUED', 'PREPARING', 'READY', 'SERVED', 'CANCELLED')),
      notes TEXT,
      bumped_by_user_id INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      started_at TEXT,
      ready_at TEXT,
      served_at TEXT,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
      FOREIGN KEY (bumped_by_user_id) REFERENCES users(id)
    )`
  );
  db.exec(
    `CREATE TABLE IF NOT EXISTS kitchen_ticket_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id INTEGER NOT NULL,
      menu_item_id INTEGER,
      menu_item_name TEXT NOT NULL,
      category TEXT,
      quantity INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (ticket_id) REFERENCES kitchen_tickets(id) ON DELETE CASCADE
    )`
  );
}

function writeAudit(userId, action, payload = null) {
  const result = db
    .prepare(
    `INSERT INTO audit_logs (user_id, action, payload_json, created_at)
     VALUES (?, ?, ?, datetime('now'))`
    )
    .run(userId || null, action, payload ? JSON.stringify(payload) : null);
  syncTableRowById("audit_logs", result.lastInsertRowid);
  return result.lastInsertRowid;
}

function currentCashSessionId() {
  const row = db
    .prepare("SELECT id FROM cash_sessions WHERE status='OPEN' ORDER BY id DESC LIMIT 1")
    .get();
  return row ? row.id : null;
}

function makeBackupIfNeeded() {
  if (SUPABASE_ONLY) return;
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

function parseDaysMask(mask) {
  if (!mask) return null;
  return String(mask)
    .split(",")
    .map((v) => Number(v.trim()))
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
}

function isPromotionActiveNow(promo, now = new Date()) {
  if (!promo || !promo.active) return false;
  const dayMask = parseDaysMask(promo.days_mask);
  if (dayMask && dayMask.length && !dayMask.includes(now.getDay())) return false;

  const toMinutes = (value) => {
    const parts = String(value || "").split(":").map((p) => Number(p));
    if (parts.length < 2 || !Number.isFinite(parts[0]) || !Number.isFinite(parts[1])) return null;
    return parts[0] * 60 + parts[1];
  };

  const hasWindow = promo.start_time && promo.end_time;
  if (!hasWindow) return true;

  const startMins = toMinutes(promo.start_time);
  const endMins = toMinutes(promo.end_time);
  if (startMins == null || endMins == null) return true;

  const nowMins = now.getHours() * 60 + now.getMinutes();
  if (endMins >= startMins) return nowMins >= startMins && nowMins <= endMins;
  return nowMins >= startMins || nowMins <= endMins;
}

function calculatePromotionDiscount(orderId, promo, subtotalCents) {
  if (!promo || !isPromotionActiveNow(promo)) return 0;
  const subtotal = Number(subtotalCents || 0);
  if (subtotal <= 0) return 0;

  let discount = 0;
  if (promo.promo_type === "PERCENT_TOTAL") {
    discount = Math.round((subtotal * Number(promo.value_num || 0)) / 100);
  } else if (promo.promo_type === "FIXED_TOTAL") {
    discount = Math.round(Number(promo.value_num || 0));
  } else if (promo.promo_type === "CATEGORY_PERCENT") {
    const categorySubtotal = db
      .prepare(
        `SELECT COALESCE(SUM(oi.line_total_cents), 0) AS subtotal
         FROM order_items oi
         JOIN menu_items mi ON mi.id = oi.menu_item_id
         WHERE oi.order_id = ? AND mi.category = ?`
      )
      .get(orderId, promo.category || "").subtotal;
    discount = Math.round((Number(categorySubtotal || 0) * Number(promo.value_num || 0)) / 100);
  }

  if (promo.cap_cents != null) {
    discount = Math.min(discount, Math.round(Number(promo.cap_cents || 0)));
  }
  return Math.max(0, Math.min(discount, subtotal));
}

function findBestAutoPromotion(orderId, subtotalCents) {
  const promos = db
    .prepare(
      `SELECT *
       FROM promotions
       WHERE active = 1 AND auto_apply = 1`
    )
    .all();
  let best = null;
  let bestDiscount = 0;
  for (const promo of promos) {
    const discount = calculatePromotionDiscount(orderId, promo, subtotalCents);
    if (discount > bestDiscount) {
      best = promo;
      bestDiscount = discount;
    }
  }
  return { promo: best, discountCents: bestDiscount };
}

function recalcOrderTotals(orderId) {
  const subtotal = db
    .prepare("SELECT COALESCE(SUM(line_total_cents),0) AS subtotal FROM order_items WHERE order_id = ?")
    .get(orderId).subtotal;
  const order = db
    .prepare("SELECT discount_cents, manual_discount_cents, promo_discount_cents, promo_code FROM orders WHERE id = ?")
    .get(orderId);
  if (!order) return;

  const subtotalNum = Number(subtotal || 0);
  const promoCode = order.promo_code ? String(order.promo_code).trim().toUpperCase() : null;
  let appliedPromoId = null;
  let appliedPromoCode = null;
  let promoDiscount = 0;

  if (promoCode) {
    const promo = db
      .prepare("SELECT * FROM promotions WHERE active = 1 AND UPPER(code) = ? LIMIT 1")
      .get(promoCode);
    if (promo) {
      promoDiscount = calculatePromotionDiscount(orderId, promo, subtotalNum);
      if (promoDiscount > 0) {
        appliedPromoId = promo.id;
        appliedPromoCode = String(promo.code || "").toUpperCase();
      }
    }
  } else {
    const bestAuto = findBestAutoPromotion(orderId, subtotalNum);
    promoDiscount = bestAuto.discountCents;
    if (bestAuto.promo && promoDiscount > 0) {
      appliedPromoId = bestAuto.promo.id;
      appliedPromoCode = bestAuto.promo.code ? String(bestAuto.promo.code).toUpperCase() : null;
    }
  }

  const requestedManual = Math.max(0, Math.round(Number(order?.manual_discount_cents || 0)));
  const maxManualAllowed = Math.max(0, subtotalNum - promoDiscount);
  const manualDiscount = Math.min(requestedManual, maxManualAllowed);
  const discount = Math.max(0, Math.min(subtotalNum, manualDiscount + promoDiscount));
  const total = subtotalNum - discount;

  db.prepare(
    `UPDATE orders
     SET subtotal_cents = ?,
         manual_discount_cents = ?,
         promo_discount_cents = ?,
         promo_code = ?,
         promo_id = ?,
         discount_cents = ?,
         tax_cents = 0,
         total_cents = ?,
         updated_at = datetime('now')
     WHERE id = ?`
  ).run(
    subtotalNum,
    manualDiscount,
    promoDiscount,
    appliedPromoCode,
    appliedPromoId,
    discount,
    total,
    orderId
  );
}

function ensureKitchenTicketForOrder(orderId) {
  const existing = db
    .prepare("SELECT id FROM kitchen_tickets WHERE order_id = ? LIMIT 1")
    .get(orderId);
  if (existing) return existing.id;

  const ticketInsert = db
    .prepare(
      `INSERT INTO kitchen_tickets
       (order_id, status, created_at, updated_at)
       VALUES (?, 'QUEUED', datetime('now'), datetime('now'))`
    )
    .run(orderId);
  const ticketId = ticketInsert.lastInsertRowid;

  const items = db
    .prepare(
      `SELECT oi.menu_item_id, mi.name AS menu_item_name, mi.category, oi.quantity
       FROM order_items oi
       JOIN menu_items mi ON mi.id = oi.menu_item_id
       WHERE oi.order_id = ?`
    )
    .all(orderId);

  const addItems = db.transaction(() => {
    for (const item of items) {
      const res = db
        .prepare(
          `INSERT INTO kitchen_ticket_items
           (ticket_id, menu_item_id, menu_item_name, category, quantity)
           VALUES (?, ?, ?, ?, ?)`
        )
        .run(ticketId, item.menu_item_id || null, item.menu_item_name, item.category || null, Number(item.quantity || 1));
      syncTableRowById("kitchen_ticket_items", res.lastInsertRowid);
    }
  });
  addItems();

  syncTableRowById("kitchen_tickets", ticketId);
  return ticketId;
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
  async function processOrderPayment({ orderId, method, amountCents, receivedCents, userId }) {
    const paymentMethod = String(method || "").toUpperCase();
    if (!["CASH", "CARD", "VOUCHER"].includes(paymentMethod)) {
      return { ok: false, error: "Invalid payment method." };
    }

    const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId);
    if (!order) return { ok: false, error: "Order not found." };
    if (order.status === "PAID") return { ok: false, error: "Order already paid." };
    if (order.status !== "FINALIZED") return { ok: false, error: "Order must be FINALIZED before payment." };

    const paidSoFar = db
      .prepare("SELECT COALESCE(SUM(amount_cents), 0) AS total FROM payments WHERE order_id = ?")
      .get(orderId).total;
    const remainingBefore = Math.max(0, Number(order.total_cents || 0) - Number(paidSoFar || 0));
    if (remainingBefore <= 0) return { ok: false, error: "No outstanding balance on this order." };

    const requestedAmount = Math.round(Number(amountCents || 0));
    if (!Number.isFinite(requestedAmount) || requestedAmount <= 0) {
      return { ok: false, error: "Payment amount must be greater than zero." };
    }
    if (requestedAmount > remainingBefore) {
      return { ok: false, error: "Payment amount cannot exceed remaining balance." };
    }

    const received = receivedCents == null ? null : Math.round(Number(receivedCents || 0));
    let change = 0;
    if (paymentMethod === "CASH") {
      if (!Number.isFinite(received) || received < requestedAmount) {
        return { ok: false, error: "Received cash is less than payment amount." };
      }
      change = received - requestedAmount;
    }

    const tx = db.transaction(() => {
      const paymentResult = db.prepare(
        `INSERT INTO payments
         (order_id, method, amount_cents, received_cents, change_cents, created_at)
         VALUES (?, ?, ?, ?, ?, datetime('now'))`
      ).run(orderId, paymentMethod, requestedAmount, paymentMethod === "CASH" ? received : null, paymentMethod === "CASH" ? change : 0);

      let cashTxnId = null;
      if (paymentMethod === "CASH") {
        const cashSessionId = currentCashSessionId();
        if (!cashSessionId) {
          throw new Error("Open a cash shift before taking cash payment.");
        }
        const cashTxnResult = db.prepare(
          `INSERT INTO cash_transactions
           (session_id, transaction_type, amount_cents, reason, reference_type, reference_id, user_id, created_at)
           VALUES (?, 'IN', ?, 'Order Payment', 'ORDER', ?, ?, datetime('now'))`
        ).run(cashSessionId, requestedAmount, orderId, userId || null);
        cashTxnId = cashTxnResult.lastInsertRowid;
      }

      const paidAfter = db
        .prepare("SELECT COALESCE(SUM(amount_cents), 0) AS total FROM payments WHERE order_id = ?")
        .get(orderId).total;
      const remainingAfter = Math.max(0, Number(order.total_cents || 0) - Number(paidAfter || 0));
      const isPaid = remainingAfter <= 0;

      if (isPaid) {
        db.prepare(
          "UPDATE orders SET status='PAID', paid_at=datetime('now'), updated_at=datetime('now') WHERE id = ?"
        ).run(orderId);
      } else {
        db.prepare("UPDATE orders SET updated_at=datetime('now') WHERE id = ?").run(orderId);
      }

      return {
        paymentId: paymentResult.lastInsertRowid,
        cashTxnId,
        paidAfter,
        remainingAfter,
        isPaid
      };
    });

    let result;
    try {
      result = tx();
    } catch (error) {
      return { ok: false, error: error?.message || "Payment failed." };
    }

    syncTableRowById("payments", result.paymentId);
    syncTableRowById("orders", orderId);
    if (result.cashTxnId) syncTableRowById("cash_transactions", result.cashTxnId);

    let receiptPath = null;
    if (result.isPaid) {
      receiptPath = await generateReceiptPdf(orderId);
    }

    writeAudit(userId || null, "ORDER_PAYMENT_ADDED", {
      orderId,
      method: paymentMethod,
      amount: requestedAmount,
      received: paymentMethod === "CASH" ? received : null,
      change: paymentMethod === "CASH" ? change : 0,
      paidCents: result.paidAfter,
      remainingCents: result.remainingAfter
    });
    if (result.isPaid) {
      writeAudit(userId || null, "ORDER_PAID", { orderId, receiptPath });
    }

    return {
      ok: true,
      paymentId: result.paymentId,
      method: paymentMethod,
      amountCents: requestedAmount,
      receivedCents: paymentMethod === "CASH" ? received : null,
      changeCents: paymentMethod === "CASH" ? change : 0,
      paidCents: result.paidAfter,
      remainingCents: result.remainingAfter,
      isPaid: result.isPaid,
      receiptPath
    };
  }

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
    syncTableRowById("menu_items", result.lastInsertRowid);

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
    syncTableRowById("menu_items", menuItemId);
    writeAudit(userId, "MENU_ITEM_UPDATED", { menuItemId, name, category, priceCents, active });
    return { ok: true };
  });

  ipcMain.handle("promotions:list", () => {
    const rows = db
      .prepare(
        `SELECT id, code, name, promo_type, value_num, cap_cents, category, start_time, end_time, days_mask, active, auto_apply, created_at
         FROM promotions
         ORDER BY active DESC, id DESC`
      )
      .all();
    return { ok: true, promotions: rows };
  });

  ipcMain.handle("promotions:create", (_, payload = {}) => {
    const { userId, code, name, promoType, valueNum, capCents, category, startTime, endTime, daysMask, active, autoApply } = payload;
    if (!isAdminOrManager(userId)) return { ok: false, error: "Only admin/manager can create promotions." };
    if (!name || !promoType) return { ok: false, error: "Name and promo type are required." };
    const allowed = ["PERCENT_TOTAL", "FIXED_TOTAL", "CATEGORY_PERCENT"];
    if (!allowed.includes(String(promoType))) return { ok: false, error: "Invalid promo type." };

    const result = db
      .prepare(
        `INSERT INTO promotions
         (code, name, promo_type, value_num, cap_cents, category, start_time, end_time, days_mask, active, auto_apply, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
      )
      .run(
        code ? String(code).trim().toUpperCase() : null,
        String(name).trim(),
        String(promoType),
        Number(valueNum || 0),
        capCents == null || capCents === "" ? null : Math.max(0, Math.round(Number(capCents))),
        category ? String(category).trim() : null,
        startTime ? String(startTime).trim() : null,
        endTime ? String(endTime).trim() : null,
        daysMask ? String(daysMask).trim() : null,
        active === false ? 0 : 1,
        autoApply ? 1 : 0
      );
    syncTableRowById("promotions", result.lastInsertRowid);
    writeAudit(userId, "PROMOTION_CREATED", { promotionId: result.lastInsertRowid, code, name, promoType, valueNum });
    return { ok: true, id: result.lastInsertRowid };
  });

  ipcMain.handle("promotions:update", (_, payload = {}) => {
    const { userId, promotionId, code, name, promoType, valueNum, capCents, category, startTime, endTime, daysMask, active, autoApply } = payload;
    if (!isAdminOrManager(userId)) return { ok: false, error: "Only admin/manager can update promotions." };
    const promo = db.prepare("SELECT id FROM promotions WHERE id = ?").get(promotionId);
    if (!promo) return { ok: false, error: "Promotion not found." };

    db.prepare(
      `UPDATE promotions
       SET code = ?, name = ?, promo_type = ?, value_num = ?, cap_cents = ?, category = ?, start_time = ?, end_time = ?, days_mask = ?, active = ?, auto_apply = ?
       WHERE id = ?`
    ).run(
      code ? String(code).trim().toUpperCase() : null,
      String(name).trim(),
      String(promoType),
      Number(valueNum || 0),
      capCents == null || capCents === "" ? null : Math.max(0, Math.round(Number(capCents))),
      category ? String(category).trim() : null,
      startTime ? String(startTime).trim() : null,
      endTime ? String(endTime).trim() : null,
      daysMask ? String(daysMask).trim() : null,
      active ? 1 : 0,
      autoApply ? 1 : 0,
      promotionId
    );
    syncTableRowById("promotions", promotionId);
    writeAudit(userId, "PROMOTION_UPDATED", { promotionId, code, name, promoType, valueNum, active, autoApply });
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
    syncTableRowById("orders", result.lastInsertRowid);
    writeAudit(cashierUserId, "ORDER_CREATED", { orderId: result.lastInsertRowid });
    return { ok: true, orderId: result.lastInsertRowid };
  });

  ipcMain.handle("orders:list-open", (_, { cashierUserId } = {}) => {
    const whereCashier = cashierUserId ? "AND o.cashier_user_id = ?" : "";
    const rows = db
      .prepare(
        `SELECT o.id,
                o.status,
                o.customer_name,
                o.customer_phone,
                o.total_cents,
                o.updated_at,
                COALESCE(SUM(oi.quantity), 0) AS item_count
         FROM orders o
         LEFT JOIN order_items oi ON oi.order_id = o.id
         WHERE o.status IN ('DRAFT', 'HOLD')
           ${whereCashier}
         GROUP BY o.id
         ORDER BY o.updated_at DESC
         LIMIT 25`
      )
      .all(...(cashierUserId ? [cashierUserId] : []));
    return { ok: true, orders: rows };
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

  ipcMain.handle("orders:get-payments", (_, { orderId }) => {
    const order = db.prepare("SELECT id, total_cents, status FROM orders WHERE id = ?").get(orderId);
    if (!order) return { ok: false, error: "Order not found." };

    const payments = db
      .prepare(
        `SELECT id, method, amount_cents, received_cents, change_cents, created_at
         FROM payments
         WHERE order_id = ?
         ORDER BY id ASC`
      )
      .all(orderId);
    const paidCents = payments.reduce((acc, p) => acc + Number(p.amount_cents || 0), 0);
    const remainingCents = Math.max(0, Number(order.total_cents || 0) - paidCents);

    return { ok: true, payments, paidCents, remainingCents, orderTotalCents: Number(order.total_cents || 0), status: order.status };
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
      syncTableRowById("order_items", existing.id);
    } else {
      const lineTotal = menuItem.price_cents * qty;
      const inserted = db.prepare(
        `INSERT INTO order_items
         (order_id, menu_item_id, quantity, unit_price_cents, line_total_cents, modifiers_json)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(orderId, menuItemId, qty, menuItem.price_cents, lineTotal, modifiers ? JSON.stringify(modifiers) : null);
      syncTableRowById("order_items", inserted.lastInsertRowid);
    }

    recalcOrderTotals(orderId);
    syncTableRowById("orders", orderId);

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
      void syncDeleteById("order_items", orderItemId);
    } else {
      db.prepare(
        `UPDATE order_items
         SET quantity = ?, line_total_cents = ? * ?
         WHERE id = ?`
      ).run(qty, item.unit_price_cents, qty, orderItemId);
      syncTableRowById("order_items", orderItemId);
    }

    recalcOrderTotals(orderId);
    syncTableRowById("orders", orderId);
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

    db.prepare(
      `UPDATE orders
       SET manual_discount_cents = ?, updated_at = datetime('now')
       WHERE id = ?`
    ).run(requested, orderId);
    recalcOrderTotals(orderId);
    syncTableRowById("orders", orderId);

    const updated = db
      .prepare("SELECT manual_discount_cents, promo_discount_cents, discount_cents, total_cents FROM orders WHERE id = ?")
      .get(orderId);
    writeAudit(userId || null, "ORDER_DISCOUNT_UPDATED", {
      orderId,
      manualDiscountCents: updated.manual_discount_cents,
      promoDiscountCents: updated.promo_discount_cents,
      discountCents: updated.discount_cents
    });
    return {
      ok: true,
      manualDiscountCents: updated.manual_discount_cents,
      promoDiscountCents: updated.promo_discount_cents,
      discountCents: updated.discount_cents,
      totalCents: updated.total_cents
    };
  });

  ipcMain.handle("orders:apply-promo", (_, { orderId, promoCode, userId }) => {
    const order = db.prepare("SELECT id, status FROM orders WHERE id = ?").get(orderId);
    if (!order) return { ok: false, error: "Order not found." };
    if (order.status === "PAID" || order.status === "CANCELLED") {
      return { ok: false, error: "Promo can be applied only before payment/cancel." };
    }
    const normalized = String(promoCode || "").trim().toUpperCase();
    if (!normalized) return { ok: false, error: "Promo code is required." };

    const promo = db.prepare("SELECT * FROM promotions WHERE active = 1 AND UPPER(code) = ? LIMIT 1").get(normalized);
    if (!promo) return { ok: false, error: "Invalid promo code." };
    if (!isPromotionActiveNow(promo)) return { ok: false, error: "Promo is not active at this time." };

    db.prepare("UPDATE orders SET promo_code = ?, promo_id = ?, updated_at = datetime('now') WHERE id = ?").run(
      normalized,
      promo.id,
      orderId
    );
    recalcOrderTotals(orderId);
    syncTableRowById("orders", orderId);
    writeAudit(userId || null, "ORDER_PROMO_APPLIED", { orderId, promoCode: normalized, promoId: promo.id });
    const updated = db
      .prepare("SELECT promo_code, promo_discount_cents, discount_cents, total_cents FROM orders WHERE id = ?")
      .get(orderId);
    return { ok: true, promo: updated };
  });

  ipcMain.handle("orders:clear-promo", (_, { orderId, userId }) => {
    const order = db.prepare("SELECT id, status FROM orders WHERE id = ?").get(orderId);
    if (!order) return { ok: false, error: "Order not found." };
    if (order.status === "PAID" || order.status === "CANCELLED") {
      return { ok: false, error: "Promo can be cleared only before payment/cancel." };
    }
    db.prepare("UPDATE orders SET promo_code = NULL, promo_id = NULL, promo_discount_cents = 0, updated_at = datetime('now') WHERE id = ?").run(orderId);
    recalcOrderTotals(orderId);
    syncTableRowById("orders", orderId);
    writeAudit(userId || null, "ORDER_PROMO_CLEARED", { orderId });
    return { ok: true };
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
    syncTableRowById("orders", orderId);
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

            const movementResult = db.prepare(
              `INSERT INTO inventory_movements
               (ingredient_id, movement_type, quantity, reason, reference_type, reference_id, user_id, created_at)
               VALUES (?, 'OUT', ?, 'Order Finalized', 'ORDER', ?, ?, datetime('now'))`
            ).run(recipe.ingredient_id, qtyToDeduct, orderId, userId || null);
            syncTableRowById("ingredients", recipe.ingredient_id);
            syncTableRowById("inventory_movements", movementResult.lastInsertRowid);
          }
        }
      });
      deductTxn();
      const ticketId = ensureKitchenTicketForOrder(orderId);
      syncTableRowById("kitchen_tickets", ticketId);
    }

    db.prepare("UPDATE orders SET status=?, updated_at=datetime('now') WHERE id=?").run(status, orderId);
    syncTableRowById("orders", orderId);
    if (status === "CANCELLED") {
      const ticket = db.prepare("SELECT id FROM kitchen_tickets WHERE order_id = ? LIMIT 1").get(orderId);
      if (ticket) {
        db.prepare(
          `UPDATE kitchen_tickets
           SET status = 'CANCELLED', updated_at = datetime('now')
           WHERE id = ?`
        ).run(ticket.id);
        syncTableRowById("kitchen_tickets", ticket.id);
      }
    }
    writeAudit(userId, "ORDER_STATUS_UPDATED", { orderId, status });
    return { ok: true };
  });

  ipcMain.handle("orders:add-payment", async (_, { orderId, method, amountCents, receivedCents, userId }) => {
    return processOrderPayment({ orderId, method, amountCents, receivedCents, userId });
  });

  ipcMain.handle("orders:pay-cash", async (_, { orderId, receivedCents, userId }) => {
    const order = db.prepare("SELECT id, total_cents FROM orders WHERE id = ?").get(orderId);
    if (!order) return { ok: false, error: "Order not found." };
    const paidSoFar = db
      .prepare("SELECT COALESCE(SUM(amount_cents), 0) AS total FROM payments WHERE order_id = ?")
      .get(orderId).total;
    const remaining = Math.max(0, Number(order.total_cents || 0) - Number(paidSoFar || 0));
    return processOrderPayment({
      orderId,
      method: "CASH",
      amountCents: remaining,
      receivedCents,
      userId
    });
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
      const movementResult = db.prepare(
        `INSERT INTO inventory_movements
         (ingredient_id, movement_type, quantity, reason, reference_type, user_id, created_at)
         VALUES (?, ?, ?, ?, 'MANUAL', ?, datetime('now'))`
      ).run(ingredientId, movementType, amount, reason || "Manual adjustment", userId || null);
      return movementResult.lastInsertRowid;
    });
    const movementId = tx();
    syncTableRowById("ingredients", ingredientId);
    syncTableRowById("inventory_movements", movementId);

    writeAudit(userId, "INVENTORY_ADJUSTED", { ingredientId, qty, reason });
    return { ok: true };
  });

  ipcMain.handle("inventory:purchase", (_, { ingredientId, qty, supplierRef, userId }) => {
    if (!isAdminOrManager(userId)) return { ok: false, error: "Only admin/manager can record purchases." };
    const amount = Number(qty || 0);
    if (amount <= 0) return { ok: false, error: "Purchase quantity must be positive." };

    const tx = db.transaction(() => {
      db.prepare("UPDATE ingredients SET stock_qty = stock_qty + ?, updated_at = datetime('now') WHERE id = ?").run(amount, ingredientId);
      const movementResult = db.prepare(
        `INSERT INTO inventory_movements
         (ingredient_id, movement_type, quantity, reason, reference_type, reference_id, user_id, created_at)
         VALUES (?, 'IN', ?, 'Purchase Entry', 'PURCHASE', ?, ?, datetime('now'))`
      ).run(ingredientId, amount, supplierRef || null, userId || null);
      return movementResult.lastInsertRowid;
    });
    const movementId = tx();
    syncTableRowById("ingredients", ingredientId);
    syncTableRowById("inventory_movements", movementId);

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
    syncTableRowById("ingredients", result.lastInsertRowid);
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
    syncTableRowById("ingredients", ingredientId);
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
    syncTableRowById("cash_sessions", result.lastInsertRowid);
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

    const result = db.prepare(
      `INSERT INTO cash_transactions
       (session_id, transaction_type, amount_cents, reason, reference_type, user_id, created_at)
       VALUES (?, ?, ?, ?, 'MANUAL', ?, datetime('now'))`
    ).run(sessionId, type, amount, reason || "Manual cash movement", userId || null);
    syncTableRowById("cash_transactions", result.lastInsertRowid);

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
    syncTableRowById("cash_sessions", sessionId);

    writeAudit(userId, "CASH_SESSION_CLOSED", { sessionId, expected, actual, variance });
    return { ok: true, expected, actual, variance };
  });

  ipcMain.handle("kds:list", (_, { statuses } = {}) => {
    const allowed = ["QUEUED", "PREPARING", "READY", "SERVED", "CANCELLED"];
    let normalized = Array.isArray(statuses)
      ? statuses.map((s) => String(s).toUpperCase()).filter((s) => allowed.includes(s))
      : ["QUEUED", "PREPARING", "READY"];
    if (!normalized.length) normalized = ["QUEUED", "PREPARING", "READY"];

    const placeholders = normalized.map(() => "?").join(", ");
    const tickets = db
      .prepare(
        `SELECT kt.id,
                kt.order_id,
                kt.status,
                kt.notes,
                kt.created_at,
                kt.updated_at,
                kt.started_at,
                kt.ready_at,
                kt.served_at,
                o.customer_name,
                o.customer_phone
         FROM kitchen_tickets kt
         JOIN orders o ON o.id = kt.order_id
         WHERE kt.status IN (${placeholders})
         ORDER BY kt.id ASC`
      )
      .all(...normalized);

    const withItems = tickets.map((t) => {
      const items = db
        .prepare(
          `SELECT id, menu_item_name, category, quantity
           FROM kitchen_ticket_items
           WHERE ticket_id = ?
           ORDER BY id ASC`
        )
        .all(t.id);
      return { ...t, items };
    });
    return { ok: true, tickets: withItems };
  });

  ipcMain.handle("kds:update-status", (_, { ticketId, status, userId }) => {
    const next = String(status || "").toUpperCase();
    const allowed = ["QUEUED", "PREPARING", "READY", "SERVED", "CANCELLED"];
    if (!allowed.includes(next)) return { ok: false, error: "Invalid ticket status." };

    const ticket = db.prepare("SELECT * FROM kitchen_tickets WHERE id = ?").get(ticketId);
    if (!ticket) return { ok: false, error: "Ticket not found." };

    db.prepare(
      `UPDATE kitchen_tickets
       SET status = ?,
           started_at = CASE WHEN ? = 'PREPARING' THEN COALESCE(started_at, datetime('now')) ELSE started_at END,
           ready_at = CASE WHEN ? = 'READY' THEN datetime('now') ELSE ready_at END,
           served_at = CASE WHEN ? = 'SERVED' THEN datetime('now') ELSE served_at END,
           bumped_by_user_id = ?,
           updated_at = datetime('now')
       WHERE id = ?`
    ).run(next, next, next, next, userId || null, ticketId);

    syncTableRowById("kitchen_tickets", ticketId);
    writeAudit(userId || null, "KDS_TICKET_STATUS_UPDATED", { ticketId, orderId: ticket.order_id, status: next });
    return { ok: true };
  });

  ipcMain.handle("kds:bump", (_, { ticketId, userId }) => {
    const ticket = db.prepare("SELECT id, order_id, status FROM kitchen_tickets WHERE id = ?").get(ticketId);
    if (!ticket) return { ok: false, error: "Ticket not found." };
    const flow = {
      QUEUED: "PREPARING",
      PREPARING: "READY",
      READY: "SERVED",
      SERVED: "SERVED",
      CANCELLED: "CANCELLED"
    };
    const next = flow[ticket.status] || ticket.status;
    if (next === ticket.status) return { ok: true, status: next };

    db.prepare(
      `UPDATE kitchen_tickets
       SET status = ?,
           started_at = CASE WHEN ? = 'PREPARING' THEN COALESCE(started_at, datetime('now')) ELSE started_at END,
           ready_at = CASE WHEN ? = 'READY' THEN datetime('now') ELSE ready_at END,
           served_at = CASE WHEN ? = 'SERVED' THEN datetime('now') ELSE served_at END,
           bumped_by_user_id = ?,
           updated_at = datetime('now')
       WHERE id = ?`
    ).run(next, next, next, next, userId || null, ticketId);
    syncTableRowById("kitchen_tickets", ticketId);
    writeAudit(userId || null, "KDS_TICKET_BUMPED", { ticketId, orderId: ticket.order_id, from: ticket.status, to: next });
    return { ok: true, status: next };
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

  ipcMain.handle("system:supabase-status", async () => {
    if (!supabaseState.enabled || !supabase) {
      return { ok: true, supabase: { ...supabaseState, connected: false, dataSource: SUPABASE_ONLY ? "supabase" : "sqlite" } };
    }

    try {
      const { error } = await supabase.from("orders").select("id", { count: "exact", head: true });
      if (error) throw error;
      supabaseState.lastCheckAt = new Date().toISOString();
      supabaseState.lastSyncError = null;
      return { ok: true, supabase: { ...supabaseState, connected: true, dataSource: SUPABASE_ONLY ? "supabase" : "sqlite" } };
    } catch (error) {
      markSupabaseSyncError(error);
      return { ok: true, supabase: { ...supabaseState, connected: false, dataSource: SUPABASE_ONLY ? "supabase" : "sqlite" } };
    }
  });
}

app.whenReady().then(async () => {
  initSupabase();
  try {
    await initDb();
  } catch (error) {
    console.error("Database initialization failed:", error);
    app.quit();
    return;
  }
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
