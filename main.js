const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const dns = require("dns").promises;
const dotenv = require("dotenv");
const { createClient } = require("@supabase/supabase-js");

dotenv.config();

function loadEnvFromKnownPaths() {
  const candidates = Array.from(new Set([
    path.join(process.cwd(), ".env"),
    process.resourcesPath ? path.join(process.resourcesPath, ".env") : null,
    process.resourcesPath ? path.join(process.resourcesPath, "app.asar.unpacked", ".env") : null,
    path.join(app.getPath("userData"), ".env"),
    path.join(__dirname, ".env")
  ].filter(Boolean)));
  for (const fp of candidates) {
    try {
      if (!fs.existsSync(fp)) continue;
      dotenv.config({ path: fp, override: false });
    } catch (_) { }
  }
}

const userDataPath = app.getPath("userData");
const DATA_DIR = path.join(userDataPath, "data");
const LOGS_DIR = path.join(userDataPath, "logs");
const CONFIG_PATH = path.join(userDataPath, "config.json");
const RECEIPTS_DIR = path.join(DATA_DIR, "receipts");
const DAILY_BACKUPS_DIR = path.join(DATA_DIR, "daily_backups");
const DATA_SOURCE = String(process.env.POS_DATA_SOURCE || "local").trim().toLowerCase();
const LOCAL_DB_PATH = path.join(DATA_DIR, "local-db.json");
let sb = null;
const sbState = { enabled: false, url: null, lastCheckAt: null, lastSyncAt: null, lastSyncError: null, dataSource: DATA_SOURCE === "local" ? "local" : "supabase" };
const now = () => new Date().toISOString();
const money = (c) => new Intl.NumberFormat("en-PK", { style: "currency", currency: "PKR", currencyDisplay: "narrowSymbol", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(c || 0) / 100);
const esc = (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#039;");
const hashPin = (pin) => crypto.createHash("sha256").update(String(pin)).digest("hex");
const schemaCompat = { ordersHasManualDiscountCents: true };

console.log("User Data Path:", userDataPath);
console.log("Database Path:", LOCAL_DB_PATH);
console.log("__dirname:", __dirname);
console.log("userDataPath:", app.getPath("userData"));

function logLine(level, ...args) {
  try {
    const stamp = new Date().toISOString();
    const line = `[${stamp}] [${level}] ${args.map((v) => (typeof v === "string" ? v : JSON.stringify(v))).join(" ")}\n`;
    ensureDir(LOGS_DIR);
    fs.appendFileSync(path.join(LOGS_DIR, "app.log"), line, "utf8");
  } catch (_) {
    // Avoid crashing on logging failures
  }
}

process.on("unhandledRejection", (err) => {
  console.error(err);
  logLine("ERROR", "unhandledRejection", err?.message || err);
});

function ensureDir(dirPath) {
  try {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  } catch (err) {
    console.error("Failed to create directory:", dirPath, err);
    throw err;
  }
}

function movePathIfNeeded(srcPath, destPath) {
  try {
    if (!fs.existsSync(srcPath) || fs.existsSync(destPath)) return;
    const st = fs.statSync(srcPath);
    if (!st.isFile()) return;
    ensureDir(path.dirname(destPath));
    try {
      fs.renameSync(srcPath, destPath);
    } catch (err) {
      fs.copyFileSync(srcPath, destPath);
      fs.unlinkSync(srcPath);
    }
    console.log("Migrated storage path:", srcPath, "->", destPath);
  } catch (err) {
    console.error("Failed to migrate path:", srcPath, "->", destPath, err);
  }
}

function moveDirIfNeeded(srcDir, destDir) {
  try {
    if (!fs.existsSync(srcDir) || fs.existsSync(destDir)) return;
    const st = fs.statSync(srcDir);
    if (!st.isDirectory()) return;
    ensureDir(path.dirname(destDir));
    try {
      fs.renameSync(srcDir, destDir);
    } catch (err) {
      ensureDir(destDir);
      for (const name of fs.readdirSync(srcDir)) {
        const from = path.join(srcDir, name);
        const to = path.join(destDir, name);
        if (fs.statSync(from).isDirectory()) {
          moveDirIfNeeded(from, to);
        } else {
          movePathIfNeeded(from, to);
        }
      }
      fs.rmSync(srcDir, { recursive: true, force: true });
    }
    console.log("Migrated storage dir:", srcDir, "->", destDir);
  } catch (err) {
    console.error("Failed to migrate dir:", srcDir, "->", destDir, err);
  }
}

function migrateLegacyStorage() {
  const appData = app.getPath("appData");
  const oldUserDataPath = path.join(appData, "Virginia POS");
  const oldDataDir = path.join(oldUserDataPath, "data");

  const legacyBases = [];
  if (!__dirname.includes("app.asar")) {
    legacyBases.push(__dirname);
  }
  legacyBases.push(userDataPath);
  legacyBases.push(oldUserDataPath); // Check old root (Roamin/Virginia POS)
  legacyBases.push(oldDataDir);      // Check old data dir (Roaming/Virginia POS/data)

  for (const base of legacyBases) {
    if (!fs.existsSync(base)) continue;
    
    // Check various common legacy structures
    const legacyDb = path.join(base, "local-db.json");
    const legacyReceipts = path.join(base, "backup", "receipts");
    const legacyBackups = path.join(base, "backup", "daily_backups");

    // Also check if they were in the root of the folder or data folder
    const legacyReceiptsAlt = path.join(base, "receipts");
    const legacyBackupsAlt = path.join(base, "daily_backups");

    movePathIfNeeded(legacyDb, LOCAL_DB_PATH);
    moveDirIfNeeded(legacyReceipts, RECEIPTS_DIR);
    moveDirIfNeeded(legacyBackups, DAILY_BACKUPS_DIR);
    moveDirIfNeeded(legacyReceiptsAlt, RECEIPTS_DIR);
    moveDirIfNeeded(legacyBackupsAlt, DAILY_BACKUPS_DIR);
  }
}


function ensureConfig() {
  try {
    if (!fs.existsSync(CONFIG_PATH)) {
      const defaultConfig = {
        version: 1,
        created_at: now(),
        dataDir: DATA_DIR
      };
      ensureDir(path.dirname(CONFIG_PATH));
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(defaultConfig, null, 2), "utf8");
    }
  } catch (err) {
    console.error("Failed to ensure config:", CONFIG_PATH, err);
    logLine("ERROR", "Failed to ensure config:", CONFIG_PATH, err.message || err);
  }
}
const ALL_TABLES = [
  "roles",
  "users",
  "menu_items",
  "ingredients",
  "promotions",
  "orders",
  "recipes",
  "order_items",
  "payments",
  "inventory_movements",
  "purchase_orders",
  "purchase_order_items",
  "cash_sessions",
  "cash_transactions",
  "audit_logs",
  "credit_customers",
  "credit_sales",
  "credit_payments",
  "credit_vendors",
  "credit_purchases",
  "credit_vendor_payments",
  "employee_register",
  "employee_ledger",
  "employee_salary_closures"
];

function clone(v) { return JSON.parse(JSON.stringify(v)); }

class LocalQuery {
  constructor(db, table) {
    this.db = db;
    this.table = table;
    this.mode = "select";
    this.filters = [];
    this.sorters = [];
    this._limit = null;
    this._range = null;
    this._single = false;
    this._head = false;
    this._countExact = false;
    this._insertRows = [];
    this._updatePatch = null;
    this._returning = true;
  }
  select(_cols = "*", opts = {}) {
    if (this.mode === "delete") return this;
    if (this.mode === "select") {
      this._head = !!opts.head;
      this._countExact = opts.count === "exact";
    } else {
      this._returning = true;
    }
    return this;
  }
  insert(payload) {
    this.mode = "insert";
    this._insertRows = Array.isArray(payload) ? payload : [payload];
    this._returning = false;
    return this;
  }
  update(patch) {
    this.mode = "update";
    this._updatePatch = patch || {};
    this._returning = false;
    return this;
  }
  delete() {
    this.mode = "delete";
    this._returning = false;
    return this;
  }
  eq(field, value) { this.filters.push((r) => r?.[field] === value); return this; }
  neq(field, value) { this.filters.push((r) => r?.[field] !== value); return this; }
  in(field, values) { const set = new Set(values || []); this.filters.push((r) => set.has(r?.[field])); return this; }
  is(field, value) { this.filters.push((r) => r?.[field] === value); return this; }
  ilike(field, pattern) {
    const raw = String(pattern || "");
    const escaped = raw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*");
    const re = new RegExp(`^${escaped}$`, "i");
    this.filters.push((r) => re.test(String(r?.[field] || "")));
    return this;
  }
  not(field, op, value) {
    if (String(op || "").toLowerCase() === "is") this.filters.push((r) => r?.[field] !== value);
    return this;
  }
  order(field, opts = {}) {
    const asc = opts.ascending !== false;
    this.sorters.push((a, b) => {
      const av = a?.[field]; const bv = b?.[field];
      if (av === bv) return 0;
      if (av == null) return asc ? -1 : 1;
      if (bv == null) return asc ? 1 : -1;
      return av > bv ? (asc ? 1 : -1) : (asc ? -1 : 1);
    });
    return this;
  }
  limit(n) { this._limit = Math.max(0, Number(n || 0)); return this; }
  range(from, to) { this._range = { from: Number(from || 0), to: Number(to || 0) }; return this; }
  single() { this._single = true; return this; }
  _applySelect(rows) {
    let out = rows.slice();
    for (const f of this.filters) out = out.filter(f);
    for (const s of this.sorters) out.sort(s);
    const count = out.length;
    if (this._range) out = out.slice(this._range.from, this._range.to + 1);
    if (this._limit != null) out = out.slice(0, this._limit);
    return { rows: out, count };
  }
  _execSync() {
    const tableRows = this.db.data[this.table] || [];
    if (this.mode === "insert") {
      const inserted = [];
      for (const raw of this._insertRows) {
        const row = clone(raw || {});
        if (row.id == null) {
          this.db.seq[this.table] = (this.db.seq[this.table] || 0) + 1;
          row.id = this.db.seq[this.table];
        } else {
          this.db.seq[this.table] = Math.max(Number(this.db.seq[this.table] || 0), Number(row.id || 0));
        }
        this.db.data[this.table].push(row);
        inserted.push(clone(row));
      }
      this.db.save();
      let data = this._returning ? inserted : null;
      if (this._single) data = Array.isArray(data) ? data[0] || null : null;
      return { data, error: null };
    }
    if (this.mode === "update") {
      const { rows: matched } = this._applySelect(tableRows);
      const ids = new Set(matched.map((r) => r.id));
      const updated = [];
      for (const row of this.db.data[this.table]) {
        if (!ids.has(row.id)) continue;
        Object.assign(row, clone(this._updatePatch || {}));
        updated.push(clone(row));
      }
      this.db.save();
      let data = this._returning ? updated : null;
      if (this._single) data = Array.isArray(data) ? data[0] || null : null;
      return { data, error: null };
    }
    if (this.mode === "delete") {
      const { rows: matched } = this._applySelect(tableRows);
      const ids = new Set(matched.map((r) => r.id));
      this.db.data[this.table] = this.db.data[this.table].filter((r) => !ids.has(r.id));
      this.db.save();
      return { data: null, error: null };
    }
    const { rows, count } = this._applySelect(tableRows);
    let data = this._head ? null : clone(rows);
    if (this._single) data = Array.isArray(data) ? data[0] || null : null;
    const out = { data, error: null };
    if (this._countExact) out.count = count;
    return out;
  }
  then(resolve, reject) {
    try { resolve(this._execSync()); } catch (e) { reject(e); }
  }
}

class LocalDb {
  constructor(filePath) {
    this.filePath = filePath;
    this.data = {};
    this.seq = {};
    this._load();
  }
  _load() {
    try {
      if (fs.existsSync(this.filePath)) {
        const parsed = JSON.parse(fs.readFileSync(this.filePath, "utf8"));
        this.data = parsed?.data && typeof parsed.data === "object" ? parsed.data : {};
        this.seq = parsed?.seq && typeof parsed.seq === "object" ? parsed.seq : {};
      }
    } catch (err) {
      console.error("Failed to load local DB:", this.filePath, err);
      throw err;
    }
    for (const t of ALL_TABLES) {
      if (!Array.isArray(this.data[t])) this.data[t] = [];
      if (!Number.isFinite(this.seq[t])) {
        this.seq[t] = this.data[t].reduce((m, r) => Math.max(m, Number(r?.id || 0)), 0);
      }
    }
    if (!this.data.roles.length && !this.data.users.length) {
      const roles = ["ADMIN", "MANAGER", "CASHIER"];
      for (const r of roles) this._insertRaw("roles", { name: r, permissions_json: null, created_at: now() });
      const roleByName = new Map(this.data.roles.map((r) => [r.name, r.id]));
      this._insertRaw("users", { username: "admin", pin_hash: hashPin("1234"), role_id: roleByName.get("ADMIN"), active: 1, created_at: now() });
      this._insertRaw("users", { username: "manager", pin_hash: hashPin("2222"), role_id: roleByName.get("MANAGER"), active: 1, created_at: now() });
      this._insertRaw("users", { username: "cashier", pin_hash: hashPin("9999"), role_id: roleByName.get("CASHIER"), active: 1, created_at: now() });
      this.save();
    }
  }
  _insertRaw(table, row) {
    this.seq[table] = (this.seq[table] || 0) + 1;
    this.data[table].push({ ...clone(row), id: this.seq[table] });
  }
  save() {
    try {
      ensureDir(path.dirname(this.filePath));
      fs.writeFileSync(this.filePath, JSON.stringify({ version: 1, data: this.data, seq: this.seq }, null, 2), "utf8");
    } catch (err) {
      console.error("Failed to save local DB:", this.filePath, err);
      throw err;
    }
  }
  from(table) {
    if (!this.data[table]) this.data[table] = [];
    if (!Number.isFinite(this.seq[table])) this.seq[table] = 0;
    return new LocalQuery(this, table);
  }
}

function isMissingManualDiscountColumnError(error) {
  return /manual_discount_cents/i.test(String(error?.message || error || ""));
}
function stripManualDiscount(row) {
  if (!row || typeof row !== "object") return row;
  if (!Object.prototype.hasOwnProperty.call(row, "manual_discount_cents")) return row;
  const { manual_discount_cents, ...rest } = row;
  return rest;
}

function autoSplitMenuSizesLocal(db) {
  if (!db || !db.data || !Array.isArray(db.data.menu_items)) return;
  const sizeLabels = ["Small", "Medium", "Large", "Regular", "Jumbo", "Family", "Half", "Full"];
  let changed = false;
  for (const row of db.data.menu_items) {
    if (!row || row.size) continue;
    const rawName = String(row.name || "").trim();
    for (const size of sizeLabels) {
      const re = new RegExp(`^(.*?)(?:\\s+|\\s*-\\s*)(${size})$`, "i");
      const m = re.exec(rawName);
      if (!m) continue;
      const baseName = String(m[1] || "").trim();
      if (!baseName) continue;
      const hasDuplicate = db.data.menu_items.some((r) => {
        if (!r || r.id === row.id) return false;
        const n = String(r.name || "").trim();
        const c = String(r.category || "").trim();
        const s = String(r.size || "").trim();
        return n.toLowerCase() === baseName.toLowerCase()
          && c.toLowerCase() === String(row.category || "").trim().toLowerCase()
          && s.toLowerCase() === size.toLowerCase();
      });
      if (hasDuplicate) break;
      row.name = baseName;
      row.size = size;
      changed = true;
      break;
    }
  }
  if (changed) db.save();
}

function todayKey(v) {
  const d = new Date(v);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const isToday = (v) => todayKey(v) === todayKey(new Date());

function parseDaysMask(mask) {
  if (!mask) return null;
  return String(mask).split(",").map((x) => Number(x.trim())).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
}
function promoTimeOk(p) {
  if (!p || !p.active) return false;
  const d = parseDaysMask(p.days_mask);
  const n = new Date();
  if (d && d.length && !d.includes(n.getDay())) return false;
  if (!p.start_time || !p.end_time) return true;
  const toM = (v) => { const a = String(v || "").split(":").map(Number); return a.length < 2 || !Number.isFinite(a[0]) || !Number.isFinite(a[1]) ? null : a[0] * 60 + a[1]; };
  const s = toM(p.start_time); const e = toM(p.end_time); if (s == null || e == null) return true;
  const m = n.getHours() * 60 + n.getMinutes();
  return e >= s ? m >= s && m <= e : m >= s || m <= e;
}

async function q(table, fn) {
  const qb = fn(sb.from(table).select("*"));
  const { data, error } = await qb;
  if (error) throw new Error(error.message);
  return data || [];
}
async function get(table, id) { const r = await q(table, (x) => x.eq("id", id).limit(1)); return r[0] || null; }
async function ins(table, row) {
  const payload = table === "orders" && !schemaCompat.ordersHasManualDiscountCents ? stripManualDiscount(row) : row;
  let { data, error } = await sb.from(table).insert(payload).select("*").single();
  if (error && table === "orders" && isMissingManualDiscountColumnError(error) && schemaCompat.ordersHasManualDiscountCents) {
    schemaCompat.ordersHasManualDiscountCents = false;
    ({ data, error } = await sb.from(table).insert(stripManualDiscount(row)).select("*").single());
  }
  if (error) throw new Error(error.message);
  sbState.lastSyncAt = now();
  return data;
}
async function upd(table, fn, patch) {
  const payload = table === "orders" && !schemaCompat.ordersHasManualDiscountCents ? stripManualDiscount(patch) : patch;
  let qb = sb.from(table).update(payload); qb = fn(qb);
  let { data, error } = await qb.select("*");
  if (error && table === "orders" && isMissingManualDiscountColumnError(error) && schemaCompat.ordersHasManualDiscountCents) {
    schemaCompat.ordersHasManualDiscountCents = false;
    qb = sb.from(table).update(stripManualDiscount(patch));
    qb = fn(qb);
    ({ data, error } = await qb.select("*"));
  }
  if (error) throw new Error(error.message);
  sbState.lastSyncAt = now();
  return data || [];
}
async function del(table, fn) {
  const { error } = await fn(sb.from(table).delete());
  if (error) throw new Error(error.message);
  sbState.lastSyncAt = now();
}
async function listAllRows(table) {
  const page = 1000;
  let from = 0;
  const out = [];
  while (true) {
    const to = from + page - 1;
    const { data, error } = await sb.from(table).select("*").order("id", { ascending: true }).range(from, to);
    if (error) throw new Error(error.message);
    if (!data || !data.length) break;
    out.push(...data);
    if (data.length < page) break;
    from += page;
  }
  return out;
}
async function insertRows(table, rows) {
  const page = 500;
  for (let i = 0; i < rows.length; i += page) {
    const chunk = rows.slice(i, i + page);
    const { error } = await sb.from(table).insert(chunk);
    if (error) throw new Error(error.message);
  }
}
async function createDataBackup(userId, mode = "manual") {
  const tables = [
    "roles",
    "users",
    "menu_items",
    "ingredients",
    "promotions",
    "orders",
    "recipes",
    "order_items",
    "payments",
    "inventory_movements",
    "purchase_orders",
    "purchase_order_items",
    "cash_sessions",
    "cash_transactions",
    "audit_logs",
    "credit_customers",
    "credit_sales",
    "credit_payments",
    "credit_vendors",
    "credit_purchases",
    "credit_vendor_payments",
    "employee_register",
    "employee_ledger",
    "employee_salary_closures"
  ];
  const data = {};
  for (const table of tables) data[table] = await listAllRows(table);
  const stamp = now().replace(/[:.]/g, "-");
  const fileName = `pos-backup-${mode}-${stamp}.json`;
  const filePath = path.join(DAILY_BACKUPS_DIR, fileName);
  fs.writeFileSync(filePath, JSON.stringify({ version: 1, created_at: now(), mode, tables: data }, null, 2), "utf8");
  await audit(userId || null, "BACKUP_CREATED", { mode, filePath });
  return { fileName, filePath };
}
function listBackupFiles() {
  if (!fs.existsSync(DAILY_BACKUPS_DIR)) return [];
  return fs.readdirSync(DAILY_BACKUPS_DIR)
    .filter((n) => n.toLowerCase().endsWith(".json"))
    .map((n) => {
      const fp = path.join(DAILY_BACKUPS_DIR, n);
      const st = fs.statSync(fp);
      return { fileName: n, filePath: fp, sizeBytes: st.size, modifiedAt: st.mtime.toISOString() };
    })
    .sort((a, b) => (a.modifiedAt < b.modifiedAt ? 1 : -1));
}
async function restoreDataBackup(userId, fileName) {
  const safeName = path.basename(String(fileName || "").trim());
  if (!safeName || safeName.includes("..")) throw new Error("Invalid backup file.");
  const filePath = path.join(DAILY_BACKUPS_DIR, safeName);
  if (!fs.existsSync(filePath)) throw new Error("Backup file not found.");
  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const tables = parsed?.tables;
  if (!tables || typeof tables !== "object") throw new Error("Invalid backup payload.");

  const wipeOrder = [
    "audit_logs",
    "cash_transactions",
    "cash_sessions",
    "purchase_order_items",
    "purchase_orders",
    "inventory_movements",
    "payments",
    "order_items",
    "orders",
    "recipes",
    "ingredients",
    "menu_items",
    "promotions",
    "users",
    "roles",
    "credit_vendor_payments",
    "credit_purchases",
    "credit_vendors",
    "credit_payments",
    "credit_sales",
    "credit_customers",
    "employee_ledger",
    "employee_register",
    "employee_salary_closures"
  ];
  const insertOrder = [
    "roles",
    "users",
    "menu_items",
    "ingredients",
    "promotions",
    "orders",
    "recipes",
    "order_items",
    "payments",
    "inventory_movements",
    "purchase_orders",
    "purchase_order_items",
    "cash_sessions",
    "cash_transactions",
    "audit_logs",
    "credit_customers",
    "credit_sales",
    "credit_payments",
    "credit_vendors",
    "credit_purchases",
    "credit_vendor_payments",
    "employee_register",
    "employee_ledger",
    "employee_salary_closures"
  ];

  for (const table of wipeOrder) await del(table, (x) => x.neq("id", -1));
  for (const table of insertOrder) {
    const rows = Array.isArray(tables[table]) ? tables[table] : [];
    if (rows.length) await insertRows(table, rows);
  }
  await audit(userId || null, "BACKUP_RESTORED", { fileName: safeName });
  return { fileName: safeName };
}
async function ensureDailyBackup() {
  const day = todayKey(new Date());
  const hasToday = listBackupFiles().some((f) => f.fileName.includes(day));
  if (!hasToday) await createDataBackup(null, "auto");
}
async function audit(userId, action, payload = null) {
  try { await ins("audit_logs", { user_id: userId || null, action, payload_json: payload ? JSON.stringify(payload) : null, created_at: now() }); } catch (_) { }
}
async function role(userId) {
  if (!userId) return null;
  const u = await get("users", userId); if (!u || !u.active) return null;
  const r = await get("roles", u.role_id); return r ? r.name : null;
}
async function isAdmin(userId) { const r = await role(userId); return r === "ADMIN"; }
async function isMgr(userId) { const r = await role(userId); return r === "ADMIN" || r === "MANAGER"; }
async function openSession() { const r = await q("cash_sessions", (x) => x.eq("status", "OPEN").order("id", { ascending: false }).limit(1)); return r[0] || null; }
const monthKey = (v) => {
  const d = new Date(v);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const monthBounds = (key) => {
  const m = /^(\d{4})-(\d{2})$/.exec(String(key || ""));
  if (!m) return null;
  const y = Number(m[1]); const mm = Number(m[2]);
  if (!Number.isInteger(y) || !Number.isInteger(mm) || mm < 1 || mm > 12) return null;
  const from = new Date(y, mm - 1, 1, 0, 0, 0, 0);
  const to = new Date(y, mm, 0, 23, 59, 59, 999);
  return { fromMs: from.getTime(), toMs: to.getTime() };
};
async function getSalaryClosure(employeeId, mKey) {
  const rows = await q("employee_salary_closures", (x) => x.eq("employee_id", employeeId).eq("month_key", mKey).limit(1));
  return rows[0] || null;
}

function summarizeEmployeeRows(employees, ledgerRowsByEmployeeId) {
  return employees.map((emp) => {
    const rows = ledgerRowsByEmployeeId.get(emp.id) || [];
    const salaryAdjustmentsCents = rows
      .filter((r) => r.entry_type === "SALARY")
      .reduce((a, r) => a + Number(r.amount_cents || 0), 0);
    const creditCents = rows
      .filter((r) => r.entry_type === "CREDIT")
      .reduce((a, r) => a + Number(r.amount_cents || 0), 0);
    const baseSalaryCents = Number(emp.monthly_salary_cents || 0);
    const totalSalaryCents = baseSalaryCents + salaryAdjustmentsCents;
    return {
      ...emp,
      summary: {
        baseSalaryCents,
        salaryAdjustmentsCents,
        totalSalaryCents,
        salaryCents: totalSalaryCents,
        creditCents,
        netPayableCents: totalSalaryCents - creditCents
      }
    };
  });
}

function normalizeText(v) {
  const t = String(v || "").trim();
  return t ? t : null;
}

function ledgerSort(a, b) {
  const at = new Date(a.created_at || 0).getTime();
  const bt = new Date(b.created_at || 0).getTime();
  if (Number.isFinite(at) && Number.isFinite(bt) && at !== bt) return at - bt;
  return Number(a.id || 0) - Number(b.id || 0);
}

async function buildCustomerLedger(customerId) {
  const sales = await q("credit_sales", (x) => x.eq("customer_id", customerId));
  const payments = await q("credit_payments", (x) => x.eq("customer_id", customerId));
  const rows = [];
  for (const s of sales) {
    rows.push({
      id: `S${s.id}`,
      source_id: s.id,
      entry_type: "SALE",
      debit_cents: Number(s.remaining_cents || 0),
      credit_cents: 0,
      total_cents: Number(s.total_cents || 0),
      paid_cents: Number(s.paid_cents || 0),
      description: s.description || null,
      created_at: s.created_at
    });
  }
  for (const p of payments) {
    rows.push({
      id: `P${p.id}`,
      source_id: p.id,
      entry_type: "PAYMENT",
      debit_cents: 0,
      credit_cents: Number(p.amount_cents || 0),
      note: p.note || null,
      created_at: p.created_at
    });
  }
  rows.sort(ledgerSort);
  let balance = 0;
  const enriched = rows.map((r) => {
    balance += Number(r.debit_cents || 0) - Number(r.credit_cents || 0);
    return { ...r, balance_cents: balance };
  });
  return enriched;
}

async function buildVendorLedger(vendorId) {
  const purchases = await q("credit_purchases", (x) => x.eq("vendor_id", vendorId));
  const payments = await q("credit_vendor_payments", (x) => x.eq("vendor_id", vendorId));
  const rows = [];
  for (const p of purchases) {
    rows.push({
      id: `B${p.id}`,
      source_id: p.id,
      entry_type: "PURCHASE",
      debit_cents: Number(p.remaining_cents || 0),
      credit_cents: 0,
      total_cents: Number(p.total_cents || 0),
      paid_cents: Number(p.paid_cents || 0),
      description: p.description || null,
      created_at: p.created_at
    });
  }
  for (const p of payments) {
    rows.push({
      id: `V${p.id}`,
      source_id: p.id,
      entry_type: "PAYMENT",
      debit_cents: 0,
      credit_cents: Number(p.amount_cents || 0),
      note: p.note || null,
      created_at: p.created_at
    });
  }
  rows.sort(ledgerSort);
  let balance = 0;
  const enriched = rows.map((r) => {
    balance += Number(r.debit_cents || 0) - Number(r.credit_cents || 0);
    return { ...r, balance_cents: balance };
  });
  return enriched;
}

async function orderItems(orderId) {
  const items = await q("order_items", (x) => x.eq("order_id", orderId).order("id", { ascending: true }));
  if (!items.length) return [];
  const ids = Array.from(new Set(items.map((i) => i.menu_item_id).filter(Boolean)));
  const menu = ids.length ? await q("menu_items", (x) => x.in("id", ids)) : [];
  const by = new Map(menu.map((m) => [m.id, m]));
  return items.map((i) => {
    const mi = by.get(i.menu_item_id);
    const baseName = mi?.name || "Unknown Item";
    const sizeLabel = String(mi?.size || "").trim();
    const displayName = sizeLabel ? `${baseName} (${sizeLabel})` : baseName;
    return {
      ...i,
      item_name: displayName,
      category: mi?.category || null,
      size: mi?.size || null
    };
  });
}

function promoDiscount(p, subtotal, items, menuById) {
  if (!p || !promoTimeOk(p)) return 0;
  let d = 0;
  if (p.promo_type === "PERCENT_TOTAL") d = Math.round(subtotal * Number(p.value_num || 0) / 100);
  else if (p.promo_type === "FIXED_TOTAL") d = Math.round(Number(p.value_num || 0));
  else if (p.promo_type === "CATEGORY_PERCENT") {
    const catTotal = items.reduce((a, i) => (menuById.get(i.menu_item_id)?.category === p.category ? a + Number(i.line_total_cents || 0) : a), 0);
    d = Math.round(catTotal * Number(p.value_num || 0) / 100);
  }
  if (p.cap_cents != null) d = Math.min(d, Math.round(Number(p.cap_cents || 0)));
  return Math.max(0, Math.min(d, subtotal));
}

async function recalc(orderId) {
  const o = await get("orders", orderId); if (!o) throw new Error("Order not found.");
  const items = await q("order_items", (x) => x.eq("order_id", orderId));
  const subtotal = items.reduce((a, i) => a + Number(i.line_total_cents || 0), 0);
  const menuIds = Array.from(new Set(items.map((i) => i.menu_item_id).filter(Boolean)));
  const menu = menuIds.length ? await q("menu_items", (x) => x.in("id", menuIds)) : [];
  const menuById = new Map(menu.map((m) => [m.id, m]));

  let code = o.promo_code ? String(o.promo_code).trim().toUpperCase() : null;
  let promoId = null;
  let pdisc = 0;
  if (code) {
    const p = await q("promotions", (x) => x.eq("active", 1).ilike("code", code).limit(1));
    if (p[0]) { pdisc = promoDiscount(p[0], subtotal, items, menuById); if (pdisc > 0) { promoId = p[0].id; code = p[0].code ? String(p[0].code).toUpperCase() : null; } else code = null; }
    else code = null;
  }
  const req = Math.max(0, Math.round(Number(o.manual_discount_cents != null ? o.manual_discount_cents : o.discount_cents || 0)));
  const mdisc = Math.min(req, Math.max(0, subtotal - pdisc));
  const disc = Math.min(subtotal, mdisc + pdisc);
  const total = Math.max(0, subtotal - disc);
  await upd("orders", (x) => x.eq("id", orderId), { subtotal_cents: subtotal, manual_discount_cents: mdisc, promo_discount_cents: pdisc, promo_code: code, promo_id: promoId, discount_cents: disc, tax_cents: 0, total_cents: total, updated_at: now() });
  return get("orders", orderId);
}

function receiptHtml(data) {
  const { order, items, payment } = data;
  const itemRows = items.map((i) => {
    const qty = Number(i.quantity || 0);
    const lineName = `${qty} ${esc(i.item_name)}`;
    const amount = money(i.line_total_cents);
    return `<div class="line item-line"><span class="item-name">${lineName}</span><span class="item-amt">${amount}</span></div>`;
  }).join("");
  const fmtDate = (v) => {
    const d = new Date(v);
    if (!Number.isFinite(d.getTime())) return esc(String(v || "-"));
    const date = d.toLocaleDateString(undefined, { day: "2-digit", month: "long", year: "numeric" });
    const time = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
    return { date, time, full: `${date} ${time}` };
  };
  const dt = fmtDate(payment?.created_at || order.updated_at || order.created_at);
  const subtotalCents = Number(order.subtotal_cents || 0);
  const discountCents = Number(order.discount_cents || 0);
  const totalCents = Number(order.total_cents || 0);
  const isPending = String(order.status || "").toUpperCase() !== "PAID";
  const pendingLine = isPending ? `<div class="pending">PENDING</div>` : "";
  const paymentLabel = isPending ? "PENDING" : esc(payment?.method || "-");
  const receivedLabel = isPending ? "-" : money(payment?.received_cents);
  const changeLabel = isPending ? "-" : money(payment?.change_cents);
  const barcodeValue = `${order.id}${String(order.created_at || "").replace(/\D/g, "").slice(-10)}`;
  const logoPath = path.join(__dirname, "assets", "logo.png");
  const logoHtml = (() => {
    try {
      if (!fs.existsSync(logoPath)) return "";
      const b64 = fs.readFileSync(logoPath).toString("base64");
      return `<div class="logo-wrap"><img class="logo" src="data:image/png;base64,${b64}" alt="Logo" /></div>`;
    } catch (_) {
      return "";
    }
  })();
  const discountLine = discountCents > 0
    ? `<div class="line"><span>DISCOUNT</span><strong>${money(discountCents)}</strong></div>`
    : "";
  return `<!doctype html><html><head><meta charset="UTF-8"/><style>body{margin:0;background:#ececec;font-family:"Courier New",monospace;color:#111}.receipt{width:300px;margin:0 auto;background:#fff;padding:14px 12px 18px;line-height:1.25}.center{text-align:center}.logo-wrap{text-align:center;margin:0 0 8px}.logo{display:block;margin:0 auto;max-width:80px;max-height:80px;object-fit:contain}.title{font-size:20px;font-weight:700;margin:2px 0}.sub{font-size:13px}.time{font-size:24px;font-weight:700;letter-spacing:1px;margin:3px 0 2px}.rule{border-top:2px dashed #888;margin:8px 0}.line{display:flex;justify-content:space-between;gap:8px;margin:2px 0;font-size:12px}.item-line{margin:1px 0;font-size:11px}.item-name{flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.item-amt{min-width:84px;text-align:right}.totals{margin-top:8px}.total-row{font-size:20px;font-weight:800;letter-spacing:0.2px}.small{font-size:12px}.small-right{text-align:right;font-size:11px;color:#555}.customer-strong{font-size:15px;font-weight:700}.pending{font-size:12px;font-weight:700;color:#a14a4a;letter-spacing:0.08em}.barcode{height:48px;margin:12px auto 8px;background:repeating-linear-gradient(90deg,#000 0,#000 2px,#fff 2px,#fff 4px);border:1px solid #000}.faint{color:#444}</style></head><body><div class="receipt">${logoHtml}<div class="small-right">${esc(dt.full)}</div><div class="center"><div class="title">Order Receipt</div>${pendingLine}</div><div class="rule"></div><div class="center"><div class="sub">Order #${order.id}</div><div class="customer-strong">Customer: ${esc(order.customer_name || "Guest")}</div><div class="customer-strong">Phone: ${esc(order.customer_phone || "-")}</div></div><div class="rule"></div><div class="center faint">Cashier: ${esc(order.cashier || "-")}</div><div class="rule"></div>${itemRows}<div class="totals"><div class="line"><span>SUBTOTAL</span><strong>${money(subtotalCents)}</strong></div>${discountLine}<div class="line total-row"><span>TOTAL</span><span>${money(totalCents)}</span></div></div><div class="rule"></div><div class="small">Payment method: ${paymentLabel}</div><div class="small">Received: ${receivedLabel}</div><div class="small">Change: ${changeLabel}</div><div class="small">Reference: ${esc(barcodeValue || "-")}</div><div class="barcode"></div><div class="center sub">Thank you<br>Have a nice day.</div></div></body></html>`;
}

async function buildReceipt(orderId) {
  const order = await get("orders", orderId); if (!order) return null;
  const cashier = await get("users", order.cashier_user_id);
  const items = await orderItems(orderId);
  const pay = await q("payments", (x) => x.eq("order_id", orderId).order("id", { ascending: false }).limit(1));
  return { order: { ...order, cashier: cashier?.username || null }, items, payment: pay[0] || null };
}

async function receiptPdf(orderId) {
  const data = await buildReceipt(orderId); if (!data) throw new Error("Order not found for receipt.");
  const win = new BrowserWindow({ width: 360, height: 700, show: false, webPreferences: { sandbox: true } });
  try {
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(receiptHtml(data))}`);
    let pdf; try { pdf = await win.webContents.printToPDF({ printBackground: true, pageSize: "A6" }); } catch (_) { pdf = await win.webContents.printToPDF({ printBackground: true }); }
    const fp = path.join(RECEIPTS_DIR, `receipt-order-${orderId}-${now().replace(/[:.]/g, "-")}.pdf`);
    fs.writeFileSync(fp, pdf);
    try { await new Promise((r) => win.webContents.print({ silent: false, printBackground: true }, () => r())); } catch (_) { }
    return fp;
  } finally { if (!win.isDestroyed()) win.destroy(); }
}

async function processPayment({ orderId, method, amountCents, receivedCents, userId }) {
  const m = String(method || "").toUpperCase();
  if (!["CASH", "CARD", "VOUCHER"].includes(m)) return { ok: false, error: "Invalid payment method." };
  const order = await get("orders", orderId);
  if (!order) return { ok: false, error: "Order not found." };
  if (order.status === "PAID") return { ok: false, error: "Order already paid." };
  if (order.status !== "FINALIZED") return { ok: false, error: "Order must be FINALIZED before payment." };
  const ex = await q("payments", (x) => x.eq("order_id", orderId));
  const paid = ex.reduce((a, p) => a + Number(p.amount_cents || 0), 0);
  const rem = Math.max(0, Number(order.total_cents || 0) - paid);
  if (rem <= 0) return { ok: false, error: "No outstanding balance on this order." };
  const amt = Math.round(Number(amountCents || 0));
  if (!Number.isFinite(amt) || amt <= 0) return { ok: false, error: "Payment amount must be greater than zero." };
  if (amt > rem) return { ok: false, error: "Payment amount cannot exceed remaining balance." };
  const recv = receivedCents == null ? null : Math.round(Number(receivedCents || 0));
  let change = 0;
  if (m === "CASH") {
    if (!Number.isFinite(recv) || recv < amt) return { ok: false, error: "Received cash is less than payment amount." };
    change = recv - amt;
  }
  const pay = await ins("payments", { order_id: orderId, method: m, amount_cents: amt, received_cents: m === "CASH" ? recv : null, change_cents: m === "CASH" ? change : 0, created_at: now() });
  if (m === "CASH") {
    const s = await openSession(); if (!s) return { ok: false, error: "Open a cash shift before taking cash payment." };
    await ins("cash_transactions", { session_id: s.id, transaction_type: "IN", amount_cents: amt, reason: "Order Payment", reference_type: "ORDER", reference_id: String(orderId), user_id: userId || null, created_at: now() });
  }
  const aft = await q("payments", (x) => x.eq("order_id", orderId));
  const paidAfter = aft.reduce((a, p) => a + Number(p.amount_cents || 0), 0);
  const remAfter = Math.max(0, Number(order.total_cents || 0) - paidAfter);
  const isPaid = remAfter <= 0;
  if (isPaid) await upd("orders", (x) => x.eq("id", orderId), { status: "PAID", paid_at: now(), updated_at: now() });
  else await upd("orders", (x) => x.eq("id", orderId), { updated_at: now() });
  const receiptPath = isPaid ? await receiptPdf(orderId) : null;
  await audit(userId || null, "ORDER_PAYMENT_ADDED", { orderId, method: m, amount: amt, received: m === "CASH" ? recv : null, change: m === "CASH" ? change : 0, paidCents: paidAfter, remainingCents: remAfter });
  return { ok: true, paymentId: pay.id, method: m, amountCents: amt, receivedCents: m === "CASH" ? recv : null, changeCents: m === "CASH" ? change : 0, paidCents: paidAfter, remainingCents: remAfter, isPaid, receiptPath };
}

async function shortages(orderId) {
  const items = await q("order_items", (x) => x.eq("order_id", orderId));
  const menuIds = Array.from(new Set(items.map((i) => i.menu_item_id).filter(Boolean)));
  const recipes = menuIds.length ? await q("recipes", (x) => x.in("menu_item_id", menuIds)) : [];
  const req = new Map();
  for (const it of items) for (const r of recipes.filter((x) => x.menu_item_id === it.menu_item_id)) req.set(r.ingredient_id, (req.get(r.ingredient_id) || 0) + Number(r.qty_per_item || 0) * Number(it.quantity || 0));
  const ids = Array.from(req.keys());
  const ing = ids.length ? await q("ingredients", (x) => x.in("id", ids)) : [];
  const by = new Map(ing.map((i) => [i.id, i]));
  const out = [];
  for (const id of ids) {
    const i = by.get(id); if (!i) continue;
    const need = req.get(id) || 0; const cur = Number(i.stock_qty || 0);
    if (need > cur) out.push({ ingredient_id: i.id, ingredient_name: i.name, current_stock: cur, required_qty: need });
  }
  return out;
}

async function deductStock(orderId, userId) {
  const items = await q("order_items", (x) => x.eq("order_id", orderId));
  const menuIds = Array.from(new Set(items.map((i) => i.menu_item_id).filter(Boolean)));
  const recipes = menuIds.length ? await q("recipes", (x) => x.in("menu_item_id", menuIds)) : [];
  for (const it of items) {
    for (const r of recipes.filter((x) => x.menu_item_id === it.menu_item_id)) {
      const i = await get("ingredients", r.ingredient_id); if (!i) continue;
      const d = Number(r.qty_per_item || 0) * Number(it.quantity || 0);
      await upd("ingredients", (x) => x.eq("id", i.id), { stock_qty: Number(i.stock_qty || 0) - d, updated_at: now() });
      await ins("inventory_movements", { ingredient_id: i.id, movement_type: "OUT", quantity: d, reason: "Order Finalized", reference_type: "ORDER", reference_id: String(orderId), user_id: userId || null, created_at: now() });
    }
  }
}

function registerIpc() {
  ipcMain.handle("auth:login", async (_, p) => {
    try {
      const u = (await q("users", (x) => x.eq("username", p.username).eq("active", 1).limit(1)))[0] || null;
      if (!u || u.pin_hash !== hashPin(p.pin)) return { ok: false, error: "Invalid username or PIN." };
      const r = await get("roles", u.role_id);
      await audit(u.id, "LOGIN_SUCCESS", { username: p.username });
      return { ok: true, user: { id: u.id, username: u.username, role: r?.name || "CASHIER" } };
    } catch (e) { return { ok: false, error: e.message || "Login failed." }; }
  });

  ipcMain.handle("menu:list", async (_, p = {}) => { try { if (p.includeInactive && !(await isMgr(p.userId))) return { ok: false, error: "Only admin/manager can manage menu." }; return { ok: true, items: await q("menu_items", (x) => (p.includeInactive ? x : x.eq("active", 1)).order("category", { ascending: true }).order("size", { ascending: true }).order("name", { ascending: true })) }; } catch (e) { return { ok: false, error: e.message || "Failed." }; } });
  ipcMain.handle("menu:create", async (_, p = {}) => { try { if (!(await isMgr(p.userId))) return { ok: false, error: "Only admin/manager can create menu items." }; if (!p.name || !p.category) return { ok: false, error: "Name and category are required." }; const price = Number(p.priceCents); if (!Number.isFinite(price) || price < 0) return { ok: false, error: "Invalid price." }; const size = p.size == null ? null : String(p.size).trim(); const row = await ins("menu_items", { name: String(p.name).trim(), category: String(p.category).trim(), size: size ? size : null, price_cents: Math.round(price), active: p.active ? 1 : 0 }); await audit(p.userId, "MENU_ITEM_CREATED", { menuItemId: row.id }); return { ok: true, id: row.id }; } catch (e) { return { ok: false, error: e.message || "Failed." }; } });
  ipcMain.handle("menu:update", async (_, p = {}) => { try { if (!(await isMgr(p.userId))) return { ok: false, error: "Only admin/manager can update menu items." }; const it = await get("menu_items", p.menuItemId); if (!it) return { ok: false, error: "Menu item not found." }; const u = {}; if (p.name != null) u.name = String(p.name).trim(); if (p.category != null) u.category = String(p.category).trim(); if (p.size != null) { const s = String(p.size).trim(); u.size = s ? s : null; } if (p.priceCents != null) { const v = Number(p.priceCents); if (!Number.isFinite(v) || v < 0) return { ok: false, error: "Invalid price." }; u.price_cents = Math.round(v); } if (p.active != null) u.active = p.active ? 1 : 0; if (!Object.keys(u).length) return { ok: false, error: "No fields to update." }; await upd("menu_items", (x) => x.eq("id", p.menuItemId), u); await audit(p.userId, "MENU_ITEM_UPDATED", { menuItemId: p.menuItemId }); return { ok: true }; } catch (e) { return { ok: false, error: e.message || "Failed." }; } });

  ipcMain.handle("promotions:list", async () => { try { return { ok: true, promotions: await q("promotions", (x) => x.order("active", { ascending: false }).order("id", { ascending: false })) }; } catch (e) { return { ok: false, error: e.message || "Failed." }; } });
  ipcMain.handle("promotions:create", async (_, p = {}) => { try { if (!(await isMgr(p.userId))) return { ok: false, error: "Only admin/manager can create promotions." }; const row = await ins("promotions", { code: p.code ? String(p.code).trim().toUpperCase() : null, name: String(p.name).trim(), promo_type: String(p.promoType), value_num: Number(p.valueNum || 0), cap_cents: p.capCents == null || p.capCents === "" ? null : Math.max(0, Math.round(Number(p.capCents))), category: p.category ? String(p.category).trim() : null, start_time: p.startTime ? String(p.startTime).trim() : null, end_time: p.endTime ? String(p.endTime).trim() : null, days_mask: p.daysMask ? String(p.daysMask).trim() : null, active: p.active === false ? 0 : 1, auto_apply: p.autoApply ? 1 : 0, created_at: now() }); await audit(p.userId, "PROMOTION_CREATED", { promotionId: row.id }); return { ok: true, id: row.id }; } catch (e) { return { ok: false, error: e.message || "Failed." }; } });
  ipcMain.handle("promotions:update", async (_, p = {}) => { try { if (!(await isMgr(p.userId))) return { ok: false, error: "Only admin/manager can update promotions." }; const pr = await get("promotions", p.promotionId); if (!pr) return { ok: false, error: "Promotion not found." }; await upd("promotions", (x) => x.eq("id", p.promotionId), { code: p.code ? String(p.code).trim().toUpperCase() : null, name: String(p.name).trim(), promo_type: String(p.promoType), value_num: Number(p.valueNum || 0), cap_cents: p.capCents == null || p.capCents === "" ? null : Math.max(0, Math.round(Number(p.capCents))), category: p.category ? String(p.category).trim() : null, start_time: p.startTime ? String(p.startTime).trim() : null, end_time: p.endTime ? String(p.endTime).trim() : null, days_mask: p.daysMask ? String(p.daysMask).trim() : null, active: p.active ? 1 : 0, auto_apply: p.autoApply ? 1 : 0 }); await audit(p.userId, "PROMOTION_UPDATED", { promotionId: p.promotionId }); return { ok: true }; } catch (e) { return { ok: false, error: e.message || "Failed." }; } });

  ipcMain.handle("orders:create", async (_, p) => { try { const s = await openSession(); if (!s) return { ok: false, error: "Open a cash shift before creating orders." }; const o = await ins("orders", { status: "DRAFT", subtotal_cents: 0, manual_discount_cents: 0, promo_discount_cents: 0, promo_code: null, promo_id: null, discount_cents: 0, tax_cents: 0, total_cents: 0, cashier_user_id: p.cashierUserId, notes: p.notes || null, created_at: now(), updated_at: now() }); await audit(p.cashierUserId, "ORDER_CREATED", { orderId: o.id }); return { ok: true, orderId: o.id }; } catch (e) { return { ok: false, error: e.message || "Failed." }; } });
  ipcMain.handle("orders:list-open", async (_, p = {}) => { try { const os = await q("orders", (x) => { let b = x.in("status", ["DRAFT", "HOLD"]); if (p.cashierUserId) b = b.eq("cashier_user_id", p.cashierUserId); return b.order("updated_at", { ascending: false }).limit(25); }); const ids = os.map((o) => o.id); const its = ids.length ? await q("order_items", (x) => x.in("order_id", ids)) : []; const m = new Map(); for (const i of its) m.set(i.order_id, (m.get(i.order_id) || 0) + Number(i.quantity || 0)); return { ok: true, orders: os.map((o) => ({ id: o.id, status: o.status, customer_name: o.customer_name, customer_phone: o.customer_phone, total_cents: o.total_cents, updated_at: o.updated_at, item_count: m.get(o.id) || 0 })) }; } catch (e) { return { ok: false, error: e.message || "Failed." }; } });
  ipcMain.handle("orders:get", async (_, p) => { try { const o = await get("orders", p.orderId); if (!o) return { ok: false, error: "Order not found." }; return { ok: true, order: o, items: await orderItems(p.orderId) }; } catch (e) { return { ok: false, error: e.message || "Failed." }; } });
  ipcMain.handle("orders:get-payments", async (_, p) => { try { const o = await get("orders", p.orderId); if (!o) return { ok: false, error: "Order not found." }; const pays = await q("payments", (x) => x.eq("order_id", p.orderId).order("id", { ascending: true })); const paid = pays.reduce((a, r) => a + Number(r.amount_cents || 0), 0); return { ok: true, payments: pays, paidCents: paid, remainingCents: Math.max(0, Number(o.total_cents || 0) - paid), orderTotalCents: Number(o.total_cents || 0), status: o.status }; } catch (e) { return { ok: false, error: e.message || "Failed." }; } });
  ipcMain.handle("orders:add-item", async (_, p) => { try { const o = await get("orders", p.orderId); if (!o) return { ok: false, error: "Order not found." }; if (!["DRAFT", "HOLD"].includes(o.status)) return { ok: false, error: "Only DRAFT/HOLD orders can be edited." }; const mi = await get("menu_items", p.menuItemId); if (!mi) return { ok: false, error: "Menu item not found." }; const qty = Number(p.quantity || 1); if (qty <= 0) return { ok: false, error: "Quantity must be positive." }; if (!p.modifiers) { const ex = await q("order_items", (x) => x.eq("order_id", p.orderId).eq("menu_item_id", p.menuItemId).is("modifiers_json", null).limit(1)); if (ex[0]) { const n = Number(ex[0].quantity || 0) + qty; await upd("order_items", (x) => x.eq("id", ex[0].id), { quantity: n, line_total_cents: Number(mi.price_cents || 0) * n }); } else { await ins("order_items", { order_id: p.orderId, menu_item_id: p.menuItemId, quantity: qty, unit_price_cents: Number(mi.price_cents || 0), line_total_cents: Number(mi.price_cents || 0) * qty, modifiers_json: null }); } } else { await ins("order_items", { order_id: p.orderId, menu_item_id: p.menuItemId, quantity: qty, unit_price_cents: Number(mi.price_cents || 0), line_total_cents: Number(mi.price_cents || 0) * qty, modifiers_json: JSON.stringify(p.modifiers) }); } await recalc(p.orderId); return { ok: true }; } catch (e) { return { ok: false, error: e.message || "Failed." }; } });
  ipcMain.handle("orders:update-item-qty", async (_, p) => { try { const o = await get("orders", p.orderId); if (!o) return { ok: false, error: "Order not found." }; if (!["DRAFT", "HOLD"].includes(o.status)) return { ok: false, error: "Only DRAFT/HOLD orders can be edited." }; const it = await get("order_items", p.orderItemId); if (!it || it.order_id !== p.orderId) return { ok: false, error: "Order item not found." }; const qty = Number(p.quantity); if (qty <= 0) await del("order_items", (x) => x.eq("id", p.orderItemId)); else await upd("order_items", (x) => x.eq("id", p.orderItemId), { quantity: qty, line_total_cents: Number(it.unit_price_cents || 0) * qty }); await recalc(p.orderId); return { ok: true }; } catch (e) { return { ok: false, error: e.message || "Failed." }; } });
  ipcMain.handle("orders:update-discount", async (_, p) => { try { const o = await get("orders", p.orderId); if (!o) return { ok: false, error: "Order not found." }; if (["PAID", "CANCELLED"].includes(o.status)) return { ok: false, error: "Discount can be updated only before payment/cancel." }; const req = Math.round(Number(p.discountCents || 0)); if (!Number.isFinite(req) || req < 0) return { ok: false, error: "Invalid discount amount." }; await upd("orders", (x) => x.eq("id", p.orderId), { manual_discount_cents: req, discount_cents: req, updated_at: now() }); const u = await recalc(p.orderId); await audit(p.userId || null, "ORDER_DISCOUNT_UPDATED", { orderId: p.orderId, discountCents: u.discount_cents }); const manualDiscountCents = u.manual_discount_cents != null ? Number(u.manual_discount_cents || 0) : Math.max(0, Number(u.discount_cents || 0) - Number(u.promo_discount_cents || 0)); return { ok: true, manualDiscountCents, promoDiscountCents: u.promo_discount_cents, discountCents: u.discount_cents, totalCents: u.total_cents }; } catch (e) { return { ok: false, error: e.message || "Failed." }; } });
  ipcMain.handle("orders:apply-promo", async (_, p) => { try { const o = await get("orders", p.orderId); if (!o) return { ok: false, error: "Order not found." }; if (["PAID", "CANCELLED"].includes(o.status)) return { ok: false, error: "Promo can be applied only before payment/cancel." }; const code = String(p.promoCode || "").trim().toUpperCase(); if (!code) return { ok: false, error: "Promo code is required." }; const pr = await q("promotions", (x) => x.eq("active", 1).ilike("code", code).limit(1)); if (!pr[0]) return { ok: false, error: "Invalid promo code." }; if (!promoTimeOk(pr[0])) return { ok: false, error: "Promo is not active at this time." }; await upd("orders", (x) => x.eq("id", p.orderId), { promo_code: code, promo_id: pr[0].id, updated_at: now() }); const u = await recalc(p.orderId); await audit(p.userId || null, "ORDER_PROMO_APPLIED", { orderId: p.orderId, promoCode: code, promoId: pr[0].id }); return { ok: true, promo: u }; } catch (e) { return { ok: false, error: e.message || "Failed." }; } });
  ipcMain.handle("orders:clear-promo", async (_, p) => { try { const o = await get("orders", p.orderId); if (!o) return { ok: false, error: "Order not found." }; if (["PAID", "CANCELLED"].includes(o.status)) return { ok: false, error: "Promo can be cleared only before payment/cancel." }; await upd("orders", (x) => x.eq("id", p.orderId), { promo_code: null, promo_id: null, promo_discount_cents: 0, updated_at: now() }); await recalc(p.orderId); await audit(p.userId || null, "ORDER_PROMO_CLEARED", { orderId: p.orderId }); return { ok: true }; } catch (e) { return { ok: false, error: e.message || "Failed." }; } });
  ipcMain.handle("orders:update-customer", async (_, p) => { try { const o = await get("orders", p.orderId); if (!o) return { ok: false, error: "Order not found." }; if (!["DRAFT", "HOLD"].includes(o.status)) return { ok: false, error: "Customer details can be updated only for DRAFT/HOLD orders." }; await upd("orders", (x) => x.eq("id", p.orderId), { customer_name: p.customerName ? String(p.customerName).trim() : null, customer_phone: p.customerPhone ? String(p.customerPhone).trim() : null, updated_at: now() }); await audit(p.userId || null, "ORDER_CUSTOMER_UPDATED", { orderId: p.orderId }); return { ok: true }; } catch (e) { return { ok: false, error: e.message || "Failed." }; } });
  ipcMain.handle("orders:update-status", async (_, p) => { try { const st = String(p.status || "").toUpperCase(); if (!["DRAFT", "HOLD", "CANCELLED", "FINALIZED", "PAID"].includes(st)) return { ok: false, error: "Invalid status." }; const o = await get("orders", p.orderId); if (!o) return { ok: false, error: "Order not found." }; if (st === "FINALIZED" && !["FINALIZED", "PAID"].includes(o.status)) { const s = await shortages(p.orderId); if (s.length) return { ok: false, error: "Insufficient stock.", shortages: s }; await deductStock(p.orderId, p.userId); } await upd("orders", (x) => x.eq("id", p.orderId), { status: st, updated_at: now() }); await audit(p.userId || null, "ORDER_STATUS_UPDATED", { orderId: p.orderId, status: st }); return { ok: true }; } catch (e) { return { ok: false, error: e.message || "Failed." }; } });
  ipcMain.handle("orders:add-payment", async (_, p) => { try { return await processPayment(p); } catch (e) { return { ok: false, error: e.message || "Failed." }; } });
  ipcMain.handle("orders:pay-cash", async (_, p) => { try { const o = await get("orders", p.orderId); if (!o) return { ok: false, error: "Order not found." }; const ex = await q("payments", (x) => x.eq("order_id", p.orderId)); const rem = Math.max(0, Number(o.total_cents || 0) - ex.reduce((a, r) => a + Number(r.amount_cents || 0), 0)); return await processPayment({ orderId: p.orderId, method: "CASH", amountCents: rem, receivedCents: p.receivedCents, userId: p.userId }); } catch (e) { return { ok: false, error: e.message || "Failed." }; } });

  ipcMain.handle("inventory:list", async () => { try { return { ok: true, ingredients: await q("ingredients", (x) => x.order("name", { ascending: true })) }; } catch (e) { return { ok: false, error: e.message || "Failed." }; } });
  ipcMain.handle("inventory:adjust", async (_, p) => { try { if (!(await isMgr(p.userId))) return { ok: false, error: "Only admin/manager can adjust inventory." }; const i = await get("ingredients", p.ingredientId); if (!i) return { ok: false, error: "Ingredient not found." }; const d = Number(p.qty || 0); await upd("ingredients", (x) => x.eq("id", p.ingredientId), { stock_qty: Number(i.stock_qty || 0) + d, updated_at: now() }); await ins("inventory_movements", { ingredient_id: p.ingredientId, movement_type: d >= 0 ? "IN" : "OUT", quantity: Math.abs(d), reason: p.reason || "Manual adjustment", reference_type: "MANUAL", reference_id: null, user_id: p.userId || null, created_at: now() }); await audit(p.userId, "INVENTORY_ADJUSTED", { ingredientId: p.ingredientId, qty: p.qty }); return { ok: true }; } catch (e) { return { ok: false, error: e.message || "Failed." }; } });
  ipcMain.handle("inventory:purchase", async (_, p) => { try { if (!(await isMgr(p.userId))) return { ok: false, error: "Only admin/manager can record purchases." }; const n = Number(p.qty || 0); if (n <= 0) return { ok: false, error: "Purchase quantity must be positive." }; const i = await get("ingredients", p.ingredientId); if (!i) return { ok: false, error: "Ingredient not found." }; await upd("ingredients", (x) => x.eq("id", p.ingredientId), { stock_qty: Number(i.stock_qty || 0) + n, updated_at: now() }); await ins("inventory_movements", { ingredient_id: p.ingredientId, movement_type: "IN", quantity: n, reason: "Purchase Entry", reference_type: "PURCHASE", reference_id: p.supplierRef || null, user_id: p.userId || null, created_at: now() }); await audit(p.userId, "INVENTORY_PURCHASE", { ingredientId: p.ingredientId, qty: n }); return { ok: true }; } catch (e) { return { ok: false, error: e.message || "Failed." }; } });
  ipcMain.handle("inventory:create-ingredient", async (_, p = {}) => { try { if (!(await isMgr(p.userId))) return { ok: false, error: "Only admin/manager can create ingredients." }; if (!p.name || !p.unit) return { ok: false, error: "Name and unit are required." }; const r = await ins("ingredients", { name: String(p.name).trim(), unit: String(p.unit).trim(), stock_qty: Number(p.stockQty || 0), unit_cost_cents: Math.max(0, Math.round(Number(p.unitCostCents || 0))), low_stock_threshold: Number(p.lowStockThreshold || 0), supplier: p.supplier ? String(p.supplier).trim() : null, updated_at: now() }); await audit(p.userId, "INGREDIENT_CREATED", { ingredientId: r.id }); return { ok: true, ingredientId: r.id }; } catch (e) { return { ok: false, error: e.message || "Failed." }; } });
  ipcMain.handle("inventory:update-ingredient", async (_, p = {}) => { try { if (!(await isMgr(p.userId))) return { ok: false, error: "Only admin/manager can update ingredients." }; const i = await get("ingredients", p.ingredientId); if (!i) return { ok: false, error: "Ingredient not found." }; await upd("ingredients", (x) => x.eq("id", p.ingredientId), { name: String(p.name).trim(), unit: String(p.unit).trim(), unit_cost_cents: Math.max(0, Math.round(Number(p.unitCostCents || 0))), low_stock_threshold: Number(p.lowStockThreshold || 0), supplier: p.supplier ? String(p.supplier).trim() : null, updated_at: now() }); await audit(p.userId, "INGREDIENT_UPDATED", { ingredientId: p.ingredientId }); return { ok: true }; } catch (e) { return { ok: false, error: e.message || "Failed." }; } });
  ipcMain.handle("procurement:create-po", async (_, p = {}) => { try { if (!(await isMgr(p.userId))) return { ok: false, error: "Only admin/manager can create purchase orders." }; const supplier = String(p.supplier || "").trim(); const items = Array.isArray(p.items) ? p.items : []; if (!supplier) return { ok: false, error: "Supplier is required." }; if (!items.length) return { ok: false, error: "Add at least one PO item." }; const po = await ins("purchase_orders", { supplier, status: "OPEN", notes: p.notes ? String(p.notes).trim() : null, created_by_user_id: p.userId || null, created_at: now(), updated_at: now(), received_at: null, total_cost_cents: 0 }); let total = 0; for (const raw of items) { const ingredientId = Number(raw.ingredientId || 0); const qty = Number(raw.qty || 0); const unitCostCents = Math.max(0, Math.round(Number(raw.unitCostCents || 0))); if (!ingredientId || qty <= 0) continue; const ing = await get("ingredients", ingredientId); if (!ing) continue; const lineCost = Math.round(qty * unitCostCents); total += lineCost; await ins("purchase_order_items", { po_id: po.id, ingredient_id: ingredientId, ingredient_name: ing.name, qty_ordered: qty, qty_received: 0, unit_cost_cents: unitCostCents, line_cost_cents: lineCost }); } await upd("purchase_orders", (x) => x.eq("id", po.id), { total_cost_cents: total, updated_at: now() }); await audit(p.userId || null, "PO_CREATED", { poId: po.id, supplier, itemCount: items.length, totalCostCents: total }); return { ok: true, poId: po.id }; } catch (e) { return { ok: false, error: e.message || "Failed to create PO." }; } });
  ipcMain.handle("procurement:list-po", async (_, p = {}) => { try { const st = p.status ? String(p.status).toUpperCase() : null; const rows = await q("purchase_orders", (x) => st ? x.eq("status", st).order("id", { ascending: false }).limit(100) : x.order("id", { ascending: false }).limit(100)); return { ok: true, orders: rows }; } catch (e) { return { ok: false, error: e.message || "Failed to list PO." }; } });
  ipcMain.handle("procurement:get-po", async (_, p = {}) => { try { const poId = Number(p.poId || 0); if (!poId) return { ok: false, error: "Invalid PO id." }; const order = await get("purchase_orders", poId); if (!order) return { ok: false, error: "PO not found." }; const items = await q("purchase_order_items", (x) => x.eq("po_id", poId).order("id", { ascending: true })); return { ok: true, order, items }; } catch (e) { return { ok: false, error: e.message || "Failed to get PO." }; } });
  ipcMain.handle("procurement:receive-po", async (_, p = {}) => { try { if (!(await isMgr(p.userId))) return { ok: false, error: "Only admin/manager can receive purchase orders." }; const poId = Number(p.poId || 0); const po = await get("purchase_orders", poId); if (!po) return { ok: false, error: "PO not found." }; if (po.status !== "OPEN") return { ok: false, error: "Only OPEN PO can be received." }; const items = await q("purchase_order_items", (x) => x.eq("po_id", poId)); for (const item of items) { const ing = await get("ingredients", item.ingredient_id); if (!ing) continue; const qtyToReceive = Number(item.qty_ordered || 0); if (qtyToReceive <= 0) continue; await upd("ingredients", (x) => x.eq("id", ing.id), { stock_qty: Number(ing.stock_qty || 0) + qtyToReceive, unit_cost_cents: Math.max(0, Math.round(Number(item.unit_cost_cents || ing.unit_cost_cents || 0))), updated_at: now() }); await upd("purchase_order_items", (x) => x.eq("id", item.id), { qty_received: qtyToReceive }); await ins("inventory_movements", { ingredient_id: ing.id, movement_type: "IN", quantity: qtyToReceive, reason: "PO Received", reference_type: "PO", reference_id: String(poId), user_id: p.userId || null, created_at: now() }); } await upd("purchase_orders", (x) => x.eq("id", poId), { status: "RECEIVED", received_at: now(), updated_at: now() }); await audit(p.userId || null, "PO_RECEIVED", { poId }); return { ok: true }; } catch (e) { return { ok: false, error: e.message || "Failed to receive PO." }; } });
  ipcMain.handle("reports:procurement", async () => { try { const ingredients = await q("ingredients", (x) => x.order("name", { ascending: true })); const valuation = ingredients.reduce((acc, i) => acc + Math.round(Number(i.stock_qty || 0) * Number(i.unit_cost_cents || 0)), 0); const po = await q("purchase_orders", (x) => x.order("id", { ascending: false }).limit(500)); const openCount = po.filter((r) => r.status === "OPEN").length; const receivedCount = po.filter((r) => r.status === "RECEIVED").length; const todayReceivedValue = po.filter((r) => r.received_at && isToday(r.received_at)).reduce((acc, r) => acc + Number(r.total_cost_cents || 0), 0); const topSuppliersMap = new Map(); for (const row of po) { const key = row.supplier || "-"; topSuppliersMap.set(key, (topSuppliersMap.get(key) || 0) + Number(row.total_cost_cents || 0)); } const topSuppliers = Array.from(topSuppliersMap.entries()).map(([supplier, total_cost_cents]) => ({ supplier, total_cost_cents })).sort((a, b) => b.total_cost_cents - a.total_cost_cents).slice(0, 5); return { ok: true, procurement: { stockValuationCents: valuation, openPoCount: openCount, receivedPoCount: receivedCount, todayReceivedValueCents: todayReceivedValue, topSuppliers, recentPO: po.slice(0, 20) } }; } catch (e) { return { ok: false, error: e.message || "Failed procurement report." }; } });

  ipcMain.handle("cash:open-session", async (_, p) => { try { if (await openSession()) return { ok: false, error: "An open cash session already exists." }; const r = await ins("cash_sessions", { opened_by_user_id: p.userId, opening_cents: Number(p.openingCents || 0), opened_at: now(), status: "OPEN" }); await audit(p.userId, "CASH_SESSION_OPENED", { sessionId: r.id }); return { ok: true, sessionId: r.id }; } catch (e) { return { ok: false, error: e.message || "Failed." }; } });
  ipcMain.handle("cash:get-open-session", async () => { try { const s = await openSession(); if (!s) return { ok: true, session: null }; const tx = await q("cash_transactions", (x) => x.eq("session_id", s.id)); const inT = tx.filter((t) => t.transaction_type === "IN").reduce((a, t) => a + Number(t.amount_cents || 0), 0); const outT = tx.filter((t) => t.transaction_type === "OUT").reduce((a, t) => a + Number(t.amount_cents || 0), 0); const sales = tx.filter((t) => t.reason === "Order Payment").reduce((a, t) => a + Number(t.amount_cents || 0), 0); return { ok: true, session: s, totals: { inOut: [{ transaction_type: "IN", total: inT }, { transaction_type: "OUT", total: outT }], sales } }; } catch (e) { return { ok: false, error: e.message || "Failed." }; } });
  ipcMain.handle("cash:add-transaction", async (_, p) => { try { if (!["IN", "OUT"].includes(p.type)) return { ok: false, error: "Invalid transaction type." }; const n = Number(p.amountCents || 0); if (n <= 0) return { ok: false, error: "Amount must be positive." }; await ins("cash_transactions", { session_id: p.sessionId, transaction_type: p.type, amount_cents: n, reason: p.reason || "Manual cash movement", reference_type: "MANUAL", reference_id: null, user_id: p.userId || null, created_at: now() }); await audit(p.userId, "CASH_TRANSACTION_ADDED", { sessionId: p.sessionId, type: p.type, amount: n }); return { ok: true }; } catch (e) { return { ok: false, error: e.message || "Failed." }; } });
  ipcMain.handle("cash:close-session", async (_, p) => { try { const s = await get("cash_sessions", p.sessionId); if (!s || s.status !== "OPEN") return { ok: false, error: "Open session not found." }; const tx = await q("cash_transactions", (x) => x.eq("session_id", p.sessionId)); const totals = tx.reduce((a, r) => { if (r.transaction_type === "IN") a.in += Number(r.amount_cents || 0); if (r.transaction_type === "OUT") a.out += Number(r.amount_cents || 0); return a; }, { in: 0, out: 0 }); const expected = Number(s.opening_cents || 0) + totals.in - totals.out; const actual = Number(p.actualClosingCents || 0); const variance = actual - expected; await upd("cash_sessions", (x) => x.eq("id", p.sessionId), { closed_by_user_id: p.userId, closing_cents: actual, expected_closing_cents: expected, variance_cents: variance, denomination_json: p.denominationCounts ? JSON.stringify(p.denominationCounts) : null, closed_at: now(), status: "CLOSED" }); await audit(p.userId, "CASH_SESSION_CLOSED", { sessionId: p.sessionId, expected, actual, variance }); return { ok: true, expected, actual, variance }; } catch (e) { return { ok: false, error: e.message || "Failed." }; } });

  ipcMain.handle("employee:list", async (_, p = {}) => {
    try {
      if (!(await isAdmin(p.userId))) return { ok: false, error: "Only admin can access employee register." };
      const includeInactive = !!p.includeInactive;
      const employees = await q("employee_register", (x) => (includeInactive ? x : x.eq("active", 1)).order("full_name", { ascending: true }));
      const ids = employees.map((e) => e.id);
      const ledgerRows = ids.length ? await q("employee_ledger", (x) => x.in("employee_id", ids)) : [];
      const grouped = new Map();
      for (const row of ledgerRows) {
        const bucket = grouped.get(row.employee_id) || [];
        bucket.push(row);
        grouped.set(row.employee_id, bucket);
      }
      return { ok: true, employees: summarizeEmployeeRows(employees, grouped) };
    } catch (e) { return { ok: false, error: e.message || "Failed to list employees." }; }
  });

  ipcMain.handle("employee:create", async (_, p = {}) => {
    try {
      if (!(await isAdmin(p.userId))) return { ok: false, error: "Only admin can create employees." };
      const fullName = String(p.fullName || "").trim();
      if (!fullName) return { ok: false, error: "Employee name is required." };
      const monthlySalaryCents = Math.max(0, Math.round(Number(p.monthlySalaryCents || 0)));
      const row = await ins("employee_register", {
        full_name: fullName,
        phone: p.phone ? String(p.phone).trim() : null,
        monthly_salary_cents: monthlySalaryCents,
        notes: p.notes ? String(p.notes).trim() : null,
        active: p.active === false ? 0 : 1,
        created_at: now(),
        updated_at: now()
      });
      await audit(p.userId, "EMPLOYEE_CREATED", { employeeId: row.id, fullName: row.full_name });
      return { ok: true, employeeId: row.id };
    } catch (e) { return { ok: false, error: e.message || "Failed to create employee." }; }
  });

  ipcMain.handle("employee:update", async (_, p = {}) => {
    try {
      if (!(await isAdmin(p.userId))) return { ok: false, error: "Only admin can update employees." };
      const employeeId = Number(p.employeeId || 0);
      if (!employeeId) return { ok: false, error: "Invalid employee id." };
      const employee = await get("employee_register", employeeId);
      if (!employee) return { ok: false, error: "Employee not found." };
      const patch = { updated_at: now() };
      if (p.fullName != null) {
        const fullName = String(p.fullName).trim();
        if (!fullName) return { ok: false, error: "Employee name is required." };
        patch.full_name = fullName;
      }
      if (p.phone != null) patch.phone = p.phone ? String(p.phone).trim() : null;
      if (p.monthlySalaryCents != null) {
        const amount = Math.round(Number(p.monthlySalaryCents || 0));
        if (!Number.isFinite(amount) || amount < 0) return { ok: false, error: "Invalid monthly salary." };
        patch.monthly_salary_cents = amount;
      }
      if (p.notes != null) patch.notes = p.notes ? String(p.notes).trim() : null;
      if (p.active != null) patch.active = p.active ? 1 : 0;
      await upd("employee_register", (x) => x.eq("id", employeeId), patch);
      await audit(p.userId, "EMPLOYEE_UPDATED", { employeeId });
      return { ok: true };
    } catch (e) { return { ok: false, error: e.message || "Failed to update employee." }; }
  });

  ipcMain.handle("employee:add-ledger-entry", async (_, p = {}) => {
    try {
      if (!(await isAdmin(p.userId))) return { ok: false, error: "Only admin can post salary/credit entries." };
      const employeeId = Number(p.employeeId || 0);
      if (!employeeId) return { ok: false, error: "Invalid employee id." };
      const employee = await get("employee_register", employeeId);
      if (!employee) return { ok: false, error: "Employee not found." };
      const currentMonth = monthKey(new Date());
      const closure = await getSalaryClosure(employeeId, currentMonth);
      if (closure) return { ok: false, error: `Salary month ${currentMonth} is already closed for this employee.` };
      const entryType = String(p.entryType || "").toUpperCase();
      if (!["SALARY", "CREDIT"].includes(entryType)) return { ok: false, error: "Invalid entry type." };
      const amountCents = Math.round(Number(p.amountCents || 0));
      if (!Number.isFinite(amountCents) || amountCents <= 0) return { ok: false, error: "Amount must be positive." };
      const row = await ins("employee_ledger", {
        employee_id: employeeId,
        entry_type: entryType,
        amount_cents: amountCents,
        notes: p.notes ? String(p.notes).trim() : null,
        created_by_user_id: p.userId || null,
        created_at: now()
      });
      await audit(p.userId, "EMPLOYEE_LEDGER_ENTRY_ADDED", { employeeId, entryId: row.id, entryType, amountCents });
      return { ok: true, entryId: row.id };
    } catch (e) { return { ok: false, error: e.message || "Failed to add ledger entry." }; }
  });

  ipcMain.handle("employee:get-ledger", async (_, p = {}) => {
    try {
      if (!(await isAdmin(p.userId))) return { ok: false, error: "Only admin can view employee ledger." };
      const employeeId = Number(p.employeeId || 0);
      if (!employeeId) return { ok: false, error: "Invalid employee id." };
      const employee = await get("employee_register", employeeId);
      if (!employee) return { ok: false, error: "Employee not found." };
      const rawEntries = await q("employee_ledger", (x) => x.eq("employee_id", employeeId).order("id", { ascending: false }).limit(5000));
      const fromMs = p.fromDate ? new Date(`${String(p.fromDate).trim()}T00:00:00`).getTime() : null;
      const toMs = p.toDate ? new Date(`${String(p.toDate).trim()}T23:59:59.999`).getTime() : null;
      if (fromMs != null && !Number.isFinite(fromMs)) return { ok: false, error: "Invalid from date." };
      if (toMs != null && !Number.isFinite(toMs)) return { ok: false, error: "Invalid to date." };
      const entries = rawEntries.filter((e) => {
        const t = new Date(e.created_at).getTime();
        if (!Number.isFinite(t)) return false;
        if (fromMs != null && t < fromMs) return false;
        if (toMs != null && t > toMs) return false;
        return true;
      });
      const users = await q("users", (x) => x.limit(1000));
      const userById = new Map(users.map((u) => [u.id, u.username]));
      const enriched = entries.map((e) => ({ ...e, created_by_username: userById.get(e.created_by_user_id) || null }));
      const salaryAdjustmentsCents = enriched
        .filter((r) => r.entry_type === "SALARY")
        .reduce((a, r) => a + Number(r.amount_cents || 0), 0);
      const creditCents = enriched
        .filter((r) => r.entry_type === "CREDIT")
        .reduce((a, r) => a + Number(r.amount_cents || 0), 0);
      const baseSalaryCents = Number(employee.monthly_salary_cents || 0);
      const totalSalaryCents = baseSalaryCents + salaryAdjustmentsCents;
      const currentMonth = monthKey(new Date());
      const closure = await getSalaryClosure(employeeId, currentMonth);
      return {
        ok: true,
        employee,
        currentMonth,
        currentMonthClosed: !!closure,
        currentMonthClosure: closure,
        summary: {
          baseSalaryCents,
          salaryAdjustmentsCents,
          totalSalaryCents,
          salaryCents: totalSalaryCents,
          creditCents,
          netPayableCents: totalSalaryCents - creditCents
        },
        entries: enriched
      };
    } catch (e) { return { ok: false, error: e.message || "Failed to load employee ledger." }; }
  });

  ipcMain.handle("employee:export-ledger-csv", async (_, p = {}) => {
    try {
      if (!(await isAdmin(p.userId))) return { ok: false, error: "Only admin can export employee ledger." };
      const employeeId = Number(p.employeeId || 0);
      if (!employeeId) return { ok: false, error: "Invalid employee id." };
      const employee = await get("employee_register", employeeId);
      if (!employee) return { ok: false, error: "Employee not found." };
      const fromMs = p.fromDate ? new Date(`${String(p.fromDate).trim()}T00:00:00`).getTime() : null;
      const toMs = p.toDate ? new Date(`${String(p.toDate).trim()}T23:59:59.999`).getTime() : null;
      if (fromMs != null && !Number.isFinite(fromMs)) return { ok: false, error: "Invalid from date." };
      if (toMs != null && !Number.isFinite(toMs)) return { ok: false, error: "Invalid to date." };
      const rows = await q("employee_ledger", (x) => x.eq("employee_id", employeeId).order("id", { ascending: false }).limit(5000));
      const users = await q("users", (x) => x.limit(1000));
      const userById = new Map(users.map((u) => [u.id, u.username]));
      const filtered = rows.filter((e) => {
        const t = new Date(e.created_at).getTime();
        if (!Number.isFinite(t)) return false;
        if (fromMs != null && t < fromMs) return false;
        if (toMs != null && t > toMs) return false;
        return true;
      });
      const safeName = String(employee.full_name || "employee").replace(/[^\w.-]+/g, "-");
      const { canceled, filePath } = await dialog.showSaveDialog({
        title: "Export Employee Ledger CSV",
        defaultPath: `${safeName}-ledger.csv`,
        filters: [{ name: "CSV", extensions: ["csv"] }]
      });
      if (canceled || !filePath) return { ok: false, error: "Export canceled." };
      const escCsv = (v) => `"${String(v ?? "").replace(/"/g, "\"\"")}"`;
      const lines = ["entry_id,created_at,entry_type,amount,created_by,notes"];
      for (const row of filtered) {
        lines.push([
          row.id,
          escCsv(row.created_at),
          escCsv(row.entry_type),
          (Number(row.amount_cents || 0) / 100).toFixed(2),
          escCsv(userById.get(row.created_by_user_id) || ""),
          escCsv(row.notes || "")
        ].join(","));
      }
      fs.writeFileSync(filePath, lines.join("\n"), "utf8");
      return { ok: true, filePath, count: filtered.length };
    } catch (e) { return { ok: false, error: e.message || "Failed to export employee ledger." }; }
  });

  ipcMain.handle("employee:delete-ledger-entry", async (_, p = {}) => {
    try {
      if (!(await isAdmin(p.userId))) return { ok: false, error: "Only admin can delete employee ledger entries." };
      const entryId = Number(p.entryId || 0);
      if (!entryId) return { ok: false, error: "Invalid ledger entry id." };
      const entry = await get("employee_ledger", entryId);
      if (!entry) return { ok: false, error: "Ledger entry not found." };
      if (entry.entry_type !== "CREDIT") return { ok: false, error: "Only credit entries can be deleted." };
      const entryMonth = monthKey(entry.created_at);
      const closure = await getSalaryClosure(entry.employee_id, entryMonth);
      if (closure) return { ok: false, error: `Cannot delete credit in closed month ${entryMonth}.` };
      await del("employee_ledger", (x) => x.eq("id", entryId));
      await audit(p.userId || null, "EMPLOYEE_LEDGER_ENTRY_DELETED", {
        entryId,
        employeeId: entry.employee_id,
        entryType: entry.entry_type,
        amountCents: Number(entry.amount_cents || 0)
      });
      return { ok: true };
    } catch (e) { return { ok: false, error: e.message || "Failed to delete employee ledger entry." }; }
  });

  ipcMain.handle("employee:close-current-month", async (_, p = {}) => {
    try {
      if (!(await isAdmin(p.userId))) return { ok: false, error: "Only admin can close salary month." };
      const employeeId = Number(p.employeeId || 0);
      if (!employeeId) return { ok: false, error: "Invalid employee id." };
      const employee = await get("employee_register", employeeId);
      if (!employee) return { ok: false, error: "Employee not found." };
      const mKey = monthKey(new Date());
      const existing = await getSalaryClosure(employeeId, mKey);
      if (existing) return { ok: false, error: `Salary month ${mKey} is already closed for this employee.` };
      const bounds = monthBounds(mKey);
      const rows = await q("employee_ledger", (x) => x.eq("employee_id", employeeId).order("id", { ascending: false }).limit(5000));
      const monthRows = rows.filter((r) => {
        const t = new Date(r.created_at).getTime();
        return Number.isFinite(t) && t >= bounds.fromMs && t <= bounds.toMs;
      });
      const salaryAdjustmentsCents = monthRows.filter((r) => r.entry_type === "SALARY").reduce((a, r) => a + Number(r.amount_cents || 0), 0);
      const creditCents = monthRows.filter((r) => r.entry_type === "CREDIT").reduce((a, r) => a + Number(r.amount_cents || 0), 0);
      const baseSalaryCents = Number(employee.monthly_salary_cents || 0);
      const totalSalaryCents = baseSalaryCents + salaryAdjustmentsCents;
      const netPayableCents = totalSalaryCents - creditCents;
      const closure = await ins("employee_salary_closures", {
        employee_id: employeeId,
        month_key: mKey,
        base_salary_cents: baseSalaryCents,
        salary_adjustments_cents: salaryAdjustmentsCents,
        total_salary_cents: totalSalaryCents,
        credit_cents: creditCents,
        net_payable_cents: netPayableCents,
        closed_by_user_id: p.userId || null,
        notes: p.notes ? String(p.notes).trim() : null,
        closed_at: now()
      });
      await audit(p.userId || null, "EMPLOYEE_SALARY_MONTH_CLOSED", { employeeId, monthKey: mKey, closureId: closure.id, netPayableCents });
      return { ok: true, monthKey: mKey, closure };
    } catch (e) { return { ok: false, error: e.message || "Failed to close salary month." }; }
  });

  ipcMain.handle("credit:customers:list", async () => {
    try {
      const rows = await q("credit_customers", (x) => x.order("name", { ascending: true }));
      return { ok: true, customers: rows };
    } catch (e) { return { ok: false, error: e.message || "Failed to load customers." }; }
  });

  ipcMain.handle("credit:customers:get", async (_, p = {}) => {
    try {
      const customerId = Number(p.customerId || 0);
      if (!customerId) return { ok: false, error: "Invalid customer id." };
      const row = await get("credit_customers", customerId);
      if (!row) return { ok: false, error: "Customer not found." };
      return { ok: true, customer: row };
    } catch (e) { return { ok: false, error: e.message || "Failed to load customer." }; }
  });

  ipcMain.handle("credit:customers:create", async (_, p = {}) => {
    try {
      const name = String(p.name || "").trim();
      if (!name) return { ok: false, error: "Customer name is required." };
      const creditLimitCents = Math.round(Number(p.creditLimitCents || 0));
      if (!Number.isFinite(creditLimitCents) || creditLimitCents < 0) return { ok: false, error: "Invalid credit limit." };
      const row = await ins("credit_customers", {
        name,
        phone: normalizeText(p.phone),
        address: normalizeText(p.address),
        credit_limit_cents: creditLimitCents,
        current_balance_cents: 0,
        notes: normalizeText(p.notes),
        created_at: now()
      });
      await audit(p.userId || null, "CREDIT_CUSTOMER_CREATED", { customerId: row.id });
      return { ok: true, id: row.id };
    } catch (e) { return { ok: false, error: e.message || "Failed to create customer." }; }
  });

  ipcMain.handle("credit:customers:update", async (_, p = {}) => {
    try {
      const customerId = Number(p.customerId || 0);
      if (!customerId) return { ok: false, error: "Invalid customer id." };
      const customer = await get("credit_customers", customerId);
      if (!customer) return { ok: false, error: "Customer not found." };
      const patch = { updated_at: now() };
      if (p.name != null) {
        const name = String(p.name || "").trim();
        if (!name) return { ok: false, error: "Customer name is required." };
        patch.name = name;
      }
      if (p.phone != null) patch.phone = normalizeText(p.phone);
      if (p.address != null) patch.address = normalizeText(p.address);
      if (p.creditLimitCents != null) {
        const creditLimitCents = Math.round(Number(p.creditLimitCents || 0));
        if (!Number.isFinite(creditLimitCents) || creditLimitCents < 0) return { ok: false, error: "Invalid credit limit." };
        patch.credit_limit_cents = creditLimitCents;
      }
      if (p.notes != null) patch.notes = normalizeText(p.notes);
      await upd("credit_customers", (x) => x.eq("id", customerId), patch);
      await audit(p.userId || null, "CREDIT_CUSTOMER_UPDATED", { customerId });
      return { ok: true };
    } catch (e) { return { ok: false, error: e.message || "Failed to update customer." }; }
  });

  ipcMain.handle("credit:customers:delete", async (_, p = {}) => {
    try {
      const customerId = Number(p.customerId || 0);
      if (!customerId) return { ok: false, error: "Invalid customer id." };
      const customer = await get("credit_customers", customerId);
      if (!customer) return { ok: false, error: "Customer not found." };
      const sales = await q("credit_sales", (x) => x.eq("customer_id", customerId).limit(1));
      const payments = await q("credit_payments", (x) => x.eq("customer_id", customerId).limit(1));
      if (sales.length || payments.length || Number(customer.current_balance_cents || 0) !== 0) {
        return { ok: false, error: "Cannot delete customer with balance or transactions." };
      }
      await del("credit_customers", (x) => x.eq("id", customerId));
      await audit(p.userId || null, "CREDIT_CUSTOMER_DELETED", { customerId });
      return { ok: true };
    } catch (e) { return { ok: false, error: e.message || "Failed to delete customer." }; }
  });

  ipcMain.handle("credit:sales:list", async () => {
    try {
      const rows = await q("credit_sales", (x) => x.order("id", { ascending: false }).limit(5000));
      return { ok: true, sales: rows };
    } catch (e) { return { ok: false, error: e.message || "Failed to load sales." }; }
  });

  ipcMain.handle("credit:sales:by-customer", async (_, p = {}) => {
    try {
      const customerId = Number(p.customerId || 0);
      if (!customerId) return { ok: false, error: "Invalid customer id." };
      const rows = await q("credit_sales", (x) => x.eq("customer_id", customerId).order("id", { ascending: false }).limit(5000));
      return { ok: true, sales: rows };
    } catch (e) { return { ok: false, error: e.message || "Failed to load sales." }; }
  });

  ipcMain.handle("credit:sales:create", async (_, p = {}) => {
    try {
      const customerId = Number(p.customerId || 0);
      if (!customerId) return { ok: false, error: "Invalid customer id." };
      const customer = await get("credit_customers", customerId);
      if (!customer) return { ok: false, error: "Customer not found." };
      const totalCents = Math.round(Number(p.totalCents || 0));
      const paidCents = Math.round(Number(p.paidCents || 0));
      if (!Number.isFinite(totalCents) || totalCents <= 0) return { ok: false, error: "Total amount must be positive." };
      if (!Number.isFinite(paidCents) || paidCents < 0 || paidCents > totalCents) return { ok: false, error: "Invalid paid amount." };
      const remainingCents = Math.max(0, totalCents - paidCents);
      const row = await ins("credit_sales", {
        customer_id: customerId,
        total_cents: totalCents,
        paid_cents: paidCents,
        remaining_cents: remainingCents,
        description: normalizeText(p.description),
        created_at: now()
      });
      if (remainingCents > 0) {
        const nextBalance = Number(customer.current_balance_cents || 0) + remainingCents;
        await upd("credit_customers", (x) => x.eq("id", customerId), { current_balance_cents: nextBalance, updated_at: now() });
      }
      await audit(p.userId || null, "CREDIT_SALE_CREATED", { customerId, saleId: row.id, remainingCents });
      return { ok: true, id: row.id, remainingCents };
    } catch (e) { return { ok: false, error: e.message || "Failed to create sale." }; }
  });

  ipcMain.handle("credit:payments:list", async () => {
    try {
      const rows = await q("credit_payments", (x) => x.order("id", { ascending: false }).limit(5000));
      return { ok: true, payments: rows };
    } catch (e) { return { ok: false, error: e.message || "Failed to load payments." }; }
  });

  ipcMain.handle("credit:payments:by-customer", async (_, p = {}) => {
    try {
      const customerId = Number(p.customerId || 0);
      if (!customerId) return { ok: false, error: "Invalid customer id." };
      const rows = await q("credit_payments", (x) => x.eq("customer_id", customerId).order("id", { ascending: false }).limit(5000));
      return { ok: true, payments: rows };
    } catch (e) { return { ok: false, error: e.message || "Failed to load payments." }; }
  });

  ipcMain.handle("credit:payments:create", async (_, p = {}) => {
    try {
      const customerId = Number(p.customerId || 0);
      if (!customerId) return { ok: false, error: "Invalid customer id." };
      const customer = await get("credit_customers", customerId);
      if (!customer) return { ok: false, error: "Customer not found." };
      const amountCents = Math.round(Number(p.amountCents || 0));
      if (!Number.isFinite(amountCents) || amountCents <= 0) return { ok: false, error: "Amount must be positive." };
      const current = Number(customer.current_balance_cents || 0);
      if (current <= 0) return { ok: false, error: "Customer has no outstanding balance." };
      if (amountCents > current) return { ok: false, error: "Payment exceeds current balance." };
      const row = await ins("credit_payments", {
        customer_id: customerId,
        amount_cents: amountCents,
        note: normalizeText(p.note),
        created_at: now()
      });
      await upd("credit_customers", (x) => x.eq("id", customerId), { current_balance_cents: current - amountCents, updated_at: now() });
      await audit(p.userId || null, "CREDIT_PAYMENT_CREATED", { customerId, paymentId: row.id, amountCents });
      return { ok: true, id: row.id };
    } catch (e) { return { ok: false, error: e.message || "Failed to create payment." }; }
  });

  ipcMain.handle("credit:ledger:customer", async (_, p = {}) => {
    try {
      const customerId = Number(p.customerId || 0);
      if (!customerId) return { ok: false, error: "Invalid customer id." };
      const customer = await get("credit_customers", customerId);
      if (!customer) return { ok: false, error: "Customer not found." };
      const ledger = await buildCustomerLedger(customerId);
      return { ok: true, customer, ledger };
    } catch (e) { return { ok: false, error: e.message || "Failed to load ledger." }; }
  });

  ipcMain.handle("credit:vendors:list", async () => {
    try {
      const rows = await q("credit_vendors", (x) => x.order("name", { ascending: true }));
      return { ok: true, vendors: rows };
    } catch (e) { return { ok: false, error: e.message || "Failed to load vendors." }; }
  });

  ipcMain.handle("credit:vendors:get", async (_, p = {}) => {
    try {
      const vendorId = Number(p.vendorId || 0);
      if (!vendorId) return { ok: false, error: "Invalid vendor id." };
      const row = await get("credit_vendors", vendorId);
      if (!row) return { ok: false, error: "Vendor not found." };
      return { ok: true, vendor: row };
    } catch (e) { return { ok: false, error: e.message || "Failed to load vendor." }; }
  });

  ipcMain.handle("credit:vendors:create", async (_, p = {}) => {
    try {
      const name = String(p.name || "").trim();
      if (!name) return { ok: false, error: "Vendor name is required." };
      const row = await ins("credit_vendors", {
        name,
        phone: normalizeText(p.phone),
        address: normalizeText(p.address),
        current_balance_cents: 0,
        notes: normalizeText(p.notes),
        created_at: now()
      });
      await audit(p.userId || null, "CREDIT_VENDOR_CREATED", { vendorId: row.id });
      return { ok: true, id: row.id };
    } catch (e) { return { ok: false, error: e.message || "Failed to create vendor." }; }
  });

  ipcMain.handle("credit:vendors:update", async (_, p = {}) => {
    try {
      const vendorId = Number(p.vendorId || 0);
      if (!vendorId) return { ok: false, error: "Invalid vendor id." };
      const vendor = await get("credit_vendors", vendorId);
      if (!vendor) return { ok: false, error: "Vendor not found." };
      const patch = { updated_at: now() };
      if (p.name != null) {
        const name = String(p.name || "").trim();
        if (!name) return { ok: false, error: "Vendor name is required." };
        patch.name = name;
      }
      if (p.phone != null) patch.phone = normalizeText(p.phone);
      if (p.address != null) patch.address = normalizeText(p.address);
      if (p.notes != null) patch.notes = normalizeText(p.notes);
      await upd("credit_vendors", (x) => x.eq("id", vendorId), patch);
      await audit(p.userId || null, "CREDIT_VENDOR_UPDATED", { vendorId });
      return { ok: true };
    } catch (e) { return { ok: false, error: e.message || "Failed to update vendor." }; }
  });

  ipcMain.handle("credit:vendors:delete", async (_, p = {}) => {
    try {
      const vendorId = Number(p.vendorId || 0);
      if (!vendorId) return { ok: false, error: "Invalid vendor id." };
      const vendor = await get("credit_vendors", vendorId);
      if (!vendor) return { ok: false, error: "Vendor not found." };
      const purchases = await q("credit_purchases", (x) => x.eq("vendor_id", vendorId).limit(1));
      const payments = await q("credit_vendor_payments", (x) => x.eq("vendor_id", vendorId).limit(1));
      if (purchases.length || payments.length || Number(vendor.current_balance_cents || 0) !== 0) {
        return { ok: false, error: "Cannot delete vendor with balance or transactions." };
      }
      await del("credit_vendors", (x) => x.eq("id", vendorId));
      await audit(p.userId || null, "CREDIT_VENDOR_DELETED", { vendorId });
      return { ok: true };
    } catch (e) { return { ok: false, error: e.message || "Failed to delete vendor." }; }
  });

  ipcMain.handle("credit:purchases:list", async () => {
    try {
      const rows = await q("credit_purchases", (x) => x.order("id", { ascending: false }).limit(5000));
      return { ok: true, purchases: rows };
    } catch (e) { return { ok: false, error: e.message || "Failed to load purchases." }; }
  });

  ipcMain.handle("credit:purchases:by-vendor", async (_, p = {}) => {
    try {
      const vendorId = Number(p.vendorId || 0);
      if (!vendorId) return { ok: false, error: "Invalid vendor id." };
      const rows = await q("credit_purchases", (x) => x.eq("vendor_id", vendorId).order("id", { ascending: false }).limit(5000));
      return { ok: true, purchases: rows };
    } catch (e) { return { ok: false, error: e.message || "Failed to load purchases." }; }
  });

  ipcMain.handle("credit:purchases:create", async (_, p = {}) => {
    try {
      const vendorId = Number(p.vendorId || 0);
      if (!vendorId) return { ok: false, error: "Invalid vendor id." };
      const vendor = await get("credit_vendors", vendorId);
      if (!vendor) return { ok: false, error: "Vendor not found." };
      const totalCents = Math.round(Number(p.totalCents || 0));
      const paidCents = Math.round(Number(p.paidCents || 0));
      if (!Number.isFinite(totalCents) || totalCents <= 0) return { ok: false, error: "Total amount must be positive." };
      if (!Number.isFinite(paidCents) || paidCents < 0 || paidCents > totalCents) return { ok: false, error: "Invalid paid amount." };
      const remainingCents = Math.max(0, totalCents - paidCents);
      const row = await ins("credit_purchases", {
        vendor_id: vendorId,
        total_cents: totalCents,
        paid_cents: paidCents,
        remaining_cents: remainingCents,
        description: normalizeText(p.description),
        created_at: now()
      });
      if (remainingCents > 0) {
        const nextBalance = Number(vendor.current_balance_cents || 0) + remainingCents;
        await upd("credit_vendors", (x) => x.eq("id", vendorId), { current_balance_cents: nextBalance, updated_at: now() });
      }
      await audit(p.userId || null, "CREDIT_PURCHASE_CREATED", { vendorId, purchaseId: row.id, remainingCents });
      return { ok: true, id: row.id, remainingCents };
    } catch (e) { return { ok: false, error: e.message || "Failed to create purchase." }; }
  });

  ipcMain.handle("credit:vendor-payments:list", async () => {
    try {
      const rows = await q("credit_vendor_payments", (x) => x.order("id", { ascending: false }).limit(5000));
      return { ok: true, payments: rows };
    } catch (e) { return { ok: false, error: e.message || "Failed to load vendor payments." }; }
  });

  ipcMain.handle("credit:vendor-payments:by-vendor", async (_, p = {}) => {
    try {
      const vendorId = Number(p.vendorId || 0);
      if (!vendorId) return { ok: false, error: "Invalid vendor id." };
      const rows = await q("credit_vendor_payments", (x) => x.eq("vendor_id", vendorId).order("id", { ascending: false }).limit(5000));
      return { ok: true, payments: rows };
    } catch (e) { return { ok: false, error: e.message || "Failed to load vendor payments." }; }
  });

  ipcMain.handle("credit:vendor-payments:create", async (_, p = {}) => {
    try {
      const vendorId = Number(p.vendorId || 0);
      if (!vendorId) return { ok: false, error: "Invalid vendor id." };
      const vendor = await get("credit_vendors", vendorId);
      if (!vendor) return { ok: false, error: "Vendor not found." };
      const amountCents = Math.round(Number(p.amountCents || 0));
      if (!Number.isFinite(amountCents) || amountCents <= 0) return { ok: false, error: "Amount must be positive." };
      const current = Number(vendor.current_balance_cents || 0);
      if (current <= 0) return { ok: false, error: "Vendor has no outstanding balance." };
      if (amountCents > current) return { ok: false, error: "Payment exceeds current balance." };
      const row = await ins("credit_vendor_payments", {
        vendor_id: vendorId,
        amount_cents: amountCents,
        note: normalizeText(p.note),
        created_at: now()
      });
      await upd("credit_vendors", (x) => x.eq("id", vendorId), { current_balance_cents: current - amountCents, updated_at: now() });
      await audit(p.userId || null, "CREDIT_VENDOR_PAYMENT_CREATED", { vendorId, paymentId: row.id, amountCents });
      return { ok: true, id: row.id };
    } catch (e) { return { ok: false, error: e.message || "Failed to create vendor payment." }; }
  });

  ipcMain.handle("credit:ledger:vendor", async (_, p = {}) => {
    try {
      const vendorId = Number(p.vendorId || 0);
      if (!vendorId) return { ok: false, error: "Invalid vendor id." };
      const vendor = await get("credit_vendors", vendorId);
      if (!vendor) return { ok: false, error: "Vendor not found." };
      const ledger = await buildVendorLedger(vendorId);
      return { ok: true, vendor, ledger };
    } catch (e) { return { ok: false, error: e.message || "Failed to load vendor ledger." }; }
  });

  ipcMain.handle("credit:dashboard:stats", async () => {
    try {
      const customers = await q("credit_customers", (x) => x.order("name", { ascending: true }));
      const vendors = await q("credit_vendors", (x) => x.order("name", { ascending: true }));
      const sales = await q("credit_sales", (x) => x.order("id", { ascending: false }).limit(5000));
      const payments = await q("credit_payments", (x) => x.order("id", { ascending: false }).limit(5000));
      const purchases = await q("credit_purchases", (x) => x.order("id", { ascending: false }).limit(5000));
      const vendorPayments = await q("credit_vendor_payments", (x) => x.order("id", { ascending: false }).limit(5000));

      const customerOutstandingTotal = customers.reduce((a, c) => a + Math.max(0, Number(c.current_balance_cents || 0)), 0);
      const customerDueCount = customers.filter((c) => Number(c.current_balance_cents || 0) > 0).length;
      const vendorPayableTotal = vendors.reduce((a, v) => a + Math.max(0, Number(v.current_balance_cents || 0)), 0);

      const todaySalesTotal = sales.filter((s) => isToday(s.created_at)).reduce((a, s) => a + Number(s.total_cents || 0), 0);
      const todayPaymentsTotal = payments.filter((p) => isToday(p.created_at)).reduce((a, p) => a + Number(p.amount_cents || 0), 0);
      const todayPurchasesTotal = purchases.filter((p) => isToday(p.created_at)).reduce((a, p) => a + Number(p.total_cents || 0), 0);
      const todayVendorPaymentsTotal = vendorPayments.filter((p) => isToday(p.created_at)).reduce((a, p) => a + Number(p.amount_cents || 0), 0);

      const topCustomers = customers
        .filter((c) => Number(c.current_balance_cents || 0) > 0)
        .sort((a, b) => Number(b.current_balance_cents || 0) - Number(a.current_balance_cents || 0))
        .slice(0, 5);
      const topVendors = vendors
        .filter((v) => Number(v.current_balance_cents || 0) > 0)
        .sort((a, b) => Number(b.current_balance_cents || 0) - Number(a.current_balance_cents || 0))
        .slice(0, 5);

      return {
        ok: true,
        stats: {
          customerOutstandingTotal,
          customerDueCount,
          todaySalesTotal,
          todayPaymentsTotal,
          vendorPayableTotal,
          todayPurchasesTotal,
          todayVendorPaymentsTotal,
          topCustomers,
          topVendors
        }
      };
    } catch (e) { return { ok: false, error: e.message || "Failed to load credit dashboard." }; }
  });


  ipcMain.handle("reports:summary", async (_, p) => {
    try {
      const days = p.range === "monthly" ? 30 : p.range === "weekly" ? 7 : 1;
      const nowMs = Date.now();
      const currentSinceMs = nowMs - (days * 24 * 60 * 60 * 1000);
      const previousSinceMs = nowMs - (2 * days * 24 * 60 * 60 * 1000);

      const orders = await q("orders", (x) => x.order("id", { ascending: false }).limit(5000));
      const currentPaid = orders.filter((o) => o.status === "PAID" && new Date(o.created_at).getTime() >= currentSinceMs);
      const previousPaid = orders.filter((o) => o.status === "PAID" && new Date(o.created_at).getTime() >= previousSinceMs && new Date(o.created_at).getTime() < currentSinceMs);

      const sales = {
        paid_orders: currentPaid.length,
        gross_sales: currentPaid.reduce((a, o) => a + Number(o.total_cents || 0), 0)
      };

      const orderIds = currentPaid.map((o) => o.id);
      const items = orderIds.length ? await q("order_items", (x) => x.in("order_id", orderIds)) : [];
      const menuIds = Array.from(new Set(items.map((i) => i.menu_item_id).filter(Boolean)));
      const menu = menuIds.length ? await q("menu_items", (x) => x.in("id", menuIds)) : [];
      const mb = new Map(menu.map((m) => [m.id, m]));

      // Cache recipes and ingredients for cost calculation
      const recipes = await q("recipes", (x) => x.limit(10000));
      const ingredients = await q("ingredients", (x) => x.limit(5000));
      const ingById = new Map(ingredients.map((i) => [i.id, i]));
      const recipesByMenuId = new Map();
      for (const r of recipes) {
        const bucket = recipesByMenuId.get(r.menu_item_id) || [];
        bucket.push(r);
        recipesByMenuId.set(r.menu_item_id, bucket);
      }

      function getItemCost(menuItemId) {
        const itemRecipes = recipesByMenuId.get(menuItemId) || [];
        return itemRecipes.reduce((sum, r) => {
          const ing = ingById.get(r.ingredient_id);
          const unitCost = Number(ing?.unit_cost_cents || 0);
          return sum + Math.round(unitCost * Number(r.qty_per_item || 0));
        }, 0);
      }

      const top = new Map();
      for (const i of items) {
        const mi = mb.get(i.menu_item_id);
        const base = mi?.name || "Unknown Item";
        const size = String(mi?.size || "").trim();
        const n = size ? `${base} (${size})` : base;
        top.set(n, (top.get(n) || 0) + Number(i.quantity || 0));
      }
      const topItems = Array.from(top.entries()).map(([name, qty]) => ({ name, qty })).sort((a, b) => b.qty - a.qty).slice(0, 5);

      const users = await q("users", (x) => x.limit(1000));
      const ub = new Map(users.map((u) => [u.id, u.username]));
      const cs = new Map();
      for (const o of currentPaid) {
        const c = ub.get(o.cashier_user_id) || null;
        const k = c || "-";
        const prev = cs.get(k) || { cashier: c, paid_orders: 0, gross_sales: 0 };
        prev.paid_orders += 1;
        prev.gross_sales += Number(o.total_cents || 0);
        cs.set(k, prev);
      }
      const cashierSales = Array.from(cs.values()).sort((a, b) => b.gross_sales - a.gross_sales);

      const categoryMargin = Array.from(new Set(menu.map((m) => m.category))).map((cat) => {
        const catItems = items.filter((i) => mb.get(i.menu_item_id)?.category === cat);
        const net = catItems.reduce((a, i) => a + Number(i.line_total_cents || 0), 0);
        const cost = catItems.reduce((a, i) => a + (getItemCost(i.menu_item_id) * Number(i.quantity || 0)), 0);
        return {
          category: cat,
          net_sales_cents: net,
          estimated_cost_cents: cost,
          gross_margin_cents: net - cost
        };
      });

      const sizeMarginMap = new Map();
      for (const i of items) {
        const mi = mb.get(i.menu_item_id);
        const category = mi?.category || "-";
        const size = String(mi?.size || "").trim() || "-";
        const key = `${category}||${size}`;
        const prev = sizeMarginMap.get(key) || { category, size, net_sales_cents: 0, estimated_cost_cents: 0, quantity: 0 };
        const cost = getItemCost(i.menu_item_id) * Number(i.quantity || 0);
        prev.net_sales_cents += Number(i.line_total_cents || 0);
        prev.estimated_cost_cents += cost;
        prev.quantity += Number(i.quantity || 0);
        sizeMarginMap.set(key, prev);
      }
      const sizeMargin = Array.from(sizeMarginMap.values()).map(m => ({ ...m, gross_margin_cents: m.net_sales_cents - m.estimated_cost_cents })).sort((a, b) => a.category.localeCompare(b.category) || a.size.localeCompare(b.size));

      const taxSummary = {
        taxable_sales_cents: currentPaid.reduce((a, o) => a + Number(o.subtotal_cents || 0), 0),
        total_discount_cents: currentPaid.reduce((a, o) => a + Number(o.discount_cents || 0), 0),
        tax_collected_cents: currentPaid.reduce((a, o) => a + Number(o.tax_cents || 0), 0),
        net_sales_cents: currentPaid.reduce((a, o) => a + Number(o.total_cents || 0), 0),
        total_cost_cents: items.reduce((a, i) => a + (getItemCost(i.menu_item_id) * Number(i.quantity || 0)), 0)
      };

      // Comparison Metrics
      const previousOrderIds = previousPaid.map((o) => o.id);
      const previousItems = previousOrderIds.length ? await q("order_items", (x) => x.in("order_id", previousOrderIds)) : [];
      const previousSalesCents = previousPaid.reduce((a, o) => a + Number(o.total_cents || 0), 0);
      const previousCostCents = previousItems.reduce((a, i) => a + (getItemCost(i.menu_item_id) * Number(i.quantity || 0)), 0);
      const previousProfitCents = previousSalesCents - previousCostCents;
      
      const currentProfitCents = taxSummary.net_sales_cents - taxSummary.total_cost_cents;
      
      const calcChange = (curr, prev) => {
        if (!prev) return curr > 0 ? 100 : 0;
        return Math.round(((curr - prev) / prev) * 100);
      };

      const comparison = {
        salesChangePct: calcChange(taxSummary.net_sales_cents, previousSalesCents),
        profitChangePct: calcChange(currentProfitCents, previousProfitCents),
        ordersChangePct: calcChange(currentPaid.length, previousPaid.length)
      };

      const sessions = await q("cash_sessions", (x) => x.order("id", { ascending: false }).limit(1000));
      const tx = await q("cash_transactions", (x) => x.order("id", { ascending: false }).limit(5000));
      const openingFloat = sessions.filter((s) => isToday(s.opened_at)).reduce((a, s) => a + Number(s.opening_cents || 0), 0);
      const cashIn = tx.filter((t) => t.transaction_type === "IN" && isToday(t.created_at)).reduce((a, t) => a + Number(t.amount_cents || 0), 0);
      const cashOut = tx.filter((t) => t.transaction_type === "OUT" && isToday(t.created_at)).reduce((a, t) => a + Number(t.amount_cents || 0), 0);
      const actualClose = sessions.filter((s) => s.closed_at && isToday(s.closed_at)).reduce((a, s) => a + Number(s.closing_cents || 0), 0);
      const eodClose = {
        openingFloat,
        cashIn,
        cashOut,
        expectedClose: openingFloat + cashIn - cashOut,
        actualClose,
        variance: actualClose - (openingFloat + cashIn - cashOut),
        closedSessions: sessions.filter((s) => s.status === "CLOSED" && s.closed_at && isToday(s.closed_at)).length
      };

      const lowStock = (await q("ingredients", (x) => x.order("stock_qty", { ascending: true }))).filter((i) => Number(i.stock_qty || 0) <= Number(i.low_stock_threshold || 0));
      const cash = sessions.slice(0, 10);
      const logs = await q("audit_logs", (x) => x.order("id", { ascending: false }).limit(100));
      const auditRows = logs.map((a) => ({ ...a, username: ub.get(a.user_id) || null }));
      return { ok: true, summary: { sales, topItems, cashierSales, categoryMargin, sizeMargin, taxSummary, comparison, eodClose, lowStock, cash, audit: auditRows } };
    } catch (e) { return { ok: false, error: e.message || "Failed." }; }
  });

  ipcMain.handle("reports:daily-register", async () => {
    try {
      const pays = await q("payments", (x) => x.order("id", { ascending: false }).limit(5000));
      const todayPays = pays.filter((p) => isToday(p.created_at));
      const orderIds = Array.from(new Set(todayPays.map((p) => p.order_id))); const os = orderIds.length ? await q("orders", (x) => x.in("id", orderIds)) : []; const ob = new Map(os.map((o) => [o.id, o]));
      const users = await q("users", (x) => x.limit(1000)); const ub = new Map(users.map((u) => [u.id, u.username]));
      const sales = todayPays.map((p) => ({ id: p.id, created_at: p.created_at, order_id: p.order_id, cashier: ob.get(p.order_id) ? ub.get(ob.get(p.order_id).cashier_user_id) || null : null, method: p.method, amount_cents: p.amount_cents, received_cents: p.received_cents, change_cents: p.change_cents }));
      const tx = await q("cash_transactions", (x) => x.order("id", { ascending: false }).limit(5000));
      const cashMovements = tx.filter((t) => isToday(t.created_at)).map((t) => ({ id: t.id, created_at: t.created_at, transaction_type: t.transaction_type, amount_cents: t.amount_cents, reason: t.reason, reference_type: t.reference_type, reference_id: t.reference_id, username: ub.get(t.user_id) || null }));
      const allSessions = await q("cash_sessions", (x) => x.order("id", { ascending: false }).limit(500));
      const sessions = allSessions.filter((s) => isToday(s.opened_at) || (s.closed_at && isToday(s.closed_at)));
      const openingFloat = sessions.filter((s) => isToday(s.opened_at)).reduce((a, s) => a + Number(s.opening_cents || 0), 0);
      const actualClosed = sessions.filter((s) => s.closed_at && isToday(s.closed_at)).reduce((a, s) => a + Number(s.closing_cents || 0), 0);
      const totals = { sales: sales.reduce((a, s) => a + Number(s.amount_cents || 0), 0), cashIn: cashMovements.filter((m) => m.transaction_type === "IN").reduce((a, m) => a + Number(m.amount_cents || 0), 0), cashOut: cashMovements.filter((m) => m.transaction_type === "OUT").reduce((a, m) => a + Number(m.amount_cents || 0), 0), openingFloat, actualClosed };
      totals.expectedDrawer = totals.openingFloat + totals.cashIn - totals.cashOut;
      return { ok: true, register: { date: todayKey(new Date()), totals, sales, cashMovements, sessions } };
    } catch (e) { return { ok: false, error: e.message || "Failed." }; }
  });

  ipcMain.handle("reports:export-csv", async (_, p) => { try { const days = p.range === "monthly" ? 30 : p.range === "weekly" ? 7 : 1; const since = new Date(); since.setDate(since.getDate() - days); const sMs = since.getTime(); const rows = (await q("orders", (x) => x.eq("status", "PAID").order("id", { ascending: false }).limit(10000))).filter((o) => new Date(o.created_at).getTime() >= sMs); const users = await q("users", (x) => x.limit(1000)); const ub = new Map(users.map((u) => [u.id, u.username])); const { canceled, filePath } = await dialog.showSaveDialog({ title: "Export Sales CSV", defaultPath: `sales-${p.range || "daily"}.csv`, filters: [{ name: "CSV", extensions: ["csv"] }] }); if (canceled || !filePath) return { ok: false, error: "Export canceled." }; const lines = ["order_id,created_at,cashier,total"]; for (const r of rows) lines.push(`${r.id},${r.created_at},${ub.get(r.cashier_user_id) || ""},${(Number(r.total_cents || 0) / 100).toFixed(2)}`); fs.writeFileSync(filePath, lines.join("\n"), "utf8"); return { ok: true, filePath }; } catch (e) { return { ok: false, error: e.message || "Failed." }; } });

  ipcMain.handle("system:print-receipt", async (_, p) => { try { const o = await get("orders", p.orderId); if (!o) return { ok: false, error: "Order not found." }; const fp = await receiptPdf(p.orderId); await audit(null, "RECEIPT_PRINT_REQUESTED", { orderId: p.orderId, receiptPath: fp }); return { ok: true, message: "Receipt generated.", receiptPath: fp }; } catch (e) { return { ok: false, error: e.message || "Failed." }; } });
  ipcMain.handle("system:open-cash-drawer", async () => { await audit(null, "CASH_DRAWER_OPENED", {}); return { ok: true, message: "Cash drawer signal triggered (simulated)." }; });
  ipcMain.handle("system:open-external", async (_, p = {}) => {
    try {
      const url = String(p.url || "").trim();
      if (!url) return { ok: false, error: "Invalid URL." };
      await shell.openExternal(url);
      return { ok: true };
    } catch (e) { return { ok: false, error: e.message || "Failed to open URL." }; }
  });
  ipcMain.handle("system:create-backup", async (_, p = {}) => { try { if (!(await isMgr(p.userId))) return { ok: false, error: "Only admin/manager can create backup." }; const x = await createDataBackup(p.userId || null, "manual"); return { ok: true, ...x }; } catch (e) { return { ok: false, error: e.message || "Failed to create backup." }; } });
  ipcMain.handle("system:list-backups", async () => { try { return { ok: true, backups: listBackupFiles() }; } catch (e) { return { ok: false, error: e.message || "Failed to list backups." }; } });
  ipcMain.handle("system:restore-backup", async (_, p = {}) => { try { if (!(await isMgr(p.userId))) return { ok: false, error: "Only admin/manager can restore backup." }; const x = await restoreDataBackup(p.userId || null, p.fileName); return { ok: true, ...x }; } catch (e) { return { ok: false, error: e.message || "Failed to restore backup." }; } });
  ipcMain.handle("system:supabase-status", async () => { if (!sbState.enabled || !sb) return { ok: true, supabase: { ...sbState, connected: false } }; try { const { error } = await sb.from("orders").select("id", { head: true, count: "exact" }); if (error) throw error; sbState.lastCheckAt = now(); sbState.lastSyncError = null; return { ok: true, supabase: { ...sbState, connected: true } }; } catch (e) { sbState.lastSyncError = String(e.message || e); sbState.lastCheckAt = now(); return { ok: true, supabase: { ...sbState, connected: false } }; } });
}

