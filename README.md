# FastFood POS

Offline-first fast-food POS desktop app built with Electron, React (renderer), and SQLite.

## Implemented Scope

- PIN-based login with role mapping (`ADMIN`, `MANAGER`, `CASHIER`)
- Order management: create, add items, hold/cancel/finalize, cash checkout
- Ingredient-level inventory deduction through recipe mapping
- Manual inventory adjustments and purchase entries
- Cash sessions: open/close shift, cash in/out, reconciliation variance
- Reporting: sales summary, low-stock alerts, cash sessions, audit logs
- CSV export for paid orders
- Audit trail for key actions
- Daily SQLite backup snapshot on app startup
- Hardware touchpoints simulated via IPC: receipt, KOT, cash drawer signal

## Project Structure

```
fastfood-pos/
├── README.md
├── package.json
├── main.js
├── preload.js
├── database/
│   ├── schema.sql
│   ├── seed_data.sql
│   └── pos.db                # auto-created at first run
├── renderer/
│   ├── index.html
│   ├── App.jsx
│   ├── styles/main.css
│   ├── components/
│   │   ├── Login.jsx
│   │   ├── OrderScreen.jsx
│   │   ├── Checkout.jsx
│   │   ├── Inventory.jsx
│   │   ├── CashSession.jsx
│   │   └── Reports.jsx
│   └── utils/
│       ├── db.js
│       ├── orders.js
│       ├── inventory.js
│       └── cash.js
├── assets/
│   ├── logo.png
│   └── icons/
└── backup/
    └── daily_backups/
```

## Setup

1. Install dependencies:

```bash
npm install
```

2. Start the app:

```bash
npm start
```

3. Optional Supabase mirror sync:

```bash
cp .env.example .env
```

Set:
- `SUPABASE_PROJECT_ID`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

The app stays SQLite-first and syncs writes to Supabase in the background when configured.
For best compatibility, create Supabase tables matching `database/schema.sql` names and columns (at minimum: `orders`, `order_items`, `payments`, `cash_sessions`, `cash_transactions`, `menu_items`, `ingredients`, `inventory_movements`, `audit_logs`).

4. In Supabase SQL Editor, run:

- `database/supabase_schema.sql`

This creates required tables, grants, and RLS policies for `anon`/`authenticated`.
After that, restart the app and call `window.posAPI.getSupabaseStatus()` from DevTools console to verify connection status.

5. Optional one-time historical backfill (SQLite -> Supabase):

```bash
npm run supabase:backfill
```

This upserts all local rows table-by-table in FK-safe order.

At first launch:
- `database/pos.db` is initialized from `database/schema.sql`.
- seed data from `database/seed_data.sql` is inserted if no users exist.
- a daily backup copy is created in `backup/daily_backups/`.

## Default Login Users

- `admin` / `1234`
- `manager` / `2222`
- `cashier` / `9999`

## Notes

- The renderer is loaded directly from `renderer/index.html` using local React + Babel runtime scripts.
- Receipt/KOT/cash-drawer integrations are simulated, ready to be replaced with device-specific adapters.
