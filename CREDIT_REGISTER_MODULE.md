# Credit Register Module for POS Integration

## Purpose
This module adds customer credit tracking and vendor payable tracking to a POS system.

It is built as a desktop app using:
- Electron
- React + Vite
- SQLite (better-sqlite3)

You can integrate this module into an existing POS application in two ways:
- Direct UI integration (reuse pages and flows)
- Service integration (reuse database model + business logic + IPC contracts)

---

## Functional Scope

### Customer Side
- Customer management
  - Add, edit, delete, search
- New sale entry
  - Full credit
  - Partial payment
  - Paid in full
- Receive payment
- Customer ledger
  - Running balance
  - Print ledger
  - Share ledger on WhatsApp using customer phone number

### Vendor Side
- Vendor management
  - Add, edit, delete, search
- New purchase entry
  - Full credit
  - Partial payment
  - Paid in full
- Vendor payment entry
- Vendor ledger
  - Running balance
  - Print ledger
  - Share ledger on WhatsApp using vendor phone number

### Dashboard
- Customer outstanding totals
- Customer due count
- Today sales and payments
- Vendor payable totals
- Today purchases
- Top customers and top vendors by balance

---

## Project Structure

- electron/main.js
  - SQLite initialization
  - Data/business logic via IPC handlers
- electron/preload.js
  - Safe renderer API bridge at window.api
- src/pages
  - Dashboard.jsx
  - Customers.jsx
  - NewSale.jsx
  - Payments.jsx
  - Ledger.jsx
  - Vendors.jsx
  - NewPurchase.jsx
  - VendorPayments.jsx
  - VendorLedger.jsx
- src/components/Sidebar.jsx
  - Navigation for customer and vendor sections
- src/App.jsx
  - Route map
- src/App.css
  - Shared styles + print styles

---

## Database Schema

### customers
- id (PK)
- name
- phone
- address
- credit_limit
- current_balance
- notes
- created_at

### sales
- id (PK)
- customer_id (FK -> customers.id)
- total_amount
- paid_amount
- remaining_credit
- description
- created_at

### payments
- id (PK)
- customer_id (FK -> customers.id)
- amount
- note
- created_at

### vendors
- id (PK)
- name
- phone
- address
- current_balance
- notes
- created_at

### purchases
- id (PK)
- vendor_id (FK -> vendors.id)
- total_amount
- paid_amount
- remaining_credit
- description
- created_at

### vendor_payments
- id (PK)
- vendor_id (FK -> vendors.id)
- amount
- note
- created_at

---

## Core Balance Rules

### Customer balance updates
- On sale create:
  - remaining_credit = total_amount - paid_amount
  - customers.current_balance += remaining_credit
- On payment create:
  - customers.current_balance -= amount

### Vendor balance updates
- On purchase create:
  - remaining_credit = total_amount - paid_amount
  - vendors.current_balance += remaining_credit
- On vendor payment create:
  - vendors.current_balance -= amount

---

## Ledger Logic

### Customer ledger
Union of:
- Sales as debit
- Payments as credit

Running balance per row:
- balance = previous_balance + debit - credit

### Vendor ledger
Union of:
- Purchases as debit
- Vendor payments as credit

Running balance per row:
- balance = previous_balance + debit - credit

---

## IPC Contract (window.api)

### customers
- getAll()
- getById(id)
- create(data)
- update(id, data)
- delete(id)

### sales
- getAll()
- getByCustomer(id)
- create(data)

### payments
- getAll()
- getByCustomer(id)
- create(data)

### ledger
- getByCustomer(id)

### vendors
- getAll()
- getById(id)
- create(data)
- update(id, data)
- delete(id)

### purchases
- getAll()
- getByVendor(id)
- create(data)

### vendorPayments
- getAll()
- getByVendor(id)
- create(data)

### vendorLedger
- getByVendor(id)

### dashboard
- getStats()

### system
- openExternal(url)
  - Used for WhatsApp share links

---

## UI Routes

- /dashboard
- /customers
- /new-sale
- /payments
- /ledger
- /ledger/:customerId
- /vendors
- /new-purchase
- /vendor-payments
- /vendor-ledger
- /vendor-ledger/:vendorId

---

## Print and WhatsApp Share

### Print
- Implemented in customer and vendor ledger pages via window.print()
- Print CSS hides sidebar/actions and keeps ledger content clean on paper

### WhatsApp share
- Implemented in customer and vendor ledger pages
- Uses stored phone number when available
- Phone is sanitized to digits for wa.me format
- Fallback opens generic WhatsApp share if number is missing

---

## How to Merge into an Existing POS

## Option A: Keep as a standalone Credit Register module
Use this module as a separate desktop window or submenu item in your POS.

Steps:
1. Keep current SQLite schema in same DB file or a dedicated DB file.
2. Launch this module from POS as a separate Electron route/window.
3. Pass customer and vendor identities from POS to this module where needed.

## Option B: Merge into your current POS codebase

### Backend merge
1. Add all six tables to your existing POS database.
2. Copy equivalent business logic for:
   - sales:create
   - payments:create
   - purchases:create
   - vendorPayments:create
3. Preserve transaction boundaries around balance updates.

### API merge
1. Keep API shape similar to current window.api contracts.
2. If your POS uses REST instead of IPC, map each IPC action to REST endpoints.

### Frontend merge
1. Add routes for customer and vendor credit/payable pages.
2. Reuse or adapt components from src/pages.
3. Add sidebar section for Credit and Vendor Payables.

### Data consistency
1. Ensure POS sales posting does not duplicate credit entries.
2. If sale is paid in full at POS, do not increase current_balance.
3. If partial payment exists, only post remaining as credit.

---

## Suggested REST Mapping (if needed)

### Customer
- GET /api/customers
- POST /api/customers
- PUT /api/customers/:id
- DELETE /api/customers/:id
- GET /api/customers/:id/ledger

### Sales and payments
- POST /api/sales
- POST /api/payments

### Vendor
- GET /api/vendors
- POST /api/vendors
- PUT /api/vendors/:id
- DELETE /api/vendors/:id
- GET /api/vendors/:id/ledger

### Purchases and vendor payments
- POST /api/purchases
- POST /api/vendor-payments

---

## Build and Run

Prerequisites:
- Node.js 20+

Commands:
- npm install
- npm run dev
- npm run build
- npm run electron

If your environment uses portable Node, ensure PATH includes your Node folder before running commands.

---

## Reuse Checklist for POS

- Schema migrated
- Balance rules preserved
- Transaction-safe writes implemented
- Ledger views integrated
- Print enabled
- WhatsApp share enabled
- Dashboard cards connected
- Route guards and permissions applied
- Data backup strategy confirmed

---

## Notes

- All monetary figures are currently handled as REAL in SQLite.
- For strict accounting precision, consider using integer minor units (for example paisa/cents) in your POS-wide model.
- Existing styling is neutral and can be adapted to your current POS theme without changing core logic.
