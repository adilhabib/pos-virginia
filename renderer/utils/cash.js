(function () {
  const { assertOk } = window.POSUtils.db;

  async function openSession(userId, openingCents) {
    return assertOk(await window.posAPI.openCashSession({ userId, openingCents }));
  }

  async function getOpenSession() {
    return assertOk(await window.posAPI.getOpenCashSession());
  }

  async function addTransaction(sessionId, type, amountCents, reason, userId) {
    return assertOk(await window.posAPI.addCashTransaction({ sessionId, type, amountCents, reason, userId }));
  }

  async function closeSession(sessionId, userId, actualClosingCents) {
    return assertOk(await window.posAPI.closeCashSession({ sessionId, userId, actualClosingCents }));
  }

  window.POSUtils = window.POSUtils || {};
  window.POSUtils.cash = {
    openSession,
    getOpenSession,
    addTransaction,
    closeSession
  };
})();
