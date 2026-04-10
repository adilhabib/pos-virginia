
(function () {
  const { useEffect, useMemo, useState } = React;
  const { money } = window.POSUtils.db;
  const credit = window.POSUtils.credit;

  const TABS = [
    { key: "dashboard", label: "Dashboard" },
    { key: "customers", label: "Customers" },
    { key: "new-sale", label: "New Sale" },
    { key: "payments", label: "Payments" },
    { key: "ledger", label: "Ledger" },
    { key: "vendors", label: "Vendors" },
    { key: "new-purchase", label: "New Purchase" },
    { key: "vendor-payments", label: "Vendor Payments" },
    { key: "vendor-ledger", label: "Vendor Ledger" }
  ];

  function CreditRegister({ user }) {
    const [tab, setTab] = useState("dashboard");
    const [customers, setCustomers] = useState([]);
    const [vendors, setVendors] = useState([]);
    const [stats, setStats] = useState(null);
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState("");
    const [error, setError] = useState("");

    const [customerSearch, setCustomerSearch] = useState("");
    const [vendorSearch, setVendorSearch] = useState("");

    const [newCustomer, setNewCustomer] = useState({ name: "", phone: "", address: "", creditLimit: "", notes: "" });
    const [selectedCustomerId, setSelectedCustomerId] = useState(null);
    const [editCustomer, setEditCustomer] = useState({ name: "", phone: "", address: "", creditLimit: "", notes: "" });

    const [newVendor, setNewVendor] = useState({ name: "", phone: "", address: "", notes: "" });
    const [selectedVendorId, setSelectedVendorId] = useState(null);
    const [editVendor, setEditVendor] = useState({ name: "", phone: "", address: "", notes: "" });

    const [saleCustomerId, setSaleCustomerId] = useState("");
    const [saleTotal, setSaleTotal] = useState("");
    const [salePaid, setSalePaid] = useState("");
    const [saleDescription, setSaleDescription] = useState("");

    const [paymentCustomerId, setPaymentCustomerId] = useState("");
    const [paymentAmount, setPaymentAmount] = useState("");
    const [paymentNote, setPaymentNote] = useState("");

    const [ledgerCustomerId, setLedgerCustomerId] = useState("");
    const [customerLedger, setCustomerLedger] = useState({ customer: null, ledger: [] });

    const [purchaseVendorId, setPurchaseVendorId] = useState("");
    const [purchaseTotal, setPurchaseTotal] = useState("");
    const [purchasePaid, setPurchasePaid] = useState("");
    const [purchaseDescription, setPurchaseDescription] = useState("");

    const [vendorPaymentVendorId, setVendorPaymentVendorId] = useState("");
    const [vendorPaymentAmount, setVendorPaymentAmount] = useState("");
    const [vendorPaymentNote, setVendorPaymentNote] = useState("");

    const [ledgerVendorId, setLedgerVendorId] = useState("");
    const [vendorLedger, setVendorLedger] = useState({ vendor: null, ledger: [] });

    const filteredCustomers = useMemo(() => {
      const q = customerSearch.trim().toLowerCase();
      if (!q) return customers;
      return customers.filter((c) => String(c.name || "").toLowerCase().includes(q) || String(c.phone || "").includes(q));
    }, [customers, customerSearch]);

    const filteredVendors = useMemo(() => {
      const q = vendorSearch.trim().toLowerCase();
      if (!q) return vendors;
      return vendors.filter((v) => String(v.name || "").toLowerCase().includes(q) || String(v.phone || "").includes(q));
    }, [vendors, vendorSearch]);

    async function refreshCustomers(keepSelection = true) {
      const rows = await credit.listCustomers();
      setCustomers(rows);
      if (!rows.length) {
        setSelectedCustomerId(null);
      } else if (!keepSelection || !rows.some((c) => c.id === selectedCustomerId)) {
        setSelectedCustomerId(null);
      }
    }

    async function refreshVendors(keepSelection = true) {
      const rows = await credit.listVendors();
      setVendors(rows);
      if (!rows.length) {
        setSelectedVendorId(null);
      } else if (!keepSelection || !rows.some((v) => v.id === selectedVendorId)) {
        setSelectedVendorId(null);
      }
    }

    async function refreshDashboard() {
      const data = await credit.getDashboardStats();
      setStats(data);
    }

    useEffect(() => {
      refreshCustomers(true).catch((e) => setError(e.message || "Failed to load customers."));
      refreshVendors(true).catch((e) => setError(e.message || "Failed to load vendors."));
      refreshDashboard().catch((e) => setError(e.message || "Failed to load dashboard."));
    }, []);

    useEffect(() => {
      const target = customers.find((c) => c.id === selectedCustomerId);
      if (!target) {
        setEditCustomer({ name: "", phone: "", address: "", creditLimit: "", notes: "" });
        return;
      }
      setEditCustomer({
        name: target.name || "",
        phone: target.phone || "",
        address: target.address || "",
        creditLimit: (Number(target.credit_limit_cents || 0) / 100).toFixed(2),
        notes: target.notes || ""
      });
    }, [selectedCustomerId, customers]);

    useEffect(() => {
      const target = vendors.find((v) => v.id === selectedVendorId);
      if (!target) {
        setEditVendor({ name: "", phone: "", address: "", notes: "" });
        return;
      }
      setEditVendor({
        name: target.name || "",
        phone: target.phone || "",
        address: target.address || "",
        notes: target.notes || ""
      });
    }, [selectedVendorId, vendors]);

    async function createCustomer() {
      setError("");
      setMessage("");
      const name = newCustomer.name.trim();
      if (!name) {
        setError("Customer name is required.");
        return;
      }
      const creditLimitCents = Math.round(Number(newCustomer.creditLimit || 0) * 100);
      if (!Number.isFinite(creditLimitCents) || creditLimitCents < 0) {
        setError("Enter a valid credit limit.");
        return;
      }
      setBusy(true);
      try {
        await credit.createCustomer(user.id, {
          name,
          phone: newCustomer.phone.trim(),
          address: newCustomer.address.trim(),
          creditLimitCents,
          notes: newCustomer.notes.trim()
        });
        setNewCustomer({ name: "", phone: "", address: "", creditLimit: "", notes: "" });
        setMessage("Customer added.");
        await refreshCustomers(false);
        await refreshDashboard();
      } catch (e) {
        setError(e.message || "Failed to add customer.");
      } finally {
        setBusy(false);
      }
    }

    async function saveCustomer() {
      if (!selectedCustomerId) return;
      setError("");
      setMessage("");
      const name = editCustomer.name.trim();
      if (!name) {
        setError("Customer name is required.");
        return;
      }
      const creditLimitCents = Math.round(Number(editCustomer.creditLimit || 0) * 100);
      if (!Number.isFinite(creditLimitCents) || creditLimitCents < 0) {
        setError("Enter a valid credit limit.");
        return;
      }
      setBusy(true);
      try {
        await credit.updateCustomer(user.id, selectedCustomerId, {
          name,
          phone: editCustomer.phone.trim(),
          address: editCustomer.address.trim(),
          creditLimitCents,
          notes: editCustomer.notes.trim()
        });
        setMessage("Customer updated.");
        await refreshCustomers(true);
        await refreshDashboard();
      } catch (e) {
        setError(e.message || "Failed to update customer.");
      } finally {
        setBusy(false);
      }
    }

    async function deleteCustomer() {
      if (!selectedCustomerId) return;
      const target = customers.find((c) => c.id === selectedCustomerId);
      const ok = window.confirm(`Delete customer ${target?.name || ""}?`);
      if (!ok) return;
      setError("");
      setMessage("");
      setBusy(true);
      try {
        await credit.deleteCustomer(user.id, selectedCustomerId);
        setSelectedCustomerId(null);
        setMessage("Customer deleted.");
        await refreshCustomers(false);
        await refreshDashboard();
      } catch (e) {
        setError(e.message || "Failed to delete customer.");
      } finally {
        setBusy(false);
      }
    }

    async function createSale() {
      setError("");
      setMessage("");
      const customerId = Number(saleCustomerId || 0);
      const totalCents = Math.round(Number(saleTotal || 0) * 100);
      const paidCents = Math.round(Number(salePaid || 0) * 100);
      if (!customerId) {
        setError("Select a customer.");
        return;
      }
      if (totalCents <= 0) {
        setError("Enter a valid total amount.");
        return;
      }
      if (paidCents < 0 || paidCents > totalCents) {
        setError("Paid amount cannot exceed total.");
        return;
      }
      setBusy(true);
      try {
        await credit.createSale(user.id, {
          customerId,
          totalCents,
          paidCents,
          description: saleDescription.trim()
        });
        setSaleTotal("");
        setSalePaid("");
        setSaleDescription("");
        setMessage("Sale recorded.");
        await refreshCustomers(true);
        await refreshDashboard();
      } catch (e) {
        setError(e.message || "Failed to add sale.");
      } finally {
        setBusy(false);
      }
    }

    async function createPayment() {
      setError("");
      setMessage("");
      const customerId = Number(paymentCustomerId || 0);
      const amountCents = Math.round(Number(paymentAmount || 0) * 100);
      if (!customerId) {
        setError("Select a customer.");
        return;
      }
      if (amountCents <= 0) {
        setError("Enter a valid payment amount.");
        return;
      }
      setBusy(true);
      try {
        await credit.createPayment(user.id, { customerId, amountCents, note: paymentNote.trim() });
        setPaymentAmount("");
        setPaymentNote("");
        setMessage("Payment recorded.");
        await refreshCustomers(true);
        await refreshDashboard();
      } catch (e) {
        setError(e.message || "Failed to record payment.");
      } finally {
        setBusy(false);
      }
    }

    async function loadCustomerLedger() {
      const customerId = Number(ledgerCustomerId || 0);
      if (!customerId) {
        setCustomerLedger({ customer: null, ledger: [] });
        return;
      }
      setBusy(true);
      setError("");
      setMessage("");
      try {
        const data = await credit.getCustomerLedger(customerId);
        setCustomerLedger(data);
      } catch (e) {
        setError(e.message || "Failed to load ledger.");
      } finally {
        setBusy(false);
      }
    }

    async function createVendor() {
      setError("");
      setMessage("");
      const name = newVendor.name.trim();
      if (!name) {
        setError("Vendor name is required.");
        return;
      }
      setBusy(true);
      try {
        await credit.createVendor(user.id, {
          name,
          phone: newVendor.phone.trim(),
          address: newVendor.address.trim(),
          notes: newVendor.notes.trim()
        });
        setNewVendor({ name: "", phone: "", address: "", notes: "" });
        setMessage("Vendor added.");
        await refreshVendors(false);
        await refreshDashboard();
      } catch (e) {
        setError(e.message || "Failed to add vendor.");
      } finally {
        setBusy(false);
      }
    }

    async function saveVendor() {
      if (!selectedVendorId) return;
      setError("");
      setMessage("");
      const name = editVendor.name.trim();
      if (!name) {
        setError("Vendor name is required.");
        return;
      }
      setBusy(true);
      try {
        await credit.updateVendor(user.id, selectedVendorId, {
          name,
          phone: editVendor.phone.trim(),
          address: editVendor.address.trim(),
          notes: editVendor.notes.trim()
        });
        setMessage("Vendor updated.");
        await refreshVendors(true);
        await refreshDashboard();
      } catch (e) {
        setError(e.message || "Failed to update vendor.");
      } finally {
        setBusy(false);
      }
    }

    async function deleteVendor() {
      if (!selectedVendorId) return;
      const target = vendors.find((v) => v.id === selectedVendorId);
      const ok = window.confirm(`Delete vendor ${target?.name || ""}?`);
      if (!ok) return;
      setError("");
      setMessage("");
      setBusy(true);
      try {
        await credit.deleteVendor(user.id, selectedVendorId);
        setSelectedVendorId(null);
        setMessage("Vendor deleted.");
        await refreshVendors(false);
        await refreshDashboard();
      } catch (e) {
        setError(e.message || "Failed to delete vendor.");
      } finally {
        setBusy(false);
      }
    }

    async function createPurchase() {
      setError("");
      setMessage("");
      const vendorId = Number(purchaseVendorId || 0);
      const totalCents = Math.round(Number(purchaseTotal || 0) * 100);
      const paidCents = Math.round(Number(purchasePaid || 0) * 100);
      if (!vendorId) {
        setError("Select a vendor.");
        return;
      }
      if (totalCents <= 0) {
        setError("Enter a valid total amount.");
        return;
      }
      if (paidCents < 0 || paidCents > totalCents) {
        setError("Paid amount cannot exceed total.");
        return;
      }
      setBusy(true);
      try {
        await credit.createPurchase(user.id, {
          vendorId,
          totalCents,
          paidCents,
          description: purchaseDescription.trim()
        });
        setPurchaseTotal("");
        setPurchasePaid("");
        setPurchaseDescription("");
        setMessage("Purchase recorded.");
        await refreshVendors(true);
        await refreshDashboard();
      } catch (e) {
        setError(e.message || "Failed to add purchase.");
      } finally {
        setBusy(false);
      }
    }

    async function createVendorPayment() {
      setError("");
      setMessage("");
      const vendorId = Number(vendorPaymentVendorId || 0);
      const amountCents = Math.round(Number(vendorPaymentAmount || 0) * 100);
      if (!vendorId) {
        setError("Select a vendor.");
        return;
      }
      if (amountCents <= 0) {
        setError("Enter a valid payment amount.");
        return;
      }
      setBusy(true);
      try {
        await credit.createVendorPayment(user.id, { vendorId, amountCents, note: vendorPaymentNote.trim() });
        setVendorPaymentAmount("");
        setVendorPaymentNote("");
        setMessage("Payment recorded.");
        await refreshVendors(true);
        await refreshDashboard();
      } catch (e) {
        setError(e.message || "Failed to record payment.");
      } finally {
        setBusy(false);
      }
    }

    async function loadVendorLedger() {
      const vendorId = Number(ledgerVendorId || 0);
      if (!vendorId) {
        setVendorLedger({ vendor: null, ledger: [] });
        return;
      }
      setBusy(true);
      setError("");
      setMessage("");
      try {
        const data = await credit.getVendorLedger(vendorId);
        setVendorLedger(data);
      } catch (e) {
        setError(e.message || "Failed to load vendor ledger.");
      } finally {
        setBusy(false);
      }
    }

    function buildLedgerShareText(name, balanceCents, rows, isVendor) {
      const title = isVendor ? "Vendor Ledger" : "Customer Ledger";
      const lines = [`${title}: ${name}`, `Balance: ${money(balanceCents)}`, ""];
      const recent = rows.slice(-20);
      for (const row of recent) {
        const dt = row.created_at ? new Date(row.created_at).toLocaleString() : "-";
        const debit = row.debit_cents ? money(row.debit_cents) : "-";
        const creditAmt = row.credit_cents ? money(row.credit_cents) : "-";
        lines.push(`${dt} | ${row.entry_type} | DR ${debit} | CR ${creditAmt} | Bal ${money(row.balance_cents || 0)}`);
      }
      return lines.join("\n");
    }

    async function shareCustomerLedger() {
      if (!customerLedger.customer) return;
      const phone = String(customerLedger.customer.phone || "").replace(/\D/g, "");
      const text = buildLedgerShareText(customerLedger.customer.name, customerLedger.customer.current_balance_cents || 0, customerLedger.ledger || [], false);
      const url = phone ? `https://wa.me/${phone}?text=${encodeURIComponent(text)}` : `https://wa.me/?text=${encodeURIComponent(text)}`;
      try {
        await credit.openExternal(url);
      } catch (e) {
        setError(e.message || "Failed to open WhatsApp.");
      }
    }

    async function shareVendorLedger() {
      if (!vendorLedger.vendor) return;
      const phone = String(vendorLedger.vendor.phone || "").replace(/\D/g, "");
      const text = buildLedgerShareText(vendorLedger.vendor.name, vendorLedger.vendor.current_balance_cents || 0, vendorLedger.ledger || [], true);
      const url = phone ? `https://wa.me/${phone}?text=${encodeURIComponent(text)}` : `https://wa.me/?text=${encodeURIComponent(text)}`;
      try {
        await credit.openExternal(url);
      } catch (e) {
        setError(e.message || "Failed to open WhatsApp.");
      }
    }

    return (
      <div className="screen-grid credit-register">
        <div className="card credit-header">
          <div className="credit-title-row">
            <h2>Credit Register</h2>
            <div className="credit-tabs">
              {TABS.map((t) => (
                <button
                  key={t.key}
                  className={tab === t.key ? "credit-tab active" : "credit-tab"}
                  onClick={() => setTab(t.key)}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          <p className="muted">Track customer credit and vendor payables without impacting POS sales.</p>
        </div>

        {tab === "dashboard" && (
          <div className="card">
            <h3>Dashboard</h3>
            <div className="credit-stats">
              <div className="credit-stat">
                <span>Customer Outstanding</span>
                <strong>{money(stats?.customerOutstandingTotal || 0)}</strong>
                <small>{stats?.customerDueCount || 0} customers due</small>
              </div>
              <div className="credit-stat">
                <span>Today Sales</span>
                <strong>{money(stats?.todaySalesTotal || 0)}</strong>
                <small>Today Payments: {money(stats?.todayPaymentsTotal || 0)}</small>
              </div>
              <div className="credit-stat">
                <span>Vendor Payables</span>
                <strong>{money(stats?.vendorPayableTotal || 0)}</strong>
                <small>Today Purchases: {money(stats?.todayPurchasesTotal || 0)}</small>
              </div>
              <div className="credit-stat">
                <span>Vendor Payments Today</span>
                <strong>{money(stats?.todayVendorPaymentsTotal || 0)}</strong>
                <small>Updated: {new Date().toLocaleTimeString()}</small>
              </div>
            </div>
            <div className="credit-top-grid">
              <div>
                <h4>Top Customers</h4>
                {(stats?.topCustomers || []).length === 0 ? (
                  <p className="muted">No outstanding customers.</p>
                ) : (
                  <ul className="credit-top-list">
                    {(stats?.topCustomers || []).map((c) => (
                      <li key={c.id}>
                        <span>{c.name}</span>
                        <b>{money(c.current_balance_cents || 0)}</b>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <h4>Top Vendors</h4>
                {(stats?.topVendors || []).length === 0 ? (
                  <p className="muted">No outstanding vendors.</p>
                ) : (
                  <ul className="credit-top-list">
                    {(stats?.topVendors || []).map((v) => (
                      <li key={v.id}>
                        <span>{v.name}</span>
                        <b>{money(v.current_balance_cents || 0)}</b>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        )}

        {tab === "customers" && (
          <div className="card">
            <h3>Customers</h3>
            <div className="row credit-form">
              <input placeholder="Name" value={newCustomer.name} onChange={(e) => setNewCustomer((p) => ({ ...p, name: e.target.value }))} />
              <input placeholder="Phone" value={newCustomer.phone} onChange={(e) => setNewCustomer((p) => ({ ...p, phone: e.target.value }))} />
              <input placeholder="Address" value={newCustomer.address} onChange={(e) => setNewCustomer((p) => ({ ...p, address: e.target.value }))} />
              <input placeholder="Credit limit" value={newCustomer.creditLimit} onChange={(e) => setNewCustomer((p) => ({ ...p, creditLimit: e.target.value }))} />
              <input placeholder="Notes" value={newCustomer.notes} onChange={(e) => setNewCustomer((p) => ({ ...p, notes: e.target.value }))} />
              <button className="primary" disabled={busy} onClick={createCustomer}>Add Customer</button>
            </div>
            <div className="row credit-toolbar">
              <input placeholder="Search customers" value={customerSearch} onChange={(e) => setCustomerSearch(e.target.value)} />
              <span className="muted">Total: {filteredCustomers.length}</span>
            </div>
            <div className="credit-table-wrap">
              <table className="table credit-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Phone</th>
                    <th>Address</th>
                    <th>Limit</th>
                    <th>Balance</th>
                    <th>Notes</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCustomers.map((c) => {
                    const isSelected = selectedCustomerId === c.id;
                    return (
                      <tr key={c.id} className={isSelected ? "selected-row" : ""} onClick={() => setSelectedCustomerId(c.id)}>
                        <td>{isSelected ? <input value={editCustomer.name} onChange={(e) => setEditCustomer((p) => ({ ...p, name: e.target.value }))} /> : c.name}</td>
                        <td>{isSelected ? <input value={editCustomer.phone} onChange={(e) => setEditCustomer((p) => ({ ...p, phone: e.target.value }))} /> : (c.phone || "-")}</td>
                        <td>{isSelected ? <input value={editCustomer.address} onChange={(e) => setEditCustomer((p) => ({ ...p, address: e.target.value }))} /> : (c.address || "-")}</td>
                        <td>{isSelected ? <input value={editCustomer.creditLimit} onChange={(e) => setEditCustomer((p) => ({ ...p, creditLimit: e.target.value }))} /> : money(c.credit_limit_cents || 0)}</td>
                        <td><strong>{money(c.current_balance_cents || 0)}</strong></td>
                        <td>{isSelected ? <input value={editCustomer.notes} onChange={(e) => setEditCustomer((p) => ({ ...p, notes: e.target.value }))} /> : (c.notes || "-")}</td>
                        <td>
                          {isSelected ? (
                            <div className="credit-row-actions">
                              <button className="primary" disabled={busy} onClick={saveCustomer}>Save</button>
                              <button className="danger" disabled={busy} onClick={deleteCustomer}>Delete</button>
                            </div>
                          ) : (
                            <button>View</button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === "new-sale" && (
          <div className="card">
            <h3>New Sale (Customer Credit)</h3>
            <div className="row credit-form">
              <select value={saleCustomerId} onChange={(e) => setSaleCustomerId(e.target.value)}>
                <option value="">Select customer</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <input placeholder="Total amount" value={saleTotal} onChange={(e) => setSaleTotal(e.target.value)} />
              <input placeholder="Paid amount" value={salePaid} onChange={(e) => setSalePaid(e.target.value)} />
              <input placeholder="Description" value={saleDescription} onChange={(e) => setSaleDescription(e.target.value)} />
              <button className="primary" disabled={busy} onClick={createSale}>Record Sale</button>
            </div>
            <p className="muted">Any remaining amount is added to customer balance.</p>
          </div>
        )}

        {tab === "payments" && (
          <div className="card">
            <h3>Receive Payment</h3>
            <div className="row credit-form">
              <select value={paymentCustomerId} onChange={(e) => setPaymentCustomerId(e.target.value)}>
                <option value="">Select customer</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <input placeholder="Amount" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} />
              <input placeholder="Note" value={paymentNote} onChange={(e) => setPaymentNote(e.target.value)} />
              <button className="primary" disabled={busy} onClick={createPayment}>Record Payment</button>
            </div>
          </div>
        )}

        {tab === "ledger" && (
          <div className="card">
            <h3>Customer Ledger</h3>
            <div className="row credit-form">
              <select value={ledgerCustomerId} onChange={(e) => setLedgerCustomerId(e.target.value)}>
                <option value="">Select customer</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <button className="primary" disabled={busy} onClick={loadCustomerLedger}>Load Ledger</button>
              <button className="secondary" disabled={!customerLedger.customer} onClick={() => window.print()}>Print</button>
              <button className="secondary" disabled={!customerLedger.customer} onClick={shareCustomerLedger}>Share WhatsApp</button>
            </div>
            {customerLedger.customer && (
              <div className="credit-ledger-wrap credit-ledger-print">
                <div className="credit-ledger-head">
                  <div>
                    <h4>{customerLedger.customer.name}</h4>
                    <p className="muted">{customerLedger.customer.phone || "-"} {customerLedger.customer.address ? `| ${customerLedger.customer.address}` : ""}</p>
                  </div>
                  <div className="credit-ledger-balance">
                    <span>Balance</span>
                    <strong>{money(customerLedger.customer.current_balance_cents || 0)}</strong>
                  </div>
                </div>
                <div className="credit-table-wrap">
                  <table className="table credit-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Type</th>
                        <th>Debit</th>
                        <th>Credit</th>
                        <th>Balance</th>
                        <th>Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(customerLedger.ledger || []).map((row) => (
                        <tr key={row.id}>
                          <td>{row.created_at ? new Date(row.created_at).toLocaleString() : "-"}</td>
                          <td>{row.entry_type}</td>
                          <td>{row.debit_cents ? money(row.debit_cents) : "-"}</td>
                          <td>{row.credit_cents ? money(row.credit_cents) : "-"}</td>
                          <td><strong>{money(row.balance_cents || 0)}</strong></td>
                          <td>{row.description || row.note || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {tab === "vendors" && (
          <div className="card">
            <h3>Vendors</h3>
            <div className="row credit-form">
              <input placeholder="Name" value={newVendor.name} onChange={(e) => setNewVendor((p) => ({ ...p, name: e.target.value }))} />
              <input placeholder="Phone" value={newVendor.phone} onChange={(e) => setNewVendor((p) => ({ ...p, phone: e.target.value }))} />
              <input placeholder="Address" value={newVendor.address} onChange={(e) => setNewVendor((p) => ({ ...p, address: e.target.value }))} />
              <input placeholder="Notes" value={newVendor.notes} onChange={(e) => setNewVendor((p) => ({ ...p, notes: e.target.value }))} />
              <button className="primary" disabled={busy} onClick={createVendor}>Add Vendor</button>
            </div>
            <div className="row credit-toolbar">
              <input placeholder="Search vendors" value={vendorSearch} onChange={(e) => setVendorSearch(e.target.value)} />
              <span className="muted">Total: {filteredVendors.length}</span>
            </div>
            <div className="credit-table-wrap">
              <table className="table credit-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Phone</th>
                    <th>Address</th>
                    <th>Balance</th>
                    <th>Notes</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredVendors.map((v) => {
                    const isSelected = selectedVendorId === v.id;
                    return (
                      <tr key={v.id} className={isSelected ? "selected-row" : ""} onClick={() => setSelectedVendorId(v.id)}>
                        <td>{isSelected ? <input value={editVendor.name} onChange={(e) => setEditVendor((p) => ({ ...p, name: e.target.value }))} /> : v.name}</td>
                        <td>{isSelected ? <input value={editVendor.phone} onChange={(e) => setEditVendor((p) => ({ ...p, phone: e.target.value }))} /> : (v.phone || "-")}</td>
                        <td>{isSelected ? <input value={editVendor.address} onChange={(e) => setEditVendor((p) => ({ ...p, address: e.target.value }))} /> : (v.address || "-")}</td>
                        <td><strong>{money(v.current_balance_cents || 0)}</strong></td>
                        <td>{isSelected ? <input value={editVendor.notes} onChange={(e) => setEditVendor((p) => ({ ...p, notes: e.target.value }))} /> : (v.notes || "-")}</td>
                        <td>
                          {isSelected ? (
                            <div className="credit-row-actions">
                              <button className="primary" disabled={busy} onClick={saveVendor}>Save</button>
                              <button className="danger" disabled={busy} onClick={deleteVendor}>Delete</button>
                            </div>
                          ) : (
                            <button>View</button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === "new-purchase" && (
          <div className="card">
            <h3>New Purchase (Vendor Payable)</h3>
            <div className="row credit-form">
              <select value={purchaseVendorId} onChange={(e) => setPurchaseVendorId(e.target.value)}>
                <option value="">Select vendor</option>
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>{v.name}</option>
                ))}
              </select>
              <input placeholder="Total amount" value={purchaseTotal} onChange={(e) => setPurchaseTotal(e.target.value)} />
              <input placeholder="Paid amount" value={purchasePaid} onChange={(e) => setPurchasePaid(e.target.value)} />
              <input placeholder="Description" value={purchaseDescription} onChange={(e) => setPurchaseDescription(e.target.value)} />
              <button className="primary" disabled={busy} onClick={createPurchase}>Record Purchase</button>
            </div>
            <p className="muted">Any remaining amount is added to vendor balance.</p>
          </div>
        )}

        {tab === "vendor-payments" && (
          <div className="card">
            <h3>Vendor Payment</h3>
            <div className="row credit-form">
              <select value={vendorPaymentVendorId} onChange={(e) => setVendorPaymentVendorId(e.target.value)}>
                <option value="">Select vendor</option>
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>{v.name}</option>
                ))}
              </select>
              <input placeholder="Amount" value={vendorPaymentAmount} onChange={(e) => setVendorPaymentAmount(e.target.value)} />
              <input placeholder="Note" value={vendorPaymentNote} onChange={(e) => setVendorPaymentNote(e.target.value)} />
              <button className="primary" disabled={busy} onClick={createVendorPayment}>Record Payment</button>
            </div>
          </div>
        )}

        {tab === "vendor-ledger" && (
          <div className="card">
            <h3>Vendor Ledger</h3>
            <div className="row credit-form">
              <select value={ledgerVendorId} onChange={(e) => setLedgerVendorId(e.target.value)}>
                <option value="">Select vendor</option>
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>{v.name}</option>
                ))}
              </select>
              <button className="primary" disabled={busy} onClick={loadVendorLedger}>Load Ledger</button>
              <button className="secondary" disabled={!vendorLedger.vendor} onClick={() => window.print()}>Print</button>
              <button className="secondary" disabled={!vendorLedger.vendor} onClick={shareVendorLedger}>Share WhatsApp</button>
            </div>
            {vendorLedger.vendor && (
              <div className="credit-ledger-wrap credit-ledger-print">
                <div className="credit-ledger-head">
                  <div>
                    <h4>{vendorLedger.vendor.name}</h4>
                    <p className="muted">{vendorLedger.vendor.phone || "-"} {vendorLedger.vendor.address ? `| ${vendorLedger.vendor.address}` : ""}</p>
                  </div>
                  <div className="credit-ledger-balance">
                    <span>Balance</span>
                    <strong>{money(vendorLedger.vendor.current_balance_cents || 0)}</strong>
                  </div>
                </div>
                <div className="credit-table-wrap">
                  <table className="table credit-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Type</th>
                        <th>Debit</th>
                        <th>Credit</th>
                        <th>Balance</th>
                        <th>Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(vendorLedger.ledger || []).map((row) => (
                        <tr key={row.id}>
                          <td>{row.created_at ? new Date(row.created_at).toLocaleString() : "-"}</td>
                          <td>{row.entry_type}</td>
                          <td>{row.debit_cents ? money(row.debit_cents) : "-"}</td>
                          <td>{row.credit_cents ? money(row.credit_cents) : "-"}</td>
                          <td><strong>{money(row.balance_cents || 0)}</strong></td>
                          <td>{row.description || row.note || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {message && <div className="success">{message}</div>}
        {error && <div className="error">{error}</div>}
      </div>
    );
  }

  window.POSComponents = window.POSComponents || {};
  window.POSComponents.CreditRegister = CreditRegister;
})();
