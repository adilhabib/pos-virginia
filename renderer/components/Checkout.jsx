(function () {
  const { useEffect, useMemo, useState } = React;
  const { money } = window.POSUtils.db;

  function Checkout({ user, selectedOrder, onPaid }) {
    const [received, setReceived] = useState("");
    const [message, setMessage] = useState("");
    const [error, setError] = useState("");
    const [processing, setProcessing] = useState(false);

    const [orderData, setOrderData] = useState(selectedOrder || null);

    useEffect(() => {
      setOrderData(selectedOrder || null);
    }, [selectedOrder]);

    const order = orderData?.order;
    const items = orderData?.items || [];
    const subtotal = order?.subtotal_cents || 0;
    const discountCents = order?.discount_cents || 0;
    const orderTotal = Math.max(0, order?.total_cents || 0);
    const payable = orderTotal;
    const receivedCents = useMemo(() => Math.round(Number(received || 0) * 100), [received]);
    const changeCents = Math.max(0, receivedCents - payable);

    async function refreshOrder() {
      if (!order?.id) return;
      const refreshed = await window.POSUtils.orders.getOrder(order.id);
      setOrderData({ order: refreshed.order, items: refreshed.items });
      return refreshed;
    }

    async function removeItem(item) {
      if (!order?.id) return;
      try {
        await window.POSUtils.orders.updateOrderItemQty(order.id, item.id, 0);
        await refreshOrder();
      } catch (err) {
        setError(err.message || "Unable to remove item.");
      }
    }

    async function cancelOrder() {
      if (!order?.id) return;
      setError("");
      try {
        await window.POSUtils.orders.setOrderStatus(order.id, "CANCELLED", user.id);
        setMessage("Order cancelled.");
        setOrderData(null);
      } catch (err) {
        setError(err.message || "Unable to cancel order.");
      }
    }

    async function payNow() {
      if (!order?.id) return;
      setError("");
      setMessage("");
      setProcessing(true);
      try {
        if (receivedCents < orderTotal) throw new Error("Received cash is less than total.");

        if (order.status !== "FINALIZED") {
          await window.POSUtils.orders.setOrderStatus(order.id, "FINALIZED", user.id);
        }
        const payment = await window.POSUtils.orders.payOrderCash(order.id, receivedCents, user.id);
        await window.posAPI.openCashDrawer();
        setMessage(
          payment.receiptPath
            ? `Paid. Change: ${money(changeCents)}. Receipt saved: ${payment.receiptPath}`
            : `Paid. Change: ${money(changeCents)}.`
        );
        onPaid();
      } catch (err) {
        setError(err.message || "Payment failed.");
      } finally {
        setProcessing(false);
      }
    }

    return (
      <div className="payment-replica-layout">
        {!order ? (
          <div className="card"><p className="muted">No active order. Create one in MENU.</p></div>
        ) : (
          <>
            <section className="pay-left">
              <div className="pay-order-head">
                <h2>ORDER #: {order.id}</h2>
                <div className="meta">TABLE: <b>1</b> <span>TIME: <b>{new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</b></span></div>
              </div>

              <div className="pay-table-wrap">
                <table className="pay-table">
                  <thead>
                    <tr><th>ITEM</th><th>PRICE</th><th>QTY</th><th>SUBTOTAL</th><th></th></tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr key={item.id}>
                        <td>{item.item_name}</td>
                        <td>{money(item.unit_price_cents)}</td>
                        <td>{item.quantity}</td>
                        <td>{money(item.line_total_cents)}</td>
                        <td><button className="trash-btn" onClick={() => removeItem(item)}>Del</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <button className="cancel-wide" onClick={cancelOrder}>
                CANCEL ORDER
              </button>
            </section>

            <aside className="pay-right">
              <div className="payable-head">
                <h3>PAYABLE AMOUNT</h3>
                <div className="amount">{money(payable)}</div>
                <div className="guest">GUEST: <b>2</b></div>
              </div>

              <div className="pay-methods">
                <button className="method active">CASH</button>
                <button className="method" disabled>CARD</button>
                <button className="method" disabled>VOUCHER</button>
              </div>

              <div className="cash-box">
                <span>ADD CASH RECEIVED</span>
                <input value={received} onChange={(e) => setReceived(e.target.value)} />
              </div>

              <div className="pay-lines">
                <div><span>SUBTOTAL</span><b>{money(subtotal)}</b></div>
                <div><span>DISCOUNT</span><b>{money(discountCents)}</b></div>
              </div>

              <div className="pay-total">
                <span>TOTAL</span><b>{money(payable)}</b>
              </div>
              <div className="pay-total pay-change">
                <span>CHANGE</span><b>{money(changeCents)}</b>
              </div>

              <button className="pay-now" disabled={processing || receivedCents < payable} onClick={payNow}>
                {processing ? "PROCESSING..." : "PAY NOW"}
              </button>

              {message && <div className="success">{message}</div>}
              {error && <div className="error">{error}</div>}
            </aside>
          </>
        )}
      </div>
    );
  }

  window.POSComponents = window.POSComponents || {};
  window.POSComponents.Checkout = Checkout;
})();

