(function () {
  const { useEffect, useState } = React;
  const { money } = window.POSUtils.db;

  function CashSession({ user }) {
    const [sessionResp, setSessionResp] = useState({ session: null, totals: null });
    const [opening, setOpening] = useState("");
    const [actualClosing, setActualClosing] = useState("");
    const [txnType, setTxnType] = useState("OUT");
    const [txnAmount, setTxnAmount] = useState("");
    const [txnReason, setTxnReason] = useState("");
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
      if (!actualClosing || Number(actualClosing) <= 0) {
        setError("Enter total counted cash before closing shift.");
        return;
      }
      try {
        const out = await window.POSUtils.cash.closeSession(
          sessionResp.session.id,
          user.id,
          Math.round(Number(actualClosing || 0) * 100)
        );
        setMessage(
          `Closed. Expected ${money(out.expected)} | Actual ${money(out.actual)} | Variance ${money(out.variance)}`
        );
        setActualClosing("");
        await load();
      } catch (err) {
        setError(err.message || "Unable to close session.");
      }
    }

    const open = sessionResp.session;
    const inTotal = (sessionResp.totals?.inOut || []).find((x) => x.transaction_type === "IN")?.total || 0;
    const outTotal = (sessionResp.totals?.inOut || []).find((x) => x.transaction_type === "OUT")?.total || 0;
    const expectedClose = open ? Number(open.opening_cents || 0) + Number(inTotal) - Number(outTotal) : 0;
    return (
      <div className="screen-grid">
        <div className="card">
          <h2>Cash Session</h2>
          {!open ? (
            <>
              <label>Opening cash</label>
              <input value={opening} onChange={(e) => setOpening(e.target.value)} placeholder="200.00" />
              <button className="primary" onClick={openSession}>Open Shift</button>
            </>
          ) : (
            <>
              <p>Session #{open.id}</p>
              <p>Opened at: {open.opened_at}</p>
              <p>Opening: {money(open.opening_cents)}</p>
              <p>Total In: {money(inTotal)}</p>
              <p>Total Out: {money(outTotal)}</p>
              <p>Expected Close Cash: <strong>{money(expectedClose)}</strong></p>
              <p>Status: <strong>{open.status}</strong></p>

              <label>Transaction type</label>
              <select value={txnType} onChange={(e) => setTxnType(e.target.value)}>
                <option value="OUT">Cash Out</option>
                <option value="IN">Cash In</option>
              </select>
              <label>Amount</label>
              <input value={txnAmount} onChange={(e) => setTxnAmount(e.target.value)} placeholder="10.00" />
              <label>Reason</label>
              <input value={txnReason} onChange={(e) => setTxnReason(e.target.value)} placeholder="Petty expense / correction" />
              <button onClick={addTxn}>Add Transaction</button>

              <hr />
              <label>Total counted cash at close</label>
              <input value={actualClosing} onChange={(e) => setActualClosing(e.target.value)} placeholder="450.00" />
              <button className="primary" onClick={closeSession}>Close Shift</button>
            </>
          )}
          {message && <div className="success">{message}</div>}
          {error && <div className="error">{error}</div>}
        </div>
      </div>
    );
  }

  window.POSComponents = window.POSComponents || {};
  window.POSComponents.CashSession = CashSession;
})();
