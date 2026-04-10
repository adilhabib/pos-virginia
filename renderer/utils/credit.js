(function () {
  const { assertOk } = window.POSUtils.db;

  async function listCustomers() {
    return assertOk(await window.posAPI.listCreditCustomers()).customers;
  }

  async function getCustomer(customerId) {
    return assertOk(await window.posAPI.getCreditCustomer({ customerId })).customer;
  }

  async function createCustomer(userId, data) {
    return assertOk(await window.posAPI.createCreditCustomer({ userId, ...data }));
  }

  async function updateCustomer(userId, customerId, data) {
    return assertOk(await window.posAPI.updateCreditCustomer({ userId, customerId, ...data }));
  }

  async function deleteCustomer(userId, customerId) {
    return assertOk(await window.posAPI.deleteCreditCustomer({ userId, customerId }));
  }

  async function listSales() {
    return assertOk(await window.posAPI.listCreditSales()).sales;
  }

  async function listSalesByCustomer(customerId) {
    return assertOk(await window.posAPI.listCreditSalesByCustomer({ customerId })).sales;
  }

  async function createSale(userId, data) {
    return assertOk(await window.posAPI.createCreditSale({ userId, ...data }));
  }

  async function listPayments() {
    return assertOk(await window.posAPI.listCreditPayments()).payments;
  }

  async function listPaymentsByCustomer(customerId) {
    return assertOk(await window.posAPI.listCreditPaymentsByCustomer({ customerId })).payments;
  }

  async function createPayment(userId, data) {
    return assertOk(await window.posAPI.createCreditPayment({ userId, ...data }));
  }

  async function getCustomerLedger(customerId) {
    return assertOk(await window.posAPI.getCreditCustomerLedger({ customerId }));
  }

  async function listVendors() {
    return assertOk(await window.posAPI.listCreditVendors()).vendors;
  }

  async function getVendor(vendorId) {
    return assertOk(await window.posAPI.getCreditVendor({ vendorId })).vendor;
  }

  async function createVendor(userId, data) {
    return assertOk(await window.posAPI.createCreditVendor({ userId, ...data }));
  }

  async function updateVendor(userId, vendorId, data) {
    return assertOk(await window.posAPI.updateCreditVendor({ userId, vendorId, ...data }));
  }

  async function deleteVendor(userId, vendorId) {
    return assertOk(await window.posAPI.deleteCreditVendor({ userId, vendorId }));
  }

  async function listPurchases() {
    return assertOk(await window.posAPI.listCreditPurchases()).purchases;
  }

  async function listPurchasesByVendor(vendorId) {
    return assertOk(await window.posAPI.listCreditPurchasesByVendor({ vendorId })).purchases;
  }

  async function createPurchase(userId, data) {
    return assertOk(await window.posAPI.createCreditPurchase({ userId, ...data }));
  }

  async function listVendorPayments() {
    return assertOk(await window.posAPI.listCreditVendorPayments()).payments;
  }

  async function listVendorPaymentsByVendor(vendorId) {
    return assertOk(await window.posAPI.listCreditVendorPaymentsByVendor({ vendorId })).payments;
  }

  async function createVendorPayment(userId, data) {
    return assertOk(await window.posAPI.createCreditVendorPayment({ userId, ...data }));
  }

  async function getVendorLedger(vendorId) {
    return assertOk(await window.posAPI.getCreditVendorLedger({ vendorId }));
  }

  async function getDashboardStats() {
    return assertOk(await window.posAPI.getCreditDashboardStats()).stats;
  }

  async function openExternal(url) {
    return assertOk(await window.posAPI.openExternal({ url }));
  }

  window.POSUtils = window.POSUtils || {};
  window.POSUtils.credit = {
    listCustomers,
    getCustomer,
    createCustomer,
    updateCustomer,
    deleteCustomer,
    listSales,
    listSalesByCustomer,
    createSale,
    listPayments,
    listPaymentsByCustomer,
    createPayment,
    getCustomerLedger,
    listVendors,
    getVendor,
    createVendor,
    updateVendor,
    deleteVendor,
    listPurchases,
    listPurchasesByVendor,
    createPurchase,
    listVendorPayments,
    listVendorPaymentsByVendor,
    createVendorPayment,
    getVendorLedger,
    getDashboardStats,
    openExternal
  };
})();
