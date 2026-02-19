const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");

const RECEIPTS_DIR = path.join(__dirname, "backup", "receipts");
let sb = null;
const sbState = { enabled: false, url: null, lastCheckAt: null, lastSyncAt: null, lastSyncError: null, dataSource: "supabase" };
const now = () => new Date().toISOString();
const money = (c) => new Intl.NumberFormat("en-PK", { style: "currency", currency: "PKR", currencyDisplay: "narrowSymbol", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(c || 0) / 100);
const esc = (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#039;");
const hashPin = (pin) => crypto.createHash("sha256").update(String(pin)).digest("hex");

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
  const { data, error } = await sb.from(table).insert(row).select("*").single();
  if (error) throw new Error(error.message);
  sbState.lastSyncAt = now();
  return data;
}
async function upd(table, fn, patch) {
  let qb = sb.from(table).update(patch); qb = fn(qb);
  const { data, error } = await qb.select("*");
  if (error) throw new Error(error.message);
  sbState.lastSyncAt = now();
  return data || [];
}
async function del(table, fn) {
  const { error } = await fn(sb.from(table).delete());
  if (error) throw new Error(error.message);
  sbState.lastSyncAt = now();
}
async function audit(userId, action, payload = null) {
  try { await ins("audit_logs", { user_id: userId || null, action, payload_json: payload ? JSON.stringify(payload) : null, created_at: now() }); } catch (_) {}
}
async function role(userId) {
  if (!userId) return null;
  const u = await get("users", userId); if (!u || !u.active) return null;
  const r = await get("roles", u.role_id); return r ? r.name : null;
}
async function isMgr(userId) { const r = await role(userId); return r === "ADMIN" || r === "MANAGER"; }
async function openSession() { const r = await q("cash_sessions", (x) => x.eq("status", "OPEN").order("id", { ascending: false }).limit(1)); return r[0] || null; }

async function orderItems(orderId) {
  const items = await q("order_items", (x) => x.eq("order_id", orderId).order("id", { ascending: true }));
  if (!items.length) return [];
  const ids = Array.from(new Set(items.map((i) => i.menu_item_id).filter(Boolean)));
  const menu = ids.length ? await q("menu_items", (x) => x.in("id", ids)) : [];
  const by = new Map(menu.map((m) => [m.id, m]));
  return items.map((i) => ({ ...i, item_name: by.get(i.menu_item_id)?.name || "Unknown Item", category: by.get(i.menu_item_id)?.category || null }));
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
  } else {
    const auto = await q("promotions", (x) => x.eq("active", 1).eq("auto_apply", 1));
    let best = null; let bestD = 0;
    for (const p of auto) { const d = promoDiscount(p, subtotal, items, menuById); if (d > bestD) { bestD = d; best = p; } }
    if (best) { pdisc = bestD; promoId = best.id; code = best.code ? String(best.code).toUpperCase() : null; }
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
  const rows = items.map((i) => `<tr><td>${esc(i.item_name)}</td><td>x${i.quantity}</td><td style="text-align:right">${money(i.line_total_cents)}</td></tr>`).join("");
  return `<!doctype html><html><head><meta charset="UTF-8"/><style>body{font-family:Arial,sans-serif;padding:10px;font-size:12px;color:#111}h2{margin:0 0 6px;font-size:16px}.muted{color:#666;margin:2px 0}table{width:100%;border-collapse:collapse;margin-top:8px}td{padding:4px 0;border-bottom:1px dashed #ddd;vertical-align:top}.totals{margin-top:8px}.line{display:flex;justify-content:space-between;margin:3px 0}.total{font-weight:700;font-size:14px;margin-top:6px}</style></head><body><h2>Virginia POS Receipt</h2><div class="muted">Order #${order.id}</div><div class="muted">Cashier: ${esc(order.cashier || "-")}</div><div class="muted">Date: ${esc(payment?.created_at || order.updated_at || order.created_at)}</div><div class="muted">Customer: ${esc(order.customer_name || "Guest")}</div><div class="muted">Phone: ${esc(order.customer_phone || "-")}</div><table><tbody>${rows}</tbody></table><div class="totals"><div class="line"><span>Subtotal</span><span>${money(order.subtotal_cents)}</span></div><div class="line"><span>Discount</span><span>${money(order.discount_cents)}</span></div><div class="line total"><span>Total</span><span>${money(order.total_cents)}</span></div><div class="line"><span>Cash Received</span><span>${money(payment?.received_cents)}</span></div><div class="line"><span>Change</span><span>${money(payment?.change_cents)}</span></div></div></body></html>`;
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
    try { await new Promise((r) => win.webContents.print({ silent: false, printBackground: true }, () => r())); } catch (_) {}
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

async function ensureKds(orderId) {
  const ex = await q("kitchen_tickets", (x) => x.eq("order_id", orderId).limit(1));
  if (ex[0]) return ex[0].id;
  const t = await ins("kitchen_tickets", { order_id: orderId, status: "QUEUED", created_at: now(), updated_at: now() });
  const items = await orderItems(orderId);
  for (const it of items) await ins("kitchen_ticket_items", { ticket_id: t.id, menu_item_id: it.menu_item_id || null, menu_item_name: it.item_name, category: it.category || null, quantity: Number(it.quantity || 1) });
  return t.id;
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

  ipcMain.handle("menu:list", async (_, p = {}) => { try { if (p.includeInactive && !(await isMgr(p.userId))) return { ok: false, error: "Only admin/manager can manage menu." }; return { ok: true, items: await q("menu_items", (x) => (p.includeInactive ? x : x.eq("active", 1)).order("category", { ascending: true }).order("name", { ascending: true })) }; } catch (e) { return { ok: false, error: e.message || "Failed." }; } });
  ipcMain.handle("menu:create", async (_, p = {}) => { try { if (!(await isMgr(p.userId))) return { ok: false, error: "Only admin/manager can create menu items." }; if (!p.name || !p.category) return { ok: false, error: "Name and category are required." }; const price = Number(p.priceCents); if (!Number.isFinite(price) || price < 0) return { ok: false, error: "Invalid price." }; const row = await ins("menu_items", { name: String(p.name).trim(), category: String(p.category).trim(), price_cents: Math.round(price), active: p.active ? 1 : 0 }); await audit(p.userId, "MENU_ITEM_CREATED", { menuItemId: row.id }); return { ok: true, id: row.id }; } catch (e) { return { ok: false, error: e.message || "Failed." }; } });
  ipcMain.handle("menu:update", async (_, p = {}) => { try { if (!(await isMgr(p.userId))) return { ok: false, error: "Only admin/manager can update menu items." }; const it = await get("menu_items", p.menuItemId); if (!it) return { ok: false, error: "Menu item not found." }; const u = {}; if (p.name != null) u.name = String(p.name).trim(); if (p.category != null) u.category = String(p.category).trim(); if (p.priceCents != null) { const v = Number(p.priceCents); if (!Number.isFinite(v) || v < 0) return { ok: false, error: "Invalid price." }; u.price_cents = Math.round(v); } if (p.active != null) u.active = p.active ? 1 : 0; if (!Object.keys(u).length) return { ok: false, error: "No fields to update." }; await upd("menu_items", (x) => x.eq("id", p.menuItemId), u); await audit(p.userId, "MENU_ITEM_UPDATED", { menuItemId: p.menuItemId }); return { ok: true }; } catch (e) { return { ok: false, error: e.message || "Failed." }; } });

  ipcMain.handle("promotions:list", async () => { try { return { ok: true, promotions: await q("promotions", (x) => x.order("active", { ascending: false }).order("id", { ascending: false })) }; } catch (e) { return { ok: false, error: e.message || "Failed." }; } });
  ipcMain.handle("promotions:create", async (_, p = {}) => { try { if (!(await isMgr(p.userId))) return { ok: false, error: "Only admin/manager can create promotions." }; const row = await ins("promotions", { code: p.code ? String(p.code).trim().toUpperCase() : null, name: String(p.name).trim(), promo_type: String(p.promoType), value_num: Number(p.valueNum || 0), cap_cents: p.capCents == null || p.capCents === "" ? null : Math.max(0, Math.round(Number(p.capCents))), category: p.category ? String(p.category).trim() : null, start_time: p.startTime ? String(p.startTime).trim() : null, end_time: p.endTime ? String(p.endTime).trim() : null, days_mask: p.daysMask ? String(p.daysMask).trim() : null, active: p.active === false ? 0 : 1, auto_apply: p.autoApply ? 1 : 0, created_at: now() }); await audit(p.userId, "PROMOTION_CREATED", { promotionId: row.id }); return { ok: true, id: row.id }; } catch (e) { return { ok: false, error: e.message || "Failed." }; } });
  ipcMain.handle("promotions:update", async (_, p = {}) => { try { if (!(await isMgr(p.userId))) return { ok: false, error: "Only admin/manager can update promotions." }; const pr = await get("promotions", p.promotionId); if (!pr) return { ok: false, error: "Promotion not found." }; await upd("promotions", (x) => x.eq("id", p.promotionId), { code: p.code ? String(p.code).trim().toUpperCase() : null, name: String(p.name).trim(), promo_type: String(p.promoType), value_num: Number(p.valueNum || 0), cap_cents: p.capCents == null || p.capCents === "" ? null : Math.max(0, Math.round(Number(p.capCents))), category: p.category ? String(p.category).trim() : null, start_time: p.startTime ? String(p.startTime).trim() : null, end_time: p.endTime ? String(p.endTime).trim() : null, days_mask: p.daysMask ? String(p.daysMask).trim() : null, active: p.active ? 1 : 0, auto_apply: p.autoApply ? 1 : 0 }); await audit(p.userId, "PROMOTION_UPDATED", { promotionId: p.promotionId }); return { ok: true }; } catch (e) { return { ok: false, error: e.message || "Failed." }; } });

  ipcMain.handle("orders:create", async (_, p) => { try { const s = await openSession(); if (!s) return { ok: false, error: "Open a cash shift before creating orders." }; const o = await ins("orders", { status: "DRAFT", subtotal_cents: 0, manual_discount_cents: 0, promo_discount_cents: 0, promo_code: null, promo_id: null, discount_cents: 0, tax_cents: 0, total_cents: 0, cashier_user_id: p.cashierUserId, notes: p.notes || null, created_at: now(), updated_at: now() }); await audit(p.cashierUserId, "ORDER_CREATED", { orderId: o.id }); return { ok: true, orderId: o.id }; } catch (e) { return { ok: false, error: e.message || "Failed." }; } });
  ipcMain.handle("orders:list-open", async (_, p = {}) => { try { const os = await q("orders", (x) => { let b = x.in("status", ["DRAFT", "HOLD"]); if (p.cashierUserId) b = b.eq("cashier_user_id", p.cashierUserId); return b.order("updated_at", { ascending: false }).limit(25); }); const ids = os.map((o) => o.id); const its = ids.length ? await q("order_items", (x) => x.in("order_id", ids)) : []; const m = new Map(); for (const i of its) m.set(i.order_id, (m.get(i.order_id) || 0) + Number(i.quantity || 0)); return { ok: true, orders: os.map((o) => ({ id: o.id, status: o.status, customer_name: o.customer_name, customer_phone: o.customer_phone, total_cents: o.total_cents, updated_at: o.updated_at, item_count: m.get(o.id) || 0 })) }; } catch (e) { return { ok: false, error: e.message || "Failed." }; } });
  ipcMain.handle("orders:get", async (_, p) => { try { const o = await get("orders", p.orderId); if (!o) return { ok: false, error: "Order not found." }; return { ok: true, order: o, items: await orderItems(p.orderId) }; } catch (e) { return { ok: false, error: e.message || "Failed." }; } });
  ipcMain.handle("orders:get-payments", async (_, p) => { try { const o = await get("orders", p.orderId); if (!o) return { ok: false, error: "Order not found." }; const pays = await q("payments", (x) => x.eq("order_id", p.orderId).order("id", { ascending: true })); const paid = pays.reduce((a, r) => a + Number(r.amount_cents || 0), 0); return { ok: true, payments: pays, paidCents: paid, remainingCents: Math.max(0, Number(o.total_cents || 0) - paid), orderTotalCents: Number(o.total_cents || 0), status: o.status }; } catch (e) { return { ok: false, error: e.message || "Failed." }; } });
  ipcMain.handle("orders:add-item", async (_, p) => { try { const o = await get("orders", p.orderId); if (!o) return { ok: false, error: "Order not found." }; if (!["DRAFT", "HOLD"].includes(o.status)) return { ok: false, error: "Only DRAFT/HOLD orders can be edited." }; const mi = await get("menu_items", p.menuItemId); if (!mi) return { ok: false, error: "Menu item not found." }; const qty = Number(p.quantity || 1); if (qty <= 0) return { ok: false, error: "Quantity must be positive." }; if (!p.modifiers) { const ex = await q("order_items", (x) => x.eq("order_id", p.orderId).eq("menu_item_id", p.menuItemId).is("modifiers_json", null).limit(1)); if (ex[0]) { const n = Number(ex[0].quantity || 0) + qty; await upd("order_items", (x) => x.eq("id", ex[0].id), { quantity: n, line_total_cents: Number(mi.price_cents || 0) * n }); } else { await ins("order_items", { order_id: p.orderId, menu_item_id: p.menuItemId, quantity: qty, unit_price_cents: Number(mi.price_cents || 0), line_total_cents: Number(mi.price_cents || 0) * qty, modifiers_json: null }); } } else { await ins("order_items", { order_id: p.orderId, menu_item_id: p.menuItemId, quantity: qty, unit_price_cents: Number(mi.price_cents || 0), line_total_cents: Number(mi.price_cents || 0) * qty, modifiers_json: JSON.stringify(p.modifiers) }); } await recalc(p.orderId); return { ok: true }; } catch (e) { return { ok: false, error: e.message || "Failed." }; } });
  ipcMain.handle("orders:update-item-qty", async (_, p) => { try { const o = await get("orders", p.orderId); if (!o) return { ok: false, error: "Order not found." }; if (!["DRAFT", "HOLD"].includes(o.status)) return { ok: false, error: "Only DRAFT/HOLD orders can be edited." }; const it = await get("order_items", p.orderItemId); if (!it || it.order_id !== p.orderId) return { ok: false, error: "Order item not found." }; const qty = Number(p.quantity); if (qty <= 0) await del("order_items", (x) => x.eq("id", p.orderItemId)); else await upd("order_items", (x) => x.eq("id", p.orderItemId), { quantity: qty, line_total_cents: Number(it.unit_price_cents || 0) * qty }); await recalc(p.orderId); return { ok: true }; } catch (e) { return { ok: false, error: e.message || "Failed." }; } });
  ipcMain.handle("orders:update-discount", async (_, p) => { try { const o = await get("orders", p.orderId); if (!o) return { ok: false, error: "Order not found." }; if (["PAID", "CANCELLED"].includes(o.status)) return { ok: false, error: "Discount can be updated only before payment/cancel." }; const req = Math.round(Number(p.discountCents || 0)); if (!Number.isFinite(req) || req < 0) return { ok: false, error: "Invalid discount amount." }; await upd("orders", (x) => x.eq("id", p.orderId), { manual_discount_cents: req, updated_at: now() }); const u = await recalc(p.orderId); await audit(p.userId || null, "ORDER_DISCOUNT_UPDATED", { orderId: p.orderId, discountCents: u.discount_cents }); return { ok: true, manualDiscountCents: u.manual_discount_cents, promoDiscountCents: u.promo_discount_cents, discountCents: u.discount_cents, totalCents: u.total_cents }; } catch (e) { return { ok: false, error: e.message || "Failed." }; } });
  ipcMain.handle("orders:apply-promo", async (_, p) => { try { const o = await get("orders", p.orderId); if (!o) return { ok: false, error: "Order not found." }; if (["PAID", "CANCELLED"].includes(o.status)) return { ok: false, error: "Promo can be applied only before payment/cancel." }; const code = String(p.promoCode || "").trim().toUpperCase(); if (!code) return { ok: false, error: "Promo code is required." }; const pr = await q("promotions", (x) => x.eq("active", 1).ilike("code", code).limit(1)); if (!pr[0]) return { ok: false, error: "Invalid promo code." }; if (!promoTimeOk(pr[0])) return { ok: false, error: "Promo is not active at this time." }; await upd("orders", (x) => x.eq("id", p.orderId), { promo_code: code, promo_id: pr[0].id, updated_at: now() }); const u = await recalc(p.orderId); await audit(p.userId || null, "ORDER_PROMO_APPLIED", { orderId: p.orderId, promoCode: code, promoId: pr[0].id }); return { ok: true, promo: u }; } catch (e) { return { ok: false, error: e.message || "Failed." }; } });
  ipcMain.handle("orders:clear-promo", async (_, p) => { try { const o = await get("orders", p.orderId); if (!o) return { ok: false, error: "Order not found." }; if (["PAID", "CANCELLED"].includes(o.status)) return { ok: false, error: "Promo can be cleared only before payment/cancel." }; await upd("orders", (x) => x.eq("id", p.orderId), { promo_code: null, promo_id: null, promo_discount_cents: 0, updated_at: now() }); await recalc(p.orderId); await audit(p.userId || null, "ORDER_PROMO_CLEARED", { orderId: p.orderId }); return { ok: true }; } catch (e) { return { ok: false, error: e.message || "Failed." }; } });
  ipcMain.handle("orders:update-customer", async (_, p) => { try { const o = await get("orders", p.orderId); if (!o) return { ok: false, error: "Order not found." }; if (!["DRAFT", "HOLD"].includes(o.status)) return { ok: false, error: "Customer details can be updated only for DRAFT/HOLD orders." }; await upd("orders", (x) => x.eq("id", p.orderId), { customer_name: p.customerName ? String(p.customerName).trim() : null, customer_phone: p.customerPhone ? String(p.customerPhone).trim() : null, updated_at: now() }); await audit(p.userId || null, "ORDER_CUSTOMER_UPDATED", { orderId: p.orderId }); return { ok: true }; } catch (e) { return { ok: false, error: e.message || "Failed." }; } });
  ipcMain.handle("orders:update-status", async (_, p) => { try { const st = String(p.status || "").toUpperCase(); if (!["DRAFT", "HOLD", "CANCELLED", "FINALIZED", "PAID"].includes(st)) return { ok: false, error: "Invalid status." }; const o = await get("orders", p.orderId); if (!o) return { ok: false, error: "Order not found." }; if (st === "FINALIZED" && !["FINALIZED", "PAID"].includes(o.status)) { const s = await shortages(p.orderId); if (s.length) return { ok: false, error: "Insufficient stock.", shortages: s }; await deductStock(p.orderId, p.userId); await ensureKds(p.orderId); } await upd("orders", (x) => x.eq("id", p.orderId), { status: st, updated_at: now() }); if (st === "CANCELLED") { const t = await q("kitchen_tickets", (x) => x.eq("order_id", p.orderId).limit(1)); if (t[0]) await upd("kitchen_tickets", (x) => x.eq("id", t[0].id), { status: "CANCELLED", updated_at: now() }); } await audit(p.userId || null, "ORDER_STATUS_UPDATED", { orderId: p.orderId, status: st }); return { ok: true }; } catch (e) { return { ok: false, error: e.message || "Failed." }; } });
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

  ipcMain.handle("kds:list", async (_, p = {}) => { try { const allowed = ["QUEUED", "PREPARING", "READY", "SERVED", "CANCELLED"]; let st = Array.isArray(p.statuses) ? p.statuses.map((s) => String(s).toUpperCase()).filter((s) => allowed.includes(s)) : ["QUEUED", "PREPARING", "READY"]; if (!st.length) st = ["QUEUED", "PREPARING", "READY"]; const t = await q("kitchen_tickets", (x) => x.in("status", st).order("id", { ascending: true })); const orderIds = t.map((v) => v.order_id); const os = orderIds.length ? await q("orders", (x) => x.in("id", orderIds)) : []; const ob = new Map(os.map((o) => [o.id, o])); const tids = t.map((v) => v.id); const it = tids.length ? await q("kitchen_ticket_items", (x) => x.in("ticket_id", tids).order("id", { ascending: true })) : []; const im = new Map(); for (const r of it) { const a = im.get(r.ticket_id) || []; a.push(r); im.set(r.ticket_id, a); } return { ok: true, tickets: t.map((r) => ({ ...r, customer_name: ob.get(r.order_id)?.customer_name || null, customer_phone: ob.get(r.order_id)?.customer_phone || null, items: im.get(r.id) || [] })) }; } catch (e) { return { ok: false, error: e.message || "Failed." }; } });
  ipcMain.handle("kds:update-status", async (_, p) => { try { const st = String(p.status || "").toUpperCase(); if (!["QUEUED", "PREPARING", "READY", "SERVED", "CANCELLED"].includes(st)) return { ok: false, error: "Invalid ticket status." }; const t = await get("kitchen_tickets", p.ticketId); if (!t) return { ok: false, error: "Ticket not found." }; const patch = { status: st, bumped_by_user_id: p.userId || null, updated_at: now() }; if (st === "PREPARING" && !t.started_at) patch.started_at = now(); if (st === "READY") patch.ready_at = now(); if (st === "SERVED") patch.served_at = now(); await upd("kitchen_tickets", (x) => x.eq("id", p.ticketId), patch); await audit(p.userId || null, "KDS_TICKET_STATUS_UPDATED", { ticketId: p.ticketId, orderId: t.order_id, status: st }); return { ok: true }; } catch (e) { return { ok: false, error: e.message || "Failed." }; } });
  ipcMain.handle("kds:bump", async (_, p) => { try { const t = await get("kitchen_tickets", p.ticketId); if (!t) return { ok: false, error: "Ticket not found." }; const n = ({ QUEUED: "PREPARING", PREPARING: "READY", READY: "SERVED", SERVED: "SERVED", CANCELLED: "CANCELLED" })[t.status] || t.status; if (n === t.status) return { ok: true, status: n }; const patch = { status: n, bumped_by_user_id: p.userId || null, updated_at: now() }; if (n === "PREPARING" && !t.started_at) patch.started_at = now(); if (n === "READY") patch.ready_at = now(); if (n === "SERVED") patch.served_at = now(); await upd("kitchen_tickets", (x) => x.eq("id", p.ticketId), patch); await audit(p.userId || null, "KDS_TICKET_BUMPED", { ticketId: p.ticketId, orderId: t.order_id, from: t.status, to: n }); return { ok: true, status: n }; } catch (e) { return { ok: false, error: e.message || "Failed." }; } });

  ipcMain.handle("reports:summary", async (_, p) => {
    try {
      const days = p.range === "monthly" ? 30 : p.range === "weekly" ? 7 : 1;
      const since = new Date(); since.setDate(since.getDate() - days); const sinceMs = since.getTime();
      const orders = await q("orders", (x) => x.order("id", { ascending: false }).limit(5000));
      const paid = orders.filter((o) => o.status === "PAID" && new Date(o.created_at).getTime() >= sinceMs);
      const sales = { paid_orders: paid.length, gross_sales: paid.reduce((a, o) => a + Number(o.total_cents || 0), 0) };
      const orderIds = paid.map((o) => o.id); const items = orderIds.length ? await q("order_items", (x) => x.in("order_id", orderIds)) : [];
      const menuIds = Array.from(new Set(items.map((i) => i.menu_item_id).filter(Boolean))); const menu = menuIds.length ? await q("menu_items", (x) => x.in("id", menuIds)) : []; const mb = new Map(menu.map((m) => [m.id, m]));
      const top = new Map(); for (const i of items) { const n = mb.get(i.menu_item_id)?.name || "Unknown Item"; top.set(n, (top.get(n) || 0) + Number(i.quantity || 0)); }
      const topItems = Array.from(top.entries()).map(([name, qty]) => ({ name, qty })).sort((a, b) => b.qty - a.qty).slice(0, 5);
      const users = await q("users", (x) => x.limit(1000)); const ub = new Map(users.map((u) => [u.id, u.username]));
      const cs = new Map(); for (const o of paid) { const c = ub.get(o.cashier_user_id) || null; const k = c || "-"; const prev = cs.get(k) || { cashier: c, paid_orders: 0, gross_sales: 0 }; prev.paid_orders += 1; prev.gross_sales += Number(o.total_cents || 0); cs.set(k, prev); }
      const cashierSales = Array.from(cs.values()).sort((a, b) => b.gross_sales - a.gross_sales);
      const categoryMargin = Array.from(new Set(menu.map((m) => m.category))).map((cat) => { const catItems = items.filter((i) => mb.get(i.menu_item_id)?.category === cat); const net = catItems.reduce((a, i) => a + Number(i.line_total_cents || 0), 0); return { category: cat, net_sales_cents: net, estimated_cost_cents: 0, gross_margin_cents: net }; });
      const taxSummary = { taxable_sales_cents: paid.reduce((a, o) => a + Number(o.subtotal_cents || 0), 0), total_discount_cents: paid.reduce((a, o) => a + Number(o.discount_cents || 0), 0), tax_collected_cents: paid.reduce((a, o) => a + Number(o.tax_cents || 0), 0), net_sales_cents: paid.reduce((a, o) => a + Number(o.total_cents || 0), 0) };
      const sessions = await q("cash_sessions", (x) => x.order("id", { ascending: false }).limit(1000)); const tx = await q("cash_transactions", (x) => x.order("id", { ascending: false }).limit(5000));
      const openingFloat = sessions.filter((s) => isToday(s.opened_at)).reduce((a, s) => a + Number(s.opening_cents || 0), 0);
      const cashIn = tx.filter((t) => t.transaction_type === "IN" && isToday(t.created_at)).reduce((a, t) => a + Number(t.amount_cents || 0), 0);
      const cashOut = tx.filter((t) => t.transaction_type === "OUT" && isToday(t.created_at)).reduce((a, t) => a + Number(t.amount_cents || 0), 0);
      const actualClose = sessions.filter((s) => s.closed_at && isToday(s.closed_at)).reduce((a, s) => a + Number(s.closing_cents || 0), 0);
      const eodClose = { openingFloat, cashIn, cashOut, expectedClose: openingFloat + cashIn - cashOut, actualClose, variance: actualClose - (openingFloat + cashIn - cashOut), closedSessions: sessions.filter((s) => s.status === "CLOSED" && s.closed_at && isToday(s.closed_at)).length };
      const lowStock = (await q("ingredients", (x) => x.order("stock_qty", { ascending: true }))).filter((i) => Number(i.stock_qty || 0) <= Number(i.low_stock_threshold || 0));
      const cash = sessions.slice(0, 10);
      const logs = await q("audit_logs", (x) => x.order("id", { ascending: false }).limit(100));
      const auditRows = logs.map((a) => ({ ...a, username: ub.get(a.user_id) || null }));
      return { ok: true, summary: { sales, topItems, cashierSales, categoryMargin, taxSummary, eodClose, lowStock, cash, audit: auditRows } };
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
  ipcMain.handle("system:send-kot", async (_, p) => { const o = await get("orders", p.orderId); if (!o) return { ok: false, error: "Order not found." }; await audit(null, "KOT_PRINT_REQUESTED", { orderId: p.orderId }); return { ok: true, message: "KOT print request queued (simulated)." }; });
  ipcMain.handle("system:open-cash-drawer", async () => { await audit(null, "CASH_DRAWER_OPENED", {}); return { ok: true, message: "Cash drawer signal triggered (simulated)." }; });
  ipcMain.handle("system:supabase-status", async () => { if (!sbState.enabled || !sb) return { ok: true, supabase: { ...sbState, connected: false } }; try { const { error } = await sb.from("orders").select("id", { head: true, count: "exact" }); if (error) throw error; sbState.lastCheckAt = now(); sbState.lastSyncError = null; return { ok: true, supabase: { ...sbState, connected: true } }; } catch (e) { sbState.lastSyncError = String(e.message || e); sbState.lastCheckAt = now(); return { ok: true, supabase: { ...sbState, connected: false } }; } });
}

function createMainWindow() {
  const win = new BrowserWindow({ width: 1400, height: 900, minWidth: 1100, minHeight: 700, webPreferences: { preload: path.join(__dirname, "preload.js"), nodeIntegration: false, contextIsolation: true } });
  win.loadFile(path.join(__dirname, "renderer", "index.html"));
}

app.whenReady().then(async () => {
  fs.mkdirSync(RECEIPTS_DIR, { recursive: true });
  const u = String(process.env.SUPABASE_URL || "").trim();
  const pid = String(process.env.SUPABASE_PROJECT_ID || "").trim();
  const url = u || (pid ? `https://${pid}.supabase.co` : "");
  const key = String(process.env.SUPABASE_ANON_KEY || "").trim();
  if (!url || !key) { console.error("Missing Supabase credentials."); app.quit(); return; }
  sb = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } });
  const ping = await sb.from("roles").select("id", { head: true, count: "exact" });
  if (ping.error) { console.error("Supabase connection failed:", ping.error.message); app.quit(); return; }
  sbState.enabled = true; sbState.url = url; sbState.lastCheckAt = now(); sbState.lastSyncAt = now(); sbState.lastSyncError = null;
  registerIpc();
  createMainWindow();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createMainWindow(); });
});

app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
