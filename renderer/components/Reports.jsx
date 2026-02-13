(function () {
  const { useEffect, useState } = React;
  const { money } = window.POSUtils.db;

  function Reports() {
    const [range, setRange] = useState("daily");
    const [summary, setSummary] = useState(null);
    const [register, setRegister] = useState(null);
    const [error, setError] = useState("");
    const [message, setMessage] = useState("");

    async function load() {
      setError("");
      const [summaryResp, registerResp] = await Promise.all([
        window.posAPI.getReportSummary({ range }),
        window.posAPI.getDailyRegister()
      ]);
      if (!summaryResp.ok) throw new Error(summaryResp.error || "Failed to load summary.");
      if (!registerResp.ok) throw new Error(registerResp.error || "Failed to load daily register.");
      setSummary(summaryResp.summary);
      setRegister(registerResp.register);
    }

    async function exportCsv() {
      setError("");
      setMessage("");
      const resp = await window.posAPI.exportReportCsv({ range });
      if (!resp.ok) {
        setError(resp.error || "Export failed.");
        return;
      }
      setMessage(`CSV exported to: ${resp.filePath}`);
    }

    useEffect(() => {
      load().catch((e) => setError(e.message || "Failed to load reports."));
    }, [range]);

    return (
      <div className="screen-grid">
        <div className="card">
          <h2>Daily Register</h2>
          <div className="row">
            <button onClick={load}>Refresh</button>
            <select value={range} onChange={(e) => setRange(e.target.value)}>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
            <button className="primary" onClick={exportCsv}>Export Sales CSV</button>
          </div>

          <div className="row">
            <div className="card">
              <div className="muted">Opening Float</div>
              <strong>{money(register?.totals?.openingFloat || 0)}</strong>
            </div>
            <div className="card">
              <div className="muted">Today Sales</div>
              <strong>{money(register?.totals?.sales || 0)}</strong>
            </div>
            <div className="card">
              <div className="muted">Cash In</div>
              <strong>{money(register?.totals?.cashIn || 0)}</strong>
            </div>
            <div className="card">
              <div className="muted">Cash Out</div>
              <strong>{money(register?.totals?.cashOut || 0)}</strong>
            </div>
            <div className="card">
              <div className="muted">Expected Drawer</div>
              <strong>{money(register?.totals?.expectedDrawer || 0)}</strong>
            </div>
            <div className="card">
              <div className="muted">Actual Closed</div>
              <strong>{money(register?.totals?.actualClosed || 0)}</strong>
            </div>
          </div>

          <h3>Payment Register (Today)</h3>
          <table className="table">
            <thead>
              <tr><th>Time</th><th>Order</th><th>Cashier</th><th>Method</th><th>Amount</th><th>Received</th><th>Change</th></tr>
            </thead>
            <tbody>
              {(register?.sales || []).map((s) => (
                <tr key={`sale-${s.id}`}>
                  <td>{s.created_at}</td>
                  <td>#{s.order_id}</td>
                  <td>{s.cashier || "-"}</td>
                  <td>{s.method}</td>
                  <td>{money(s.amount_cents)}</td>
                  <td>{money(s.received_cents)}</td>
                  <td>{money(s.change_cents)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h3>Cash Register Movements (Today)</h3>
          <table className="table">
            <thead>
              <tr><th>Time</th><th>User</th><th>Type</th><th>Reason</th><th>Ref</th><th>Amount</th></tr>
            </thead>
            <tbody>
              {(register?.cashMovements || []).map((m) => (
                <tr key={`mov-${m.id}`}>
                  <td>{m.created_at}</td>
                  <td>{m.username || "-"}</td>
                  <td>{m.transaction_type}</td>
                  <td>{m.reason}</td>
                  <td>{m.reference_type || "-"} {m.reference_id || ""}</td>
                  <td>{money(m.amount_cents)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {message && <div className="success">{message}</div>}
          {error && <div className="error">{error}</div>}
        </div>

        <div className="card">
          <h2>Sessions & Summary</h2>
          <h3>Cash Sessions (Today)</h3>
          <table className="table">
            <thead>
              <tr><th>ID</th><th>Status</th><th>Open</th><th>Expected</th><th>Close</th><th>Variance</th></tr>
            </thead>
            <tbody>
              {(register?.sessions || []).map((s) => (
                <tr key={`session-${s.id}`}>
                  <td>{s.id}</td>
                  <td>{s.status}</td>
                  <td>{money(s.opening_cents)}</td>
                  <td>{s.expected_closing_cents == null ? "-" : money(s.expected_closing_cents)}</td>
                  <td>{s.closing_cents == null ? "-" : money(s.closing_cents)}</td>
                  <td>{s.variance_cents == null ? "-" : money(s.variance_cents)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h3>Sales Summary ({range})</h3>
          <p>Paid orders: <strong>{summary?.sales?.paid_orders || 0}</strong></p>
          <p>Gross sales: <strong>{money(summary?.sales?.gross_sales || 0)}</strong></p>

          <h3>Top Items</h3>
          <ul>
            {(summary?.topItems || []).map((i) => <li key={i.name}>{i.name}: {i.qty}</li>)}
          </ul>

          <h3>Low Stock Alerts</h3>
          <ul>
            {(summary?.lowStock || []).length
              ? summary.lowStock.map((i) => <li key={i.id}>{i.name}: {i.stock_qty} (threshold {i.low_stock_threshold})</li>)
              : <li>No low-stock ingredients.</li>}
          </ul>
        </div>
      </div>
    );
  }

  window.POSComponents = window.POSComponents || {};
  window.POSComponents.Reports = Reports;
})();
