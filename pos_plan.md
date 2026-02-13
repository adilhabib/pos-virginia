# Fast-Food POS – Developer Scaffold Specification

## 1. Project Overview

**Project Name:** FastFood POS  
**Platform:** Windows Desktop (Offline)  
**Deployment:** Single Outlet, Internal Use  
**Primary Transactions:** Cash-heavy  

**Goal:**  
Build a fast, reliable POS system with:
- Order management  
- Ingredient-level inventory  
- Cash sessions & reconciliation  
- Reports & audit logs  
- Role-based security  

---

## 2. Folder Structure & Module Responsibilities

```
fastfood-pos/
│
├── README.md
├── package.json                  # Project dependencies and scripts
├── main.js                       # Electron main process entry
├── preload.js                    # Electron preload scripts (Node APIs)
│
├── database/
│   ├── pos.db                     # SQLite database file
│   ├── schema.sql                 # SQL schema for tables
│   └── seed_data.sql              # Optional seed data for testing
│
├── renderer/                      # Frontend (React) or WPF components
│   ├── index.html
│   ├── App.jsx                    # Main App container
│   ├── styles/
│   │   └── main.css               # Global styles
│   ├── components/                # UI Screens
│   │   ├── Login.jsx               # PIN-based login screen
│   │   ├── OrderScreen.jsx         # Menu and order creation
│   │   ├── Checkout.jsx            # Payment & receipt screen
│   │   ├── Inventory.jsx           # Inventory dashboard
│   │   ├── CashSession.jsx         # Open/Close shift
│   │   └── Reports.jsx             # Sales, inventory, cash reports
│   │
│   └── utils/                     # Modules for business logic
│       ├── db.js                   # SQLite database wrapper
│       ├── orders.js               # Order logic (add, cancel, finalize)
│       ├── inventory.js            # Inventory logic (deduct, adjust, alerts)
│       └── cash.js                 # Cash handling logic (sessions, transactions)
│
├── assets/
│   ├── logo.png
│   └── icons/                      # Menu icons / category icons
│
└── backup/
    └── daily_backups/              # Optional automated SQLite backups
```

---

## 3. Module Responsibilities

### 3.1 Main Application (`main.js`)
- Launch Electron window
- Load frontend
- Handle app lifecycle

### 3.2 Preload (`preload.js`)
- Expose Node APIs safely to the renderer
- Allow database & file access

### 3.3 Database (`database/`)
- `pos.db`: SQLite database for offline storage
- `schema.sql`: Table definitions  
- `seed_data.sql`: Optional sample menu, ingredients, and users

### 3.4 Frontend (`renderer/`)
- `App.jsx`: Routes / navigation between screens  
- Components: UI screens for login, orders, checkout, inventory, cash sessions, reports  
- Styles: Global and component-specific CSS

### 3.5 Business Logic (`renderer/utils/`)
- `db.js`: Connect to SQLite, run queries  
- `orders.js`: Handle order creation, item management, status updates  
- `inventory.js`: Deduct ingredient stock, manual adjustments, low-stock alerts  
- `cash.js`: Open/close cash session, track transactions, reconcile cash

---

## 4. Core Screens & Responsibilities

| Screen | Purpose |
|--------|---------|
| **Login** | PIN-based authentication, role determines access |
| **OrderScreen** | Menu selection, modifiers, order notes, hold/cancel/merge orders |
| **Checkout** | Cash payment, change calculation, receipt printing |
| **Inventory** | Stock levels, adjustments, low-stock alerts, supplier info |
| **CashSession** | Start/end shift, cash in/out, reconciliation, logging |
| **Reports** | Sales, inventory usage, cash summary, audit logs |

---

## 5. Suggested Database Tables (Conceptual)

- `users` – ID, username, PIN hash, role  
- `roles` – Name, permissions  
- `menu_items` – Name, price, active  
- `ingredients` – Name, unit, stock  
- `recipes` – Menu item → ingredient mapping  
- `orders` – Order metadata (status, total, cashier)  
- `order_items` – Items in each order  
- `inventory_movements` – Ingredient adjustments with reason  
- `cash_sessions` – Shift start/end cash  
- `cash_transactions` – Individual inflows/outflows  
- `audit_logs` – User actions & timestamps

---

## 6. Workflow Overview

### 6.1 Order Flow
1. Cashier logs in.
2. Create new order → select items → add modifiers.
3. Finalize order → deduct ingredient stock automatically.
4. Checkout → accept cash → calculate change → print receipt.
5. Send KOT (Kitchen Order Ticket) to kitchen printer.

### 6.2 Inventory Flow
- Deduct ingredients automatically per order.  
- Manual adjustments for wastage or spoilage.  
- Low-stock alerts trigger UI notifications.  
- Purchase entries update stock.

### 6.3 Cash Flow
- Start shift → record opening cash.  
- Record cash in/out for expenses.  
- Close shift → reconcile expected vs actual cash.  
- Audit logs track discrepancies.

### 6.4 Reporting Flow
- Generate daily/weekly/monthly reports: sales, inventory, cash.  
- Audit log report for management review.  
- Export as PDF/CSV.

---

## 7. Hardware Integration

- **Thermal Printer:** Print receipts & KOT  
- **Cash Drawer:** Open automatically on cash payment  
- **Barcode Scanner:** Optional, for inventory  
- **Customer Display:** Optional

---

## 8. Development Roadmap

| Phase | Features |
|-------|----------|
| Phase 1 | Core POS: Orders, Checkout, Receipt, Ingredient Stock |
| Phase 2 | Cash Sessions, Inventory Management, Role-Based Access |
| Phase 3 | Reports, Audit Logs, UI Optimization, Backup System |

---

## 9. Notes for Developers

- Offline-first: all data stored locally in SQLite.  
- Ingredient-based inventory for accurate cost tracking.  
- Role-based access and audit logs for accountability.  
- Backup strategy: daily SQLite export to USB or local folder.  
- Simple, fast-touch or keyboard-optimized UI for high-volume operations.

