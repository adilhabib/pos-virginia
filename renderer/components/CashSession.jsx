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
              <h3>Blind Close Denomination Count</h3>
              <table className="table">
                <thead>
                  <tr><th>Denomination</th><th>Count</th></tr>
                </thead>
                <tbody>
                  {DENOMS.map((d) => (
                    <tr key={d}>
                      <td>{money(d * 100)}</td>
                      <td>
                        <input
                          value={denominationCounts[d]}
                          onChange={(e) => updateCount(d, e.target.value)}
                          placeholder="0"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p>Total counted cash: <strong>{money(countedTotalCents)}</strong></p>
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
