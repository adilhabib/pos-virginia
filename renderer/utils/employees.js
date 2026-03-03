(function () {
  const { assertOk } = window.POSUtils.db;

  async function listEmployees(userId, includeInactive = true) {
    const resp = await window.posAPI.listEmployees({ userId, includeInactive });
    return assertOk(resp).employees;
  }

  async function createEmployee(userId, data) {
    return assertOk(await window.posAPI.createEmployee({ userId, ...data }));
  }

  async function updateEmployee(userId, employeeId, data) {
    return assertOk(await window.posAPI.updateEmployee({ userId, employeeId, ...data }));
  }

  async function addLedgerEntry(userId, employeeId, entryType, amountCents, notes = "") {
    return assertOk(await window.posAPI.addEmployeeLedgerEntry({ userId, employeeId, entryType, amountCents, notes }));
  }

  async function getLedger(userId, employeeId, fromDate = "", toDate = "") {
    return assertOk(await window.posAPI.getEmployeeLedger({ userId, employeeId, fromDate, toDate }));
  }

  async function exportLedgerCsv(userId, employeeId, fromDate = "", toDate = "") {
    return assertOk(await window.posAPI.exportEmployeeLedgerCsv({ userId, employeeId, fromDate, toDate }));
  }

  async function deleteLedgerEntry(userId, entryId) {
    return assertOk(await window.posAPI.deleteEmployeeLedgerEntry({ userId, entryId }));
  }

  async function closeCurrentMonth(userId, employeeId, notes = "") {
    return assertOk(await window.posAPI.closeEmployeeCurrentMonth({ userId, employeeId, notes }));
  }

  window.POSUtils = window.POSUtils || {};
  window.POSUtils.employees = {
    listEmployees,
    createEmployee,
    updateEmployee,
    addLedgerEntry,
    getLedger,
    exportLedgerCsv,
    deleteLedgerEntry,
    closeCurrentMonth
  };
})();
