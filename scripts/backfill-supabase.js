require("dotenv").config();
const path = require("path");
const Database = require("better-sqlite3");
const { createClient } = require("@supabase/supabase-js");

const DB_PATH = path.join(__dirname, "..", "database", "pos.db");
const BATCH_SIZE = 500;
const TABLES_IN_ORDER = [
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

function getSupabaseClient() {
  const configuredUrl = String(process.env.SUPABASE_URL || "").trim();
  const projectId = String(process.env.SUPABASE_PROJECT_ID || "").trim();
  const supabaseUrl = configuredUrl || (projectId ? `https://${projectId}.supabase.co` : "");
  const supabaseAnonKey = String(process.env.SUPABASE_ANON_KEY || "").trim();

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Missing SUPABASE_URL/SUPABASE_PROJECT_ID or SUPABASE_ANON_KEY in .env");
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false
    }
  });
}

function chunkRows(rows, size) {
  const chunks = [];
  for (let i = 0; i < rows.length; i += size) {
    chunks.push(rows.slice(i, i + size));
  }
  return chunks;
}

async function backfillTable(db, supabase, table) {
  const rows = db.prepare(`SELECT * FROM ${table} ORDER BY id`).all();
  if (!rows.length) {
    console.log(`[${table}] skipped (0 rows)`);
    return { table, total: 0, synced: 0 };
  }

  let synced = 0;
  const batches = chunkRows(rows, BATCH_SIZE);

  for (const batch of batches) {
    const { error } = await supabase.from(table).upsert(batch, { onConflict: "id" });
    if (error) {
      throw new Error(`[${table}] ${error.message}`);
    }
    synced += batch.length;
    console.log(`[${table}] ${synced}/${rows.length}`);
  }

  return { table, total: rows.length, synced };
}

async function run() {
  const db = new Database(DB_PATH, { readonly: true });
  const supabase = getSupabaseClient();

  try {
    console.log(`Backfill started from: ${DB_PATH}`);
    const results = [];
    for (const table of TABLES_IN_ORDER) {
      const result = await backfillTable(db, supabase, table);
      results.push(result);
    }

    const totalRows = results.reduce((acc, r) => acc + r.total, 0);
    const syncedRows = results.reduce((acc, r) => acc + r.synced, 0);
    console.log(`Backfill completed. Synced ${syncedRows}/${totalRows} rows.`);
  } finally {
    db.close();
  }
}

run().catch((error) => {
  console.error("Backfill failed:", error.message || error);
  process.exit(1);
});
