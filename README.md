# FastFood POS

Supabase-native fast-food POS desktop app built with Electron and React.

## Implemented Scope

- PIN-based login with role mapping (`ADMIN`, `MANAGER`, `CASHIER`)
- Order management: create, add items, hold/cancel/finalize, cash checkout
- Multi-payment checkout (cash/card/voucher) with partial payments
- Dynamic pricing support: manual discount + promo engine + time-based promos
- Ingredient-level inventory deduction through recipe mapping
- Manual inventory adjustments and purchase entries
- Procurement module: purchase order creation, PO receiving, and PO register
- Kitchen display system (KDS): queued/preparing/ready/served workflow
- Cash sessions: open/close shift, cash in/out, reconciliation variance
- Reporting: sales summary, low-stock alerts, cash sessions, audit logs, procurement snapshot, and top suppliers
- CSV export for paid orders
- Audit trail for key actions
- Hardware touchpoints simulated via IPC: receipt, KOT, cash drawer signal

## Project Structure

```text
fastfood-pos/
|-- README.md
|-- package.json
|-- main.js
|-- preload.js
|-- database/
|   |-- supabase_schema.sql
|   `-- supabase_seed_data.sql
|-- renderer/
|   |-- index.html
|   |-- App.jsx
|   |-- styles/main.css
|   |-- components/
|   `-- utils/
|-- scripts/
|   |-- start-electron.js
|   |-- supabase-clear.js
|   `-- run-with-electron-node.js
|-- assets/
`-- backup/
```

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create env file:

```bash
cp .env.example .env
```

Set:
- `POS_DATA_SOURCE=supabase`
- `SUPABASE_PROJECT_ID`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

3. In Supabase SQL Editor, run:
- `database/supabase_schema.sql`
- `database/supabase_seed_data.sql`

4. Start app:

```bash
npm start
```

5. Verify connection in DevTools:

```js
window.posAPI.getSupabaseStatus()
```

Expect `dataSource: "supabase"` and `connected: true`.

## Utilities

- Clear remote POS data in Supabase:

```bash
npm run supabase:clear
```

## Default Login Users

- `admin` / `1234`
- `manager` / `2222`
- `cashier` / `9999`

## Notes

- Source of truth is Supabase.
- The renderer is loaded directly from `renderer/index.html` using local React + Babel runtime scripts.