function createMainWindow() {
  const win = new BrowserWindow({ width: 1400, height: 900, minWidth: 1100, minHeight: 700, webPreferences: { preload: path.join(__dirname, "preload.js"), nodeIntegration: false, contextIsolation: true } });
  win.loadFile(path.join(__dirname, "renderer", "index.html"));
}

function supabaseConnectivityHint(url, error) {
  const host = (() => {
    try { return new URL(url).hostname; } catch (_) { return null; }
  })();
  const msg = String(error?.message || error || "");
  if (/fetch failed/i.test(msg)) {
    return host
      ? `Failed to reach Supabase host '${host}'. Verify SUPABASE_URL/SUPABASE_PROJECT_ID and network access.`
      : "Failed to reach Supabase host. Verify SUPABASE_URL/SUPABASE_PROJECT_ID and network access.";
  }
  return null;
}

app.whenReady().then(async () => {
  loadEnvFromKnownPaths();
  ensureDir(DATA_DIR);
  ensureDir(LOGS_DIR);
  ensureConfig();
  logLine("INFO", "User Data Path:", userDataPath);
  logLine("INFO", "Database Path:", LOCAL_DB_PATH);
  migrateLegacyStorage();
  ensureDir(RECEIPTS_DIR);
  ensureDir(DAILY_BACKUPS_DIR);
  if (DATA_SOURCE === "local") {
    sb = new LocalDb(LOCAL_DB_PATH);
    if (!fs.existsSync(LOCAL_DB_PATH)) {
      sb.save();
    }
    autoSplitMenuSizesLocal(sb);
    sbState.enabled = true;
    sbState.url = LOCAL_DB_PATH;
    sbState.lastCheckAt = now();
    sbState.lastSyncAt = now();
    sbState.lastSyncError = null;
  } else {
    const u = String(process.env.SUPABASE_URL || "").trim();
    const pid = String(process.env.SUPABASE_PROJECT_ID || "").trim();
    const url = u || (pid ? `https://${pid}.supabase.co` : "");
    const key = String(process.env.SUPABASE_ANON_KEY || "").trim();
    if (!url || !key) {
      const msg = `Missing Supabase credentials. Add .env in ${app.getPath("userData")} or set SUPABASE_URL/SUPABASE_PROJECT_ID and SUPABASE_ANON_KEY.`;
      console.error(msg);
      dialog.showErrorBox("Startup Error", msg);
      app.quit();
      return;
    }
    try {
      const host = new URL(url).hostname;
      await dns.lookup(host);
    } catch (e) {
      const msg = `Supabase host DNS lookup failed: ${e.message || e}\nCheck SUPABASE_URL/SUPABASE_PROJECT_ID in .env.`;
      console.error(msg);
      dialog.showErrorBox("Startup Error", msg);
      app.quit();
      return;
    }
    sb = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } });
    const ping = await sb.from("roles").select("id", { head: true, count: "exact" });
    if (ping.error) {
      console.error("Supabase connection failed:", ping.error.message);
      const hint = supabaseConnectivityHint(url, ping.error);
      if (hint) console.error(hint);
      app.quit();
      return;
    }
    sbState.enabled = true;
    sbState.url = url;
    sbState.lastCheckAt = now();
    sbState.lastSyncAt = now();
    sbState.lastSyncError = null;
  }
  await ensureDailyBackup();
  registerIpc();
  createMainWindow();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createMainWindow(); });
}).catch((e) => {
  const msg = `Unexpected startup error: ${e.message || e}`;
  console.error(msg);
  try { dialog.showErrorBox("Startup Error", msg); } catch (_) { }
  app.quit();
});

app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
