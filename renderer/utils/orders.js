(function () {
  const { assertOk } = window.POSUtils.db;

  async function listMenu(userId, includeInactive = false) {
    return assertOk(await window.posAPI.listMenu({ userId, includeInactive })).items;
  }

  async function createMenuItem(userId, data) {
    return assertOk(await window.posAPI.createMenuItem({ userId, ...data }));
  }

  async function updateMenuItem(userId, menuItemId, data) {
    return assertOk(await window.posAPI.updateMenuItem({ userId, menuItemId, ...data }));
  }

  async function createOrder(cashierUserId, notes = "") {
    const resp = assertOk(await window.posAPI.createOrder({ cashierUserId, notes }));
    return resp.orderId;
  }

  async function getOrder(orderId) {
    const resp = assertOk(await window.posAPI.getOrder({ orderId }));
    return resp;
  }

  async function addOrderItem(orderId, menuItemId, quantity = 1, modifiers = null) {
    return assertOk(await window.posAPI.addOrderItem({ orderId, menuItemId, quantity, modifiers }));
  }

  async function updateOrderItemQty(orderId, orderItemId, quantity) {
    return assertOk(await window.posAPI.updateOrderItemQty({ orderId, orderItemId, quantity }));
  }

  async function updateOrderCustomer(orderId, customerName, customerPhone, userId) {
    return assertOk(await window.posAPI.updateOrderCustomer({ orderId, customerName, customerPhone, userId }));
  }

  async function updateOrderDiscount(orderId, discountCents, userId) {
    return assertOk(await window.posAPI.updateOrderDiscount({ orderId, discountCents, userId }));
  }

  async function setOrderStatus(orderId, status, userId) {
    const resp = await window.posAPI.updateOrderStatus({ orderId, status, userId });
    if (!resp.ok) {
      const err = new Error(resp.error || "Failed to update order status.");
      if (resp.shortages) err.shortages = resp.shortages;
      throw err;
    }
    return resp;
  }

  async function payOrderCash(orderId, receivedCents, userId) {
    return assertOk(await window.posAPI.payOrderCash({ orderId, receivedCents, userId }));
  }

  async function printReceipt(orderId) {
    return assertOk(await window.posAPI.printReceipt({ orderId }));
  }

  async function sendKot(orderId) {
    return assertOk(await window.posAPI.sendKot({ orderId }));
  }

  window.POSUtils = window.POSUtils || {};
  window.POSUtils.orders = {
    listMenu,
    createMenuItem,
    updateMenuItem,
    createOrder,
    getOrder,
    addOrderItem,
    updateOrderItemQty,
    updateOrderCustomer,
    updateOrderDiscount,
    setOrderStatus,
    payOrderCash,
    printReceipt,
    sendKot
  };
})();
