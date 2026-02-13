(function () {
  const pkrFormatter = new Intl.NumberFormat("en-PK", {
    style: "currency",
    currency: "PKR",
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

  const money = (cents) => pkrFormatter.format(Number(cents || 0) / 100);

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
