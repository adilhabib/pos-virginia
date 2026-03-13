(function () {
  const { assertOk } = window.POSUtils.db;

  async function listMenu(userId, includeInactive = false) {
    return assertOk(await window.posAPI.listMenu({ userId, includeInactive })).items;
  }

  async function createMenuItem(userId, data) {
    return assertOk(await window.posAPI.createMenuItem({ userId, ...data }));
  }

  async function listPromotions() {
    return assertOk(await window.posAPI.listPromotions()).promotions;
  }

  async function createPromotion(userId, data) {
    return assertOk(await window.posAPI.createPromotion({ userId, ...data }));
  }

  async function updatePromotion(userId, promotionId, data) {
    return assertOk(await window.posAPI.updatePromotion({ userId, promotionId, ...data }));
  }

  async function updateMenuItem(userId, menuItemId, data) {
    return assertOk(await window.posAPI.updateMenuItem({ userId, menuItemId, ...data }));
  }

  async function createOrder(cashierUserId, notes = "") {
    const resp = assertOk(await window.posAPI.createOrder({ cashierUserId, notes }));
    return resp.orderId;
  }

  async function listOpenOrders(cashierUserId = null) {
    const resp = assertOk(await window.posAPI.listOpenOrders({ cashierUserId }));
    return resp.orders;
  }

  async function getOrder(orderId) {
    const resp = assertOk(await window.posAPI.getOrder({ orderId }));
    return resp;
  }

  async function getOrderPayments(orderId) {
    return assertOk(await window.posAPI.getOrderPayments({ orderId }));
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

  async function applyOrderPromo(orderId, promoCode, userId) {
    return assertOk(await window.posAPI.applyOrderPromo({ orderId, promoCode, userId }));
  }

  async function clearOrderPromo(orderId, userId) {
    return assertOk(await window.posAPI.clearOrderPromo({ orderId, userId }));
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

  async function addOrderPayment(orderId, method, amountCents, receivedCents, userId) {
    return assertOk(await window.posAPI.addOrderPayment({ orderId, method, amountCents, receivedCents, userId }));
  }

  async function printReceipt(orderId) {
    return assertOk(await window.posAPI.printReceipt({ orderId }));
  }


  window.POSUtils = window.POSUtils || {};
  window.POSUtils.orders = {
    listMenu,
    createMenuItem,
    updateMenuItem,
    listPromotions,
    createPromotion,
    updatePromotion,
    createOrder,
    listOpenOrders,
    getOrder,
    getOrderPayments,
    addOrderItem,
    updateOrderItemQty,
    updateOrderCustomer,
    updateOrderDiscount,
    applyOrderPromo,
    clearOrderPromo,
    setOrderStatus,
    payOrderCash,
    addOrderPayment,
    printReceipt,
  };
})();
