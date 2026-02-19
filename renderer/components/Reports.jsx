(function () {
  const { useEffect, useState } = React;
  const { money } = window.POSUtils.db;

  function Reports({ user }) {
    const [range, setRange] = useState("daily");
    const [summary, setSummary] = useState(null);
    const [register, setRegister] = useState(null);
    const [procurement, setProcurement] = useState(null);
    const [backups, setBackups] = useState([]);
    const [selectedBackup, setSelectedBackup] = useState("");
    const [error, setError] = useState("");
    const [message, setMessage] = useState("");

    async function load() {
      setError("");
      const [summaryResp, registerResp, backupResp] = await Promise.all([
        window.posAPI.getReportSummary({ range }),
        window.posAPI.getDailyRegister(),
        window.posAPI.listBackups()
      ]);
      if (!summaryResp.ok) throw new Error(summaryResp.error || "Failed to load summary.");
      if (!registerResp.ok) throw new Error(registerResp.error || "Failed to load daily register.");
      if (!backupResp.ok) throw new Error(backupResp.error || "Failed to load backups.");
      setSummary(summaryResp.summary);
      setRegister(registerResp.register);
      setBackups(backupResp.backups || []);
      if (!selectedBackup && (backupResp.backups || []).length) {
        setSelectedBackup(backupResp.backups[0].fileName);
      }
      const procurementResp = await window.posAPI.getProcurementReport();
      if (!procurementResp.ok) throw new Error(procurementResp.error || "Failed to load procurement report.");
      setProcurement(procurementResp.procurement);
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
    
    async function createBackupNow() {
      setError("");
      setMessage("");
      const resp = await window.posAPI.createBackup({ userId: user?.id });
      if (!resp.ok) {
        setError(resp.error || "Backup failed.");
        return;
      }
      const listResp = await window.posAPI.listBackups();
      if (listResp.ok) {
        setBackups(listResp.backups || []);
        if (resp.fileName) setSelectedBackup(resp.fileName);
      }
      setMessage(`Backup created: ${resp.fileName}`);
    }

    async function restoreSelectedBackup() {
      if (!selectedBackup) {
        setError("Select a backup file first.");
        return;
      }
      const confirmRestore = window.confirm("Restore will replace current POS data. Continue?");
      if (!confirmRestore) return;
      setError("");
      setMessage("");
      const resp = await window.posAPI.restoreBackup({ userId: user?.id, fileName: selectedBackup });
      if (!resp.ok) {
        setError(resp.error || "Restore failed.");
        return;
      }
      setMessage(`Backup restored: ${resp.fileName}`);
      await load();
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
          <h3>End-of-Day Close (Today)</h3>
          <table className="table">
            <tbody>
              <tr><td>Opening Float</td><td>{money(summary?.eodClose?.openingFloat || 0)}</td></tr>
              <tr><td>Cash In</td><td>{money(summary?.eodClose?.cashIn || 0)}</td></tr>
              <tr><td>Cash Out</td><td>{money(summary?.eodClose?.cashOut || 0)}</td></tr>
              <tr><td>Expected Close</td><td>{money(summary?.eodClose?.expectedClose || 0)}</td></tr>
              <tr><td>Actual Closed</td><td>{money(summary?.eodClose?.actualClose || 0)}</td></tr>
              <tr><td>Variance</td><td>{money(summary?.eodClose?.variance || 0)}</td></tr>
              <tr><td>Closed Sessions</td><td>{summary?.eodClose?.closedSessions || 0}</td></tr>
            </tbody>
          </table>

          <h3>Cashier-wise Sales ({range})</h3>
          <table className="table">
            <thead>
              <tr><th>Cashier</th><th>Paid Orders</th><th>Sales</th></tr>
            </thead>
            <tbody>
              {(summary?.cashierSales || []).map((c) => (
                <tr key={`cashier-${c.cashier || "unknown"}`}>
                  <td>{c.cashier || "-"}</td>
                  <td>{c.paid_orders}</td>
                  <td>{money(c.gross_sales)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h3>Category Margin ({range})</h3>
          <table className="table">
            <thead>
              <tr><th>Category</th><th>Net Sales</th><th>Est. Cost</th><th>Gross Margin</th></tr>
            </thead>
            <tbody>
              {(summary?.categoryMargin || []).map((c) => (
                <tr key={`cat-${c.category}`}>
                  <td>{c.category}</td>
                  <td>{money(c.net_sales_cents)}</td>
                  <td>{money(c.estimated_cost_cents)}</td>
                  <td>{money(c.gross_margin_cents)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h3>Tax Summary ({range})</h3>
          <table className="table">
            <tbody>
              <tr><td>Taxable Sales</td><td>{money(summary?.taxSummary?.taxable_sales_cents || 0)}</td></tr>
              <tr><td>Total Discount</td><td>{money(summary?.taxSummary?.total_discount_cents || 0)}</td></tr>
              <tr><td>Tax Collected</td><td>{money(summary?.taxSummary?.tax_collected_cents || 0)}</td></tr>
              <tr><td>Net Sales</td><td>{money(summary?.taxSummary?.net_sales_cents || 0)}</td></tr>
            </tbody>
          </table>

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

          <h3>Procurement Snapshot</h3>
          <table className="table">
            <tbody>
              <tr><td>Stock Valuation</td><td>{money(procurement?.stockValuationCents || 0)}</td></tr>
              <tr><td>Open PO</td><td>{procurement?.openPoCount || 0}</td></tr>
              <tr><td>Received PO</td><td>{procurement?.receivedPoCount || 0}</td></tr>
              <tr><td>Today Received Value</td><td>{money(procurement?.todayReceivedValueCents || 0)}</td></tr>
            </tbody>
          </table>

          <h3>Top Suppliers (by PO value)</h3>
          <table className="table">
            <thead>
              <tr><th>Supplier</th><th>Total PO Value</th></tr>
            </thead>
            <tbody>
              {(procurement?.topSuppliers || []).map((s) => (
                <tr key={`supplier-${s.supplier}`}>
                  <td>{s.supplier}</td>
                  <td>{money(s.total_cost_cents)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h3>Backup & Restore</h3>
          <div className="row">
            <button className="primary" onClick={createBackupNow}>Create Backup Now</button>
            <select value={selectedBackup} onChange={(e) => setSelectedBackup(e.target.value)}>
              <option value="">Select backup</option>
              {backups.map((b) => (
                <option key={b.fileName} value={b.fileName}>{b.fileName}</option>
              ))}
            </select>
            <button onClick={restoreSelectedBackup}>Restore Selected</button>
          </div>
          <table className="table">
            <thead>
              <tr><th>File</th><th>Modified</th><th>Size (KB)</th></tr>
            </thead>
            <tbody>
              {backups.map((b) => (
                <tr key={`backup-${b.fileName}`}>
                  <td>{b.fileName}</td>
                  <td>{b.modifiedAt}</td>
                  <td>{(Number(b.sizeBytes || 0) / 1024).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  window.POSComponents = window.POSComponents || {};
  window.POSComponents.Reports = Reports;
})();
