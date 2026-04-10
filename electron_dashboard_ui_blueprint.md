# Electron Dashboard UI Blueprint

## Folder Structure

renderer/
├── components/
│   ├── Sidebar.jsx
│   ├── Topbar.jsx
│   ├── KPICards.jsx
│   ├── SalesChart.jsx
│   ├── TopItems.jsx
│   ├── CreditPanel.jsx
│   ├── ActivityPanel.jsx
│
├── pages/
│   └── Dashboard.jsx
│
├── layouts/
│   └── MainLayout.jsx
│
├── data/
│   └── dummyData.js

---

## Components Overview

### Sidebar.jsx
Navigation with active states and hover effects.

### Topbar.jsx
Search, filters, and date display.

### KPICards.jsx
Displays:
- Daily Sales
- Monthly Sales
- Customer Credit
- Vendor Payables

### SalesChart.jsx
Line chart showing sales trends.

### TopItems.jsx
Top-selling items with progress bars.

### CreditPanel.jsx
Comparison of credit vs payables.

### ActivityPanel.jsx
Recent activity logs.

---

## Dashboard Layout

KPI Cards (Top)

Sales Chart (Left) | Top Items (Right)

Credit Panel (Left) | Activity Panel (Right)

---

## Styling

- TailwindCSS
- bg-gray-100 (background)
- bg-white rounded-2xl shadow (cards)

---

## Future Additions

- Credit register system
- Customer ledger
- Reports export
