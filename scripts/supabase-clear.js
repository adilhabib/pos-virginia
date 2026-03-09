require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");

const DELETE_ORDER = [
  "employee_salary_closures",
  "employee_ledger",
  "employee_register",
  "kitchen_ticket_items",
  "kitchen_tickets",
  "payments",
  "order_items",
  "inventory_movements",
  "cash_transactions",
  "cash_sessions",
  "orders",
  "recipes",
  "ingredients",
  "menu_items",
  "promotions",
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

async function clearTable(supabase, table) {
  const { error } = await supabase.from(table).delete().not("id", "is", null);
  if (error) throw new Error(`[${table}] ${error.message}`);
  console.log(`[${table}] cleared`);
}

async function run() {
  const supabase = getSupabaseClient();
  console.log("Clearing Supabase POS tables...");
  for (const table of DELETE_ORDER) {
    await clearTable(supabase, table);
  }
  console.log("Supabase data clear complete.");
}

run().catch((error) => {
  console.error("Supabase clear failed:", error.message || error);
  process.exit(1);
});
