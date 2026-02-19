(function () {
  const { assertOk } = window.POSUtils.db;

  async function listTickets(statuses = ["QUEUED", "PREPARING", "READY"]) {
    return assertOk(await window.posAPI.listKitchenTickets({ statuses })).tickets;
  }

  async function updateTicketStatus(ticketId, status, userId) {
    return assertOk(await window.posAPI.updateKitchenTicketStatus({ ticketId, status, userId }));
  }

  async function bumpTicket(ticketId, userId) {
    return assertOk(await window.posAPI.bumpKitchenTicket({ ticketId, userId }));
  }

  window.POSUtils = window.POSUtils || {};
  window.POSUtils.kds = { listTickets, updateTicketStatus, bumpTicket };
})();

