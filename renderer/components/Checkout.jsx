(function () {
  const { useEffect, useMemo, useState } = React;
  const { money } = window.POSUtils.db;

  function Checkout({ user, selectedOrder, onPaid }) {
    const [method, setMethod] = useState("CASH");
    const [amount, setAmount] = useState("");
    const [received, setReceived] = useState("");
    const [payments, setPayments] = useState([]);
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
    const paidCents = useMemo(
      () => (payments || []).reduce((acc, p) => acc + Number(p.amount_cents || 0), 0),
      [payments]
    );
    const remainingCents = Math.max(0, payable - paidCents);
    const amountCents = useMemo(() => Math.round(Number(amount || 0) * 100), [amount]);
    const appliedAmountCents = Math.min(Math.max(0, amountCents), remainingCents);
    const receivedCents = useMemo(() => Math.round(Number(received || 0) * 100), [received]);
    const changeCents = method === "CASH" ? Math.max(0, receivedCents - appliedAmountCents) : 0;

    async function refreshOrder() {
      if (!order?.id) return;
      const refreshed = await window.POSUtils.orders.getOrder(order.id);
      setOrderData({ order: refreshed.order, items: refreshed.items });
      return refreshed;
    }

    async function refreshPayments() {
      if (!order?.id) return;
      const paymentResp = await window.POSUtils.orders.getOrderPayments(order.id);
      setPayments(paymentResp.payments || []);
      setAmount((paymentResp.remainingCents / 100).toFixed(2));
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
        if (appliedAmountCents <= 0) throw new Error("Enter a valid payment amount.");
        if (method === "CASH" && receivedCents < appliedAmountCents) {
          throw new Error("Received cash is less than payment amount.");
        }

        if (order.status !== "FINALIZED") {
          await window.POSUtils.orders.setOrderStatus(order.id, "FINALIZED", user.id);
        }
        const payment = await window.POSUtils.orders.addOrderPayment(
          order.id,
          method,
          appliedAmountCents,
          method === "CASH" ? receivedCents : null,
          user.id
        );
        if (method === "CASH") {
          await window.posAPI.openCashDrawer();
        }

        await refreshOrder();
        await refreshPayments();
        setReceived("");

        setMessage(
          payment.receiptPath
            ? `Order paid. Receipt saved: ${payment.receiptPath}`
            : `Payment added. Remaining: ${money(payment.remainingCents)}.`
        );
        if (payment.isPaid) {
          onPaid();
        }
      } catch (err) {
        setError(err.message || "Payment failed.");
      } finally {
        setProcessing(false);
      }
    }

    useEffect(() => {
      if (!order?.id) {
        setPayments([]);
        setAmount("");
        setReceived("");
        return;
      }
      refreshPayments().catch((err) => setError(err.message || "Unable to load payments."));
    }, [order?.id]);

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
                <div className="guest">PAID: <b>{money(paidCents)}</b> | DUE: <b>{money(remainingCents)}</b></div>
              </div>

              <div className="pay-methods">
                <button className={method === "CASH" ? "method active" : "method"} onClick={() => setMethod("CASH")}>CASH</button>
                <button className={method === "CARD" ? "method active" : "method"} onClick={() => setMethod("CARD")}>CARD</button>
                <button className={method === "VOUCHER" ? "method active" : "method"} onClick={() => setMethod("VOUCHER")}>VOUCHER</button>
              </div>

              <div className="cash-box">
                <span>PAYMENT AMOUNT</span>
                <input value={amount} onChange={(e) => setAmount(e.target.value)} />
              </div>
              {method === "CASH" && (
                <div className="cash-box">
                  <span>CASH RECEIVED</span>
                  <input value={received} onChange={(e) => setReceived(e.target.value)} />
                </div>
              )}

              <div className="pay-lines">
                <div><span>SUBTOTAL</span><b>{money(subtotal)}</b></div>
                <div><span>DISCOUNT</span><b>{money(discountCents)}</b></div>
                <div><span>THIS PAYMENT</span><b>{money(appliedAmountCents)}</b></div>
                <div><span>PAID SO FAR</span><b>{money(paidCents)}</b></div>
                <div><span>REMAINING</span><b>{money(remainingCents)}</b></div>
              </div>

              <div className="pay-total">
                <span>TOTAL</span><b>{money(payable)}</b>
              </div>
              <div className="pay-total pay-change">
                <span>CHANGE</span><b>{money(changeCents)}</b>
              </div>

              <div className="payment-history">
                {(payments || []).map((p) => (
                  <div key={p.id} className="payment-history-row">
                    <span>#{p.id} {p.method}</span>
                    <span>{money(p.amount_cents)}</span>
                  </div>
                ))}
              </div>

              <button
                className="pay-now"
                disabled={processing || appliedAmountCents <= 0 || (method === "CASH" && receivedCents < appliedAmountCents)}
                onClick={payNow}
              >
                {processing ? "PROCESSING..." : "ADD PAYMENT"}
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
