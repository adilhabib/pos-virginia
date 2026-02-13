(function () {
  const { assertOk } = window.POSUtils.db;

  async function listIngredients() {
    return assertOk(await window.posAPI.listInventory()).ingredients;
  }

  async function adjustIngredient(ingredientId, qty, reason, userId) {
    return assertOk(await window.posAPI.adjustInventory({ ingredientId, qty, reason, userId }));
  }

  async function purchaseIngredient(ingredientId, qty, supplierRef, userId) {
    return assertOk(await window.posAPI.purchaseInventory({ ingredientId, qty, supplierRef, userId }));
  }

  async function createIngredient(userId, data) {
    return assertOk(await window.posAPI.createIngredient({ userId, ...data }));
  }

  async function updateIngredient(userId, ingredientId, data) {
    return assertOk(await window.posAPI.updateIngredient({ userId, ingredientId, ...data }));
  }

  window.POSUtils = window.POSUtils || {};
  window.POSUtils.inventory = {
    listIngredients,
    adjustIngredient,
    purchaseIngredient,
    createIngredient,
    updateIngredient
  };
})();
