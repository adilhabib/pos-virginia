const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("posAPI", {
  login: (payload) => ipcRenderer.invoke("auth:login", payload),
  listMenu: (payload) => ipcRenderer.invoke("menu:list", payload),
  createMenuItem: (payload) => ipcRenderer.invoke("menu:create", payload),
  updateMenuItem: (payload) => ipcRenderer.invoke("menu:update", payload),

  createOrder: (payload) => ipcRenderer.invoke("orders:create", payload),
  getOrder: (payload) => ipcRenderer.invoke("orders:get", payload),
  addOrderItem: (payload) => ipcRenderer.invoke("orders:add-item", payload),
  updateOrderItemQty: (payload) => ipcRenderer.invoke("orders:update-item-qty", payload),
  updateOrderCustomer: (payload) => ipcRenderer.invoke("orders:update-customer", payload),
  updateOrderDiscount: (payload) => ipcRenderer.invoke("orders:update-discount", payload),
  updateOrderStatus: (payload) => ipcRenderer.invoke("orders:update-status", payload),
  payOrderCash: (payload) => ipcRenderer.invoke("orders:pay-cash", payload),

  listInventory: () => ipcRenderer.invoke("inventory:list"),
  adjustInventory: (payload) => ipcRenderer.invoke("inventory:adjust", payload),
  purchaseInventory: (payload) => ipcRenderer.invoke("inventory:purchase", payload),
  createIngredient: (payload) => ipcRenderer.invoke("inventory:create-ingredient", payload),
  updateIngredient: (payload) => ipcRenderer.invoke("inventory:update-ingredient", payload),

  openCashSession: (payload) => ipcRenderer.invoke("cash:open-session", payload),
  getOpenCashSession: () => ipcRenderer.invoke("cash:get-open-session"),
  addCashTransaction: (payload) => ipcRenderer.invoke("cash:add-transaction", payload),
  closeCashSession: (payload) => ipcRenderer.invoke("cash:close-session", payload),

  getReportSummary: (payload) => ipcRenderer.invoke("reports:summary", payload),
  getDailyRegister: () => ipcRenderer.invoke("reports:daily-register"),
  exportReportCsv: (payload) => ipcRenderer.invoke("reports:export-csv", payload),

  printReceipt: (payload) => ipcRenderer.invoke("system:print-receipt", payload),
  sendKot: (payload) => ipcRenderer.invoke("system:send-kot", payload),
  openCashDrawer: () => ipcRenderer.invoke("system:open-cash-drawer"),
  getSupabaseStatus: () => ipcRenderer.invoke("system:supabase-status")
});
