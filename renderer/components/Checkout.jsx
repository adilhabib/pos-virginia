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

    async function printPendingBill() {
      if (!order?.id) return;
      setError("");
      setMessage("");
      setProcessing(true);
      try {
        if (remainingCents <= 0) {
          throw new Error("Order is already fully paid.");
        }
        await window.POSUtils.orders.setOrderStatus(order.id, "HOLD", user.id);
        const receipt = await window.POSUtils.orders.printReceipt(order.id);
        await refreshOrder();
        await refreshPayments();
        setMessage(
          receipt?.receiptPath
            ? `Pending bill printed: ${receipt.receiptPath}`
            : "Pending bill printed."
        );
      } catch (err) {
        setError(err.message || "Unable to print pending bill.");
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
      <div className="flex flex-col lg:flex-row h-full gap-6 p-2">
        {!order ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100 text-center">
              <p className="text-gray-400 font-medium">No active order selected.</p>
              <p className="text-gray-300 text-sm mt-2">Go to MENU to create or recall an order.</p>
            </div>
          </div>
        ) : (
          <>
            {/* Left: Order Review */}
            <section className="flex-1 flex flex-col min-w-0">
               <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden flex flex-col h-full">
                  <div className="p-6 bg-gray-50/50 flex justify-between items-center border-b border-gray-100">
                    <div>
                      <h2 className="text-2xl font-black text-gray-900 leading-none">ORDER #{order.id}</h2>
                      <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-2">Placed at {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
                    </div>
                    <button onClick={cancelOrder} className="bg-red-50 text-red-500 hover:bg-red-100 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-colors">
                      Cancel Order
                    </button>
                  </div>

                  <div className="flex-1 overflow-y-auto">
                    <table className="w-full text-left">
                      <thead className="sticky top-0 bg-white shadow-sm">
                        <tr className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                          <th className="px-6 py-4">Item</th>
                          <th className="px-6 py-4">Price</th>
                          <th className="px-6 py-4 text-center">Qty</th>
                          <th className="px-6 py-4 text-right">Subtotal</th>
                          <th className="px-6 py-4"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {items.map((item) => (
                          <tr key={item.id} className="hover:bg-gray-50/50 transition-colors">
                            <td className="px-6 py-5">
                               <div className="font-bold text-gray-800 text-sm">{item.item_name}</div>
                               <div className="text-[10px] text-gray-400 font-medium uppercase">{item.category}</div>
                            </td>
                            <td className="px-6 py-5 text-sm font-medium text-gray-600">{money(item.unit_price_cents)}</td>
                            <td className="px-6 py-5 text-center">
                               <span className="bg-gray-100 px-2 py-1 rounded text-xs font-black text-gray-600">{item.quantity}</span>
                            </td>
                            <td className="px-6 py-5 text-right font-black text-teal-600 text-sm">{money(item.line_total_cents)}</td>
                            <td className="px-6 py-5 text-right">
                              <button onClick={() => removeItem(item)} className="text-red-300 hover:text-red-500 transition-colors">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="p-6 bg-gray-50 border-t border-gray-100">
                     <div className="flex justify-between items-center text-sm font-bold text-gray-500 uppercase tracking-widest">
                        <span>Total Items</span>
                        <span>{items.reduce((acc, i) => acc + i.quantity, 0)} Units</span>
                     </div>
                  </div>
               </div>
            </section>

            {/* Right: Payment Sidebar */}
            <aside className="w-full lg:w-[450px] flex flex-col bg-white rounded-3xl shadow-2xl border border-gray-100 overflow-hidden">
              <div className="p-6 bg-gray-900 text-white">
                 <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Payable Balance</h3>
                 <div className="text-5xl font-black mb-4">{money(payable)}</div>
                 <div className="flex gap-4 border-t border-white/10 pt-4">
                    <div className="flex-1">
                       <span className="text-[9px] font-bold text-white/50 uppercase block">Received</span>
                       <span className="text-lg font-black">{money(paidCents)}</span>
                    </div>
                    <div className="flex-1 text-right">
                       <span className="text-[9px] font-bold text-white/50 uppercase block">Remaining Due</span>
                       <span className={`text-lg font-black ${remainingCents > 0 ? "text-yellow-400" : "text-teal-400"}`}>
                        {money(remainingCents)}
                       </span>
                    </div>
                 </div>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {/* Payment Methods */}
                <div>
                   <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-3">Select Method</span>
                   <div className="grid grid-cols-3 gap-2">
                     {["CASH", "CARD", "VOUCHER"].map(m => (
                       <button 
                        key={m}
                        className={`py-3 rounded-2xl font-black text-xs transition-all border ${
                          method === m 
                          ? "bg-teal-600 border-teal-600 text-white shadow-lg shadow-teal-100 scale-105" 
                          : "bg-white border-gray-100 text-gray-400 hover:border-teal-200"
                        }`}
                        onClick={() => setMethod(m)}
                       >
                        {m}
                       </button>
                     ))}
                   </div>
                </div>

                {/* Input Fields */}
                <div className="space-y-4">
                   <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
                     <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-2">Payment Amount</span>
                     <input 
                      className="w-full bg-transparent text-2xl font-black text-gray-900 outline-none" 
                      value={amount} 
                      onChange={(e) => setAmount(e.target.value)} 
                      placeholder="0.00"
                     />
                   </div>
                   {method === "CASH" && (
                     <div className="bg-teal-50 p-4 rounded-2xl border border-teal-100 animate-in fade-in slide-in-from-top-2 duration-300">
                       <span className="text-[10px] font-bold text-teal-700 uppercase tracking-widest block mb-2 text-center">Cash Tendered</span>
                       <input 
                        className="w-full bg-transparent text-4xl font-black text-teal-700 text-center outline-none" 
                        value={received} 
                        onChange={(e) => setReceived(e.target.value)} 
                        placeholder="0.00"
                        autoFocus
                       />
                     </div>
                   )}
                </div>

                {/* Summary Rows */}
                <div className="space-y-2 border-t border-dashed border-gray-200 pt-4">
                   <div className="flex justify-between text-xs font-medium text-gray-500">
                     <span>Subtotal</span>
                     <span className="font-bold">{money(subtotal)}</span>
                   </div>
                   {discountCents > 0 && (
                     <div className="flex justify-between text-xs font-medium text-yellow-600">
                       <span>Discount Applied</span>
                       <span className="font-bold">-{money(discountCents)}</span>
                     </div>
                   )}
                   <div className="flex justify-between text-xs font-black text-gray-900 pt-2 border-t border-gray-50">
                     <span>Total Finalized</span>
                     <span className="text-teal-600">{money(payable)}</span>
                   </div>
                   {method === "CASH" && changeCents > 0 && (
                     <div className="bg-yellow-50 p-3 rounded-xl flex justify-between items-center mt-2 border border-yellow-100">
                        <span className="text-[10px] font-bold text-yellow-700 uppercase tracking-widest">Change Return</span>
                        <span className="text-xl font-black text-yellow-700">{money(changeCents)}</span>
                     </div>
                   )}
                </div>

                {/* History */}
                <div className="space-y-2">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block">Payment History</span>
                  <div className="space-y-2">
                    {payments.length === 0 ? (
                      <div className="text-center py-4 bg-gray-50 border border-gray-100 border-dashed rounded-xl text-[10px] font-bold text-gray-300 uppercase letter-widest">
                        Zero payments received
                      </div>
                    ) : (
                      payments.map((p) => (
                        <div key={p.id} className="flex justify-between items-center p-3 bg-white border border-gray-100 rounded-xl shadow-sm">
                           <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-lg bg-teal-50 text-teal-600 flex items-center justify-center">
                                 <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24 font-bold"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>
                              </div>
                              <div>
                                 <div className="text-[10px] font-black text-gray-900 uppercase">#{p.id} {p.method}</div>
                                 <div className="text-[9px] font-bold text-gray-400 capitalize">{new Date().toLocaleDateString()}</div>
                              </div>
                           </div>
                           <span className="font-black text-gray-900 text-sm">{money(p.amount_cents)}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="p-6 bg-gray-50 space-y-3">
                <button
                  className="w-full py-4 bg-teal-600 text-white rounded-2xl font-black text-sm uppercase tracking-widest shadow-lg shadow-teal-500/20 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50 disabled:scale-100"
                  disabled={processing || appliedAmountCents <= 0 || (method === "CASH" && receivedCents < appliedAmountCents)}
                  onClick={payNow}
                >
                  {processing ? "Sending Transaction..." : "Complete Payment"}
                </button>
                {remainingCents > 0 && (
                  <button 
                    className="w-full py-3 bg-white text-teal-600 border border-teal-100 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-teal-50 transition-all disabled:opacity-50" 
                    disabled={processing} 
                    onClick={printPendingBill}
                  >
                    Hold & Print Bill
                  </button>
                )}
                {message && <div className="p-3 bg-green-500 text-white text-center rounded-xl font-bold text-[10px] uppercase tracking-widest shadow-lg">{message}</div>}
                {error && <div className="p-3 bg-red-500 text-white text-center rounded-xl font-bold text-[10px] uppercase tracking-widest shadow-lg">{error}</div>}
              </div>
            </aside>
          </>
        )}
      </div>
    );
  }

  window.POSComponents = window.POSComponents || {};
  window.POSComponents.Checkout = Checkout;
})();
