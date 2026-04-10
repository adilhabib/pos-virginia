(function () {
  const { useEffect, useMemo, useState } = React;
  const { money } = window.POSUtils.db;
  const DENOMS = [5000, 1000, 500, 100, 50, 20, 10, 5, 2, 1];

  function CashSession({ user }) {
    const [sessionResp, setSessionResp] = useState({ session: null, totals: null });
    const [opening, setOpening] = useState("");
    const [txnType, setTxnType] = useState("OUT");
    const [txnAmount, setTxnAmount] = useState("");
    const [txnReason, setTxnReason] = useState("");
    const [denominationCounts, setDenominationCounts] = useState(() =>
      DENOMS.reduce((acc, d) => {
        acc[d] = "";
        return acc;
      }, {})
    );
    const [message, setMessage] = useState("");
    const [error, setError] = useState("");

    async function load() {
      const data = await window.POSUtils.cash.getOpenSession();
      setSessionResp(data);
    }

    useEffect(() => {
      load().catch((e) => setError(e.message || "Failed to load session."));
    }, []);

    async function openSession() {
      setError("");
      setMessage("");
      try {
        await window.POSUtils.cash.openSession(user.id, Math.round(Number(opening || 0) * 100));
        setMessage("Cash session opened.");
        setOpening("");
        await load();
      } catch (err) {
        setError(err.message || "Unable to open session.");
      }
    }

    async function addTxn() {
      if (!sessionResp.session) return;
      setError("");
      setMessage("");
      try {
        await window.POSUtils.cash.addTransaction(
          sessionResp.session.id,
          txnType,
          Math.round(Number(txnAmount || 0) * 100),
          txnReason,
          user.id
        );
        setMessage("Cash transaction saved.");
        setTxnAmount("");
        setTxnReason("");
        await load();
      } catch (err) {
        setError(err.message || "Unable to record cash transaction.");
      }
    }

    async function closeSession() {
      if (!sessionResp.session) return;
      setError("");
      setMessage("");
      if (countedTotalCents <= 0) {
        setError("Enter denomination counts before closing shift.");
        return;
      }
      try {
        const out = await window.POSUtils.cash.closeSession(
          sessionResp.session.id,
          user.id,
          countedTotalCents,
          denominationCounts
        );
        setMessage(
          `Closed. Expected ${money(out.expected)} | Actual ${money(out.actual)} | Variance ${money(out.variance)}`
        );
        setDenominationCounts(
          DENOMS.reduce((acc, d) => {
            acc[d] = "";
            return acc;
          }, {})
        );
        await load();
      } catch (err) {
        setError(err.message || "Unable to close session.");
      }
    }

    const open = sessionResp.session;
    const inTotal = (sessionResp.totals?.inOut || []).find((x) => x.transaction_type === "IN")?.total || 0;
    const outTotal = (sessionResp.totals?.inOut || []).find((x) => x.transaction_type === "OUT")?.total || 0;
    const countedTotalCents = useMemo(
      () =>
        DENOMS.reduce((sum, denom) => {
          const count = Number(denominationCounts[denom] || 0);
          return sum + (Number.isFinite(count) ? Math.max(0, Math.floor(count)) * denom * 100 : 0);
        }, 0),
      [denominationCounts]
    );

    function updateCount(denom, value) {
      setDenominationCounts((prev) => ({ ...prev, [denom]: value }));
    }

    return (
      <div className="flex flex-col h-full gap-6 p-2 overflow-hidden animate-in fade-in duration-300">
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-8 flex flex-col md:flex-row justify-between items-center gap-6 shrink-0">
          <div className="flex-1 text-center md:text-left">
            <h2 className="text-3xl font-black text-gray-900 tracking-tighter uppercase italic">Counter Settings</h2>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">Manage cash flow & daily shift reconciliation</p>
          </div>
          <div className="flex flex-col items-end gap-1">
             <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border ${open ? 'bg-teal-50 text-teal-600 border-teal-100' : 'bg-red-50 text-red-500 border-red-100'}`}>
                {open ? `Session Active: #${open.id}` : "Counter Closed"}
             </span>
             {open && <span className="text-[9px] font-bold text-gray-300 tracking-wider">OPENED BY {user.role} • {new Date(open.opened_at).toLocaleTimeString()}</span>}
          </div>
        </div>

        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 gap-6 overflow-hidden">
          {!open ? (
            <div className="lg:col-span-12 flex items-center justify-center p-6">
              <div className="max-w-md w-full bg-white rounded-3xl shadow-2xl border border-gray-100 p-10 text-center space-y-6 animate-in slide-in-from-bottom-4 duration-500">
                <div className="w-20 h-20 bg-teal-50 text-teal-600 rounded-full flex items-center justify-center mx-auto text-3xl font-black">PKR</div>
                <div>
                   <h3 className="text-xl font-black text-gray-900 uppercase">Initialize Register</h3>
                   <p className="text-[11px] font-bold text-gray-400 mt-2 px-6">Provide the starting float amount to begin your sales shift.</p>
                </div>
                <div className="space-y-4 pt-4">
                  <div className="space-y-1 text-left px-4">
                    <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest pl-1">Daily Opening Balance</label>
                    <input className="w-full px-6 py-4 bg-gray-50 border border-transparent rounded-2xl text-2xl font-black text-teal-700 outline-none focus:bg-white focus:border-teal-200 transition-all text-center" value={opening} onChange={(e) => setOpening(e.target.value)} placeholder="0.00" />
                  </div>
                  <button className="w-full py-5 bg-gray-900 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-2xl shadow-gray-200 hover:bg-gray-800 transition-all active:scale-[0.98]" onClick={openSession}>Open Register & Start Shift</button>
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* Left Column: Summary & Daily Actions */}
              <div className="lg:col-span-5 flex flex-col gap-6 overflow-y-auto pr-1">
                 {/* Stats Grid */}
                 <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 grid grid-cols-2 gap-4 shrink-0">
                    <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100/50">
                       <span className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Shift Opening</span>
                       <span className="text-xl font-black text-gray-900">{money(open.opening_cents)}</span>
                    </div>
                    <div className="p-4 bg-teal-50 rounded-2xl border border-teal-100/50">
                       <span className="block text-[9px] font-black text-teal-600 uppercase tracking-widest mb-1 font-black">Net Inflow</span>
                       <span className="text-xl font-black text-teal-700">+{money(inTotal)}</span>
                    </div>
                    <div className="p-4 bg-red-50 rounded-2xl border border-red-100/50">
                       <span className="block text-[9px] font-black text-red-500 uppercase tracking-widest mb-1 font-black">Net Outflow</span>
                       <span className="text-xl font-black text-red-600">-{money(outTotal)}</span>
                    </div>
                    <div className="p-4 bg-gray-900 rounded-2xl shadow-xl shadow-gray-100">
                       <span className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Expected Cash</span>
                       <span className="text-xl font-black text-white">{money(open.opening_cents + inTotal - outTotal)}</span>
                    </div>
                 </div>

                 {/* Transaction Form */}
                 <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-8 space-y-6 shrink-0">
                    <h3 className="text-xs font-black text-gray-900 uppercase tracking-widest border-b border-gray-50 pb-4 italic">Register Cash Event</h3>
                    <div className="space-y-4">
                       <div className="grid grid-cols-2 gap-3">
                          <button className={`py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${txnType === 'OUT' ? 'bg-red-600 text-white shadow-lg shadow-red-100' : 'bg-gray-50 text-gray-400 hover:bg-gray-100'}`} onClick={() => setTxnType('OUT')}>Cash-Out [Expense]</button>
                          <button className={`py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${txnType === 'IN' ? 'bg-teal-600 text-white shadow-lg shadow-teal-100' : 'bg-gray-50 text-gray-400 hover:bg-gray-100'}`} onClick={() => setTxnType('IN')}>Cash-In [Deposit]</button>
                       </div>
                       <div className="space-y-1">
                          <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest pl-1">Transaction Amount</label>
                          <input className="w-full px-5 py-4 bg-gray-50 border border-gray-100 rounded-2xl text-xl font-black text-gray-900 focus:bg-white outline-none" value={txnAmount} onChange={(e) => setTxnAmount(e.target.value)} placeholder="0.00" />
                       </div>
                       <div className="space-y-1">
                          <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest pl-1">Detailed Reason / Memo</label>
                          <input className="w-full px-5 py-4 bg-gray-50 border border-gray-100 rounded-2xl text-xs font-bold text-gray-500 focus:bg-white outline-none" value={txnReason} onChange={(e) => setTxnReason(e.target.value)} placeholder="e.g. Electricity Bill / Fuel / Error Correction" />
                       </div>
                       <button className={`w-full py-5 rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-xl hover:bg-opacity-90 active:scale-[0.99] ${txnType === 'OUT' ? 'bg-red-600 text-white shadow-red-50' : 'bg-teal-600 text-white shadow-teal-50'}`} onClick={addTxn}>Commit Transaction</button>
                    </div>
                 </div>
              </div>

              {/* Right Column: Denomination Count & Close Shift */}
              <div className="lg:col-span-7 bg-white rounded-3xl shadow-sm border border-gray-100 flex flex-col h-full overflow-hidden">
                 <div className="p-6 border-b border-gray-50 flex justify-between items-center shrink-0">
                    <div>
                      <h3 className="text-xs font-black text-gray-900 uppercase tracking-widest">Shift Closing [Denominations]</h3>
                      <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mt-1">Audit physical cash before ending shift</p>
                    </div>
                    <div className="text-right">
                       <span className="text-[10px] font-black text-gray-400 uppercase block">Total Physical Value</span>
                       <span className="text-2xl font-black text-teal-600 leading-none">{money(countedTotalCents)}</span>
                    </div>
                 </div>

                 <div className="flex-1 overflow-y-auto p-6 scrollbar-hide">
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 pb-24">
                       {DENOMS.map((d) => (
                         <div key={d} className="bg-gray-50 p-4 rounded-2xl border border-gray-100 flex flex-col items-center gap-3 transition-colors hover:border-teal-200">
                            <span className="text-xs font-black text-gray-500">{money(d * 100)}</span>
                            <div className="w-full relative">
                               <input 
                                 className="w-full bg-white border border-gray-100 rounded-xl px-3 py-2 text-center text-sm font-black text-teal-700 outline-none focus:border-teal-400" 
                                 value={denominationCounts[d]} 
                                 onChange={(e) => updateCount(d, e.target.value)} 
                                 placeholder="0"
                               />
                               <span className="absolute right-2 top-2 text-[8px] font-black text-gray-300 opacity-40">Qty</span>
                            </div>
                            <span className="text-[9px] font-black text-gray-300 uppercase tracking-widest">= {money(Number(denominationCounts[d] || 0) * d * 100)}</span>
                         </div>
                       ))}
                    </div>
                 </div>

                 <div className="p-6 bg-gray-50 border-t border-gray-100 shrink-0">
                    <button className="w-full py-5 bg-red-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-2xl shadow-red-100 hover:bg-red-700 transition-all active:scale-[0.98]" onClick={closeSession}>Reconcile & Close Shift</button>
                    <p className="text-[9px] text-gray-400 font-bold text-center mt-3 uppercase tracking-widest italic font-black">Warning: This action is irreversible once committed</p>
                 </div>
              </div>
            </>
          )}
        </div>

        {/* Floating Feedback */}
        {message && (
          <div className="fixed bottom-6 right-6 px-10 py-6 bg-gray-900 border border-white/10 text-white rounded-[2rem] font-black shadow-2xl animate-in slide-in-from-right-full duration-500 z-50 flex items-center gap-6">
             <div className="w-10 h-10 bg-teal-500 rounded-full flex items-center justify-center text-xl animate-bounce">⚡</div>
             <div>
               <p className="text-[10px] text-teal-400 uppercase tracking-[0.2em] font-black">System Notification</p>
               <p className="text-sm font-black mt-1 leading-tight">{message}</p>
             </div>
          </div>
        )}
        {error && (
          <div className="fixed bottom-6 right-6 px-10 py-6 bg-red-600 text-white rounded-[2rem] font-black shadow-2xl animate-in shake duration-500 z-50 flex items-center gap-6 border-b-4 border-red-800">
             <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center text-xl">⚠️</div>
             <div>
               <p className="text-[10px] text-red-100 uppercase tracking-[0.2em] font-black">Action Required</p>
               <p className="text-sm font-black mt-1 leading-tight">{error}</p>
             </div>
          </div>
        )}
      </div>
    );
  }

  window.POSComponents = window.POSComponents || {};
  window.POSComponents.CashSession = CashSession;
})();
