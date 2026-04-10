const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("posAPI", {
  login: (payload) => ipcRenderer.invoke("auth:login", payload),
  listMenu: (payload) => ipcRenderer.invoke("menu:list", payload),
  createMenuItem: (payload) => ipcRenderer.invoke("menu:create", payload),
  updateMenuItem: (payload) => ipcRenderer.invoke("menu:update", payload),
  listPromotions: () => ipcRenderer.invoke("promotions:list"),
  createPromotion: (payload) => ipcRenderer.invoke("promotions:create", payload),
  updatePromotion: (payload) => ipcRenderer.invoke("promotions:update", payload),

  createOrder: (payload) => ipcRenderer.invoke("orders:create", payload),
  listOpenOrders: (payload) => ipcRenderer.invoke("orders:list-open", payload),
  getOrder: (payload) => ipcRenderer.invoke("orders:get", payload),
  getOrderPayments: (payload) => ipcRenderer.invoke("orders:get-payments", payload),
  addOrderItem: (payload) => ipcRenderer.invoke("orders:add-item", payload),
  updateOrderItemQty: (payload) => ipcRenderer.invoke("orders:update-item-qty", payload),
  updateOrderCustomer: (payload) => ipcRenderer.invoke("orders:update-customer", payload),
  updateOrderDiscount: (payload) => ipcRenderer.invoke("orders:update-discount", payload),
  applyOrderPromo: (payload) => ipcRenderer.invoke("orders:apply-promo", payload),
  clearOrderPromo: (payload) => ipcRenderer.invoke("orders:clear-promo", payload),
  updateOrderStatus: (payload) => ipcRenderer.invoke("orders:update-status", payload),
  addOrderPayment: (payload) => ipcRenderer.invoke("orders:add-payment", payload),
  payOrderCash: (payload) => ipcRenderer.invoke("orders:pay-cash", payload),

  listInventory: () => ipcRenderer.invoke("inventory:list"),
  adjustInventory: (payload) => ipcRenderer.invoke("inventory:adjust", payload),
  purchaseInventory: (payload) => ipcRenderer.invoke("inventory:purchase", payload),
  createIngredient: (payload) => ipcRenderer.invoke("inventory:create-ingredient", payload),
  updateIngredient: (payload) => ipcRenderer.invoke("inventory:update-ingredient", payload),
  createPurchaseOrder: (payload) => ipcRenderer.invoke("procurement:create-po", payload),
  listPurchaseOrders: (payload) => ipcRenderer.invoke("procurement:list-po", payload),
  getPurchaseOrder: (payload) => ipcRenderer.invoke("procurement:get-po", payload),
  receivePurchaseOrder: (payload) => ipcRenderer.invoke("procurement:receive-po", payload),

  openCashSession: (payload) => ipcRenderer.invoke("cash:open-session", payload),
  getOpenCashSession: () => ipcRenderer.invoke("cash:get-open-session"),
  addCashTransaction: (payload) => ipcRenderer.invoke("cash:add-transaction", payload),
  closeCashSession: (payload) => ipcRenderer.invoke("cash:close-session", payload),

  listEmployees: (payload) => ipcRenderer.invoke("employee:list", payload),
  createEmployee: (payload) => ipcRenderer.invoke("employee:create", payload),
  updateEmployee: (payload) => ipcRenderer.invoke("employee:update", payload),
  addEmployeeLedgerEntry: (payload) => ipcRenderer.invoke("employee:add-ledger-entry", payload),
  getEmployeeLedger: (payload) => ipcRenderer.invoke("employee:get-ledger", payload),
  exportEmployeeLedgerCsv: (payload) => ipcRenderer.invoke("employee:export-ledger-csv", payload),
  deleteEmployeeLedgerEntry: (payload) => ipcRenderer.invoke("employee:delete-ledger-entry", payload),
  closeEmployeeCurrentMonth: (payload) => ipcRenderer.invoke("employee:close-current-month", payload),

  listCreditCustomers: () => ipcRenderer.invoke("credit:customers:list"),
  getCreditCustomer: (payload) => ipcRenderer.invoke("credit:customers:get", payload),
  createCreditCustomer: (payload) => ipcRenderer.invoke("credit:customers:create", payload),
  updateCreditCustomer: (payload) => ipcRenderer.invoke("credit:customers:update", payload),
  deleteCreditCustomer: (payload) => ipcRenderer.invoke("credit:customers:delete", payload),

  listCreditSales: () => ipcRenderer.invoke("credit:sales:list"),
  listCreditSalesByCustomer: (payload) => ipcRenderer.invoke("credit:sales:by-customer", payload),
  createCreditSale: (payload) => ipcRenderer.invoke("credit:sales:create", payload),

  listCreditPayments: () => ipcRenderer.invoke("credit:payments:list"),
  listCreditPaymentsByCustomer: (payload) => ipcRenderer.invoke("credit:payments:by-customer", payload),
  createCreditPayment: (payload) => ipcRenderer.invoke("credit:payments:create", payload),
  getCreditCustomerLedger: (payload) => ipcRenderer.invoke("credit:ledger:customer", payload),

  listCreditVendors: () => ipcRenderer.invoke("credit:vendors:list"),
  getCreditVendor: (payload) => ipcRenderer.invoke("credit:vendors:get", payload),
  createCreditVendor: (payload) => ipcRenderer.invoke("credit:vendors:create", payload),
  updateCreditVendor: (payload) => ipcRenderer.invoke("credit:vendors:update", payload),
  deleteCreditVendor: (payload) => ipcRenderer.invoke("credit:vendors:delete", payload),

  listCreditPurchases: () => ipcRenderer.invoke("credit:purchases:list"),
  listCreditPurchasesByVendor: (payload) => ipcRenderer.invoke("credit:purchases:by-vendor", payload),
  createCreditPurchase: (payload) => ipcRenderer.invoke("credit:purchases:create", payload),

  listCreditVendorPayments: () => ipcRenderer.invoke("credit:vendor-payments:list"),
  listCreditVendorPaymentsByVendor: (payload) => ipcRenderer.invoke("credit:vendor-payments:by-vendor", payload),
  createCreditVendorPayment: (payload) => ipcRenderer.invoke("credit:vendor-payments:create", payload),
  getCreditVendorLedger: (payload) => ipcRenderer.invoke("credit:ledger:vendor", payload),

  getCreditDashboardStats: () => ipcRenderer.invoke("credit:dashboard:stats"),


  getReportSummary: (payload) => ipcRenderer.invoke("reports:summary", payload),
  getProcurementReport: () => ipcRenderer.invoke("reports:procurement"),
  getDailyRegister: () => ipcRenderer.invoke("reports:daily-register"),
  exportReportCsv: (payload) => ipcRenderer.invoke("reports:export-csv", payload),

  printReceipt: (payload) => ipcRenderer.invoke("system:print-receipt", payload),
  openCashDrawer: () => ipcRenderer.invoke("system:open-cash-drawer"),
  openExternal: (payload) => ipcRenderer.invoke("system:open-external", payload),
  createBackup: (payload) => ipcRenderer.invoke("system:create-backup", payload),
  listBackups: () => ipcRenderer.invoke("system:list-backups"),
  restoreBackup: (payload) => ipcRenderer.invoke("system:restore-backup", payload),
  getSupabaseStatus: () => ipcRenderer.invoke("system:supabase-status")
});
