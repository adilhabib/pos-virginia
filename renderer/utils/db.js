(function () {
  const money = (cents) => `$${(Number(cents || 0) / 100).toFixed(2)}`;

  function assertOk(resp) {
    if (!resp || resp.ok !== true) {
      throw new Error(resp?.error || "Unexpected POS API error.");
    }
    return resp;
  }

  async function login(username, pin) {
    return assertOk(await window.posAPI.login({ username, pin })).user;
  }

  window.POSUtils = window.POSUtils || {};
  window.POSUtils.db = {
    money,
    assertOk,
    login
  };
})();
