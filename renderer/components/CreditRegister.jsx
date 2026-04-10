
(function () {
  const { useEffect, useMemo, useState } = React;
  const { money } = window.POSUtils.db;
  const credit = window.POSUtils.credit;

  const TABS = [
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
    const [tab, setTab] = useState("customers");
    const [customers, setCustomers] = useState([]);
    const [vendors, setVendors] = useState([]);
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


    useEffect(() => {
      refreshCustomers(true).catch((e) => setError(e.message || "Failed to load customers."));
      refreshVendors(true).catch((e) => setError(e.message || "Failed to load vendors."));
      credit.getDashboardStats().catch(() => {});
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
      <div className="flex flex-col h-full gap-6 p-2 overflow-hidden">
        {/* Header and Tabs */}
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-black text-gray-900 leading-none">Credit Register</h2>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-2 px-1">Accounts, Payables & Business Ledger</p>
            </div>
            <div className="flex flex-wrap gap-1 p-1 bg-gray-50 rounded-2xl border border-gray-100 max-w-full overflow-x-auto scrollbar-hide">
              {TABS.map((t) => (
                <button
                  key={t.key}
                  className={`px-3 py-2 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all whitespace-nowrap ${
                    tab === t.key 
                    ? "bg-teal-600 text-white shadow-lg shadow-teal-100 scale-105" 
                    : "text-gray-400 hover:text-gray-600 hover:bg-white"
                  }`}
                  onClick={() => setTab(t.key)}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Tab Content */}
        <div className="flex-1 min-h-0 flex flex-col gap-6 overflow-y-auto pr-1">
          {tab === "customers" && (
            <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 space-y-8 animate-in fade-in duration-300">
               <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 items-end">
                  {Object.keys(newCustomer).map(key => (
                    <div key={key} className="space-y-1">
                      <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest pl-1">{key.replace(/([A-Z])/g, ' $1')}</label>
                      <input 
                        className="w-full px-4 py-2 bg-gray-50 border border-gray-100 rounded-xl text-xs font-bold focus:ring-2 focus:ring-teal-500 outline-none"
                        placeholder={`Enter ${key}...`}
                        value={newCustomer[key]} 
                        onChange={(e) => setNewCustomer((p) => ({ ...p, [key]: e.target.value }))} 
                      />
                    </div>
                  ))}
                  <button className="py-2.5 bg-gray-900 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-gray-800 transition-all shadow-lg shadow-gray-200" disabled={busy} onClick={createCustomer}>
                    Add New
                  </button>
               </div>

               <div className="space-y-4">
                  <div className="flex justify-between items-center px-1">
                    <div className="relative w-64">
                      <input 
                        className="w-full pl-8 pr-4 py-2 bg-gray-50 border border-transparent rounded-xl text-xs focus:bg-white focus:border-teal-100 outline-none transition-all"
                        placeholder="Search names or phones..." 
                        value={customerSearch} 
                        onChange={(e) => setCustomerSearch(e.target.value)} 
                      />
                      <span className="absolute left-2.5 top-2.5 text-gray-300">🔍</span>
                    </div>
                    <span className="text-[10px] font-black text-gray-400 uppercase">Showing {filteredCustomers.length} Records</span>
                  </div>

                  <div className="border border-gray-50 rounded-2xl overflow-hidden">
                    <table className="w-full text-left">
                      <thead className="bg-gray-50/50 text-[9px] font-black text-gray-400 uppercase tracking-widest">
                        <tr>
                          <th className="px-5 py-3">Customer</th>
                          <th className="px-5 py-3">Phone/Address</th>
                          <th className="px-5 py-3">Credit Limit</th>
                          <th className="px-5 py-3">Balance</th>
                          <th className="px-5 py-3">Notes</th>
                          <th className="px-5 py-3"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50 text-xs">
                        {filteredCustomers.map((c) => {
                          const isSelected = selectedCustomerId === c.id;
                          return (
                            <tr key={c.id} className={`hover:bg-gray-50/50 transition-colors cursor-pointer ${isSelected ? 'bg-teal-50/30' : ''}`} onClick={() => setSelectedCustomerId(c.id)}>
                              <td className="px-5 py-4">
                                {isSelected ? 
                                  <input className="bg-white border border-teal-200 rounded px-2 py-1 font-bold outline-none" value={editCustomer.name} onClick={e => e.stopPropagation()} onChange={(e) => setEditCustomer((p) => ({ ...p, name: e.target.value }))} /> 
                                  : <div className="font-bold text-gray-800">{c.name}</div>}
                              </td>
                              <td className="px-5 py-4">
                                {isSelected ? (
                                  <div className="space-y-1" onClick={e => e.stopPropagation()}>
                                    <input className="block bg-white border border-gray-100 rounded px-2 py-0.5 text-[10px]" value={editCustomer.phone} onChange={(e) => setEditCustomer((p) => ({ ...p, phone: e.target.value }))} placeholder="Phone" />
                                    <input className="block bg-white border border-gray-100 rounded px-2 py-0.5 text-[10px]" value={editCustomer.address} onChange={(e) => setEditCustomer((p) => ({ ...p, address: e.target.value }))} placeholder="Address" />
                                  </div>
                                ) : (
                                  <div className="text-gray-400 font-medium">
                                    <div>{c.phone || "-"}</div>
                                    <div className="text-[9px] uppercase">{c.address || "-"}</div>
                                  </div>
                                )}
                              </td>
                              <td className="px-5 py-4">
                                  {isSelected ? 
                                    <input className="bg-white border border-gray-100 rounded px-2 py-1 outline-none w-24" value={editCustomer.creditLimit} onClick={e => e.stopPropagation()} onChange={(e) => setEditCustomer((p) => ({ ...p, creditLimit: e.target.value }))} /> 
                                    : <span className="text-gray-500">{money(c.credit_limit_cents || 0)}</span>}
                              </td>
                              <td className="px-5 py-4">
                                  <span className="font-black text-teal-600">{money(c.current_balance_cents || 0)}</span>
                              </td>
                              <td className="px-5 py-4 text-gray-400">
                                  {isSelected ? 
                                    <input className="bg-white border border-gray-100 rounded px-2 py-1 outline-none" value={editCustomer.notes} onClick={e => e.stopPropagation()} onChange={(e) => setEditCustomer((p) => ({ ...p, notes: e.target.value }))} /> 
                                    : (c.notes || "-")}
                              </td>
                              <td className="px-5 py-4 text-right">
                                {isSelected ? (
                                  <div className="flex justify-end gap-2" onClick={e => e.stopPropagation()}>
                                    <button className="px-3 py-1 bg-teal-600 text-white rounded-lg font-bold text-[10px]" onClick={saveCustomer}>Save</button>
                                    <button className="px-3 py-1 bg-red-50 text-red-500 rounded-lg font-bold text-[10px]" onClick={deleteCustomer}>Del</button>
                                  </div>
                                ) : (
                                  <button className="text-[10px] font-black text-gray-300 uppercase hover:text-teal-600">Edit</button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
               </div>
            </div>
          )}

          {tab === "new-sale" && (
            <div className="max-w-2xl bg-white rounded-3xl shadow-sm border border-gray-100 p-8 space-y-6 mx-auto animate-in fade-in zoom-in-95 duration-300">
               <div>
                 <h3 className="text-xl font-black text-gray-900 leading-none">Record Credit Sale</h3>
                 <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-2">Any unpaid amount will be added to balance</p>
               </div>
               
               <div className="space-y-4 pt-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest pl-1">Customer</label>
                    <select className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-bold outline-none focus:ring-2 focus:ring-teal-500" value={saleCustomerId} onChange={(e) => setSaleCustomerId(e.target.value)}>
                      <option value="">Select customer...</option>
                      {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest pl-1">Total Bill</label>
                      <input className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-2xl text-lg font-black outline-none focus:ring-2 focus:ring-teal-500" placeholder="0.00" value={saleTotal} onChange={(e) => setSaleTotal(e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-teal-600 uppercase tracking-widest pl-1">Paid Now</label>
                      <input className="w-full px-4 py-3 bg-teal-50/30 border border-teal-100 rounded-2xl text-lg font-black text-teal-700 outline-none focus:ring-2 focus:ring-teal-500" placeholder="0.00" value={salePaid} onChange={(e) => setSalePaid(e.target.value)} />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest pl-1">Description / Memo</label>
                    <input className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-2xl text-sm outline-none focus:ring-2 focus:ring-teal-500" placeholder="e.g. Monthly ration / ID-987" value={saleDescription} onChange={(e) => setSaleDescription(e.target.value)} />
                  </div>

                  <button className="w-full py-4 bg-gray-900 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-gray-800 shadow-xl shadow-gray-200 transition-all mt-4" disabled={busy} onClick={createSale}>
                    Complete Transaction
                  </button>
               </div>
            </div>
          )}

          {tab === "payments" && (
             <div className="max-w-md bg-white rounded-3xl shadow-sm border border-gray-100 p-8 space-y-6 mx-auto animate-in slide-in-from-bottom-4 duration-300">
               <div className="text-center space-y-2">
                 <div className="w-16 h-16 bg-teal-50 text-teal-600 rounded-full flex items-center justify-center mx-auto text-2xl font-black">PKR</div>
                 <h3 className="text-xl font-black text-gray-900 uppercase">Receive Payment</h3>
               </div>
               
               <div className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Pick Customer</label>
                    <select className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-bold outline-none" value={paymentCustomerId} onChange={(e) => setPaymentCustomerId(e.target.value)}>
                      <option value="">Select...</option>
                      {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Amount Received</label>
                    <input className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-2xl text-2xl font-black text-gray-900 outline-none" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} placeholder="0" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Reference Note</label>
                    <input className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-2xl text-sm outline-none" value={paymentNote} onChange={(e) => setPaymentNote(e.target.value)} placeholder="e.g. Cash / Cheque #123" />
                  </div>
                  <button className="w-full py-4 bg-teal-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-teal-700 shadow-lg shadow-teal-100 transition-all" disabled={busy} onClick={createPayment}>
                    Record Deposit
                  </button>
               </div>
             </div>
          )}

          {tab === "ledger" && (
            <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 space-y-6 flex flex-col h-full animate-in fade-in duration-300">
               <div className="flex flex-col md:flex-row justify-between items-center gap-4 border-b border-gray-50 pb-6">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Ledger For</span>
                    <select className="flex-1 max-w-xs px-4 py-2 bg-gray-50 border border-transparent rounded-xl text-sm font-black outline-none focus:bg-white focus:border-teal-200" value={ledgerCustomerId} onChange={(e) => setLedgerCustomerId(e.target.value)}>
                      <option value="">Select Customer...</option>
                      {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    <button className="px-4 py-2 bg-gray-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-gray-800" disabled={busy} onClick={loadCustomerLedger}>Load</button>
                  </div>
                  
                  <div className="flex gap-2">
                    <button className="px-4 py-2 bg-white border border-gray-100 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-gray-50" disabled={!customerLedger.customer} onClick={() => window.print()}>Print</button>
                    <button className="px-4 py-2 bg-teal-50 text-teal-600 border border-teal-100 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-teal-100" disabled={!customerLedger.customer} onClick={shareCustomerLedger}>WhatsApp</button>
                  </div>
               </div>

               {customerLedger.customer && (
                 <div className="flex-1 flex flex-col min-h-0 bg-white p-2">
                    <div className="flex justify-between items-end mb-6 px-4">
                       <div>
                         <h4 className="text-2xl font-black text-gray-900">{customerLedger.customer.name}</h4>
                         <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">{customerLedger.customer.phone || "-"} • {customerLedger.customer.address || "No Address"}</p>
                       </div>
                       <div className="text-right">
                         <span className="text-[9px] font-black text-gray-400 uppercase block mb-1">Outstanding Balance</span>
                         <span className="text-3xl font-black text-teal-600">{money(customerLedger.customer.current_balance_cents || 0)}</span>
                       </div>
                    </div>

                    <div className="flex-1 overflow-y-auto border border-gray-50 rounded-2xl">
                      <table className="w-full text-left">
                        <thead className="sticky top-0 bg-gray-50 text-[9px] font-black text-gray-400 uppercase tracking-widest">
                          <tr>
                            <th className="px-6 py-4">Date & Time</th>
                            <th className="px-6 py-4">Transaction</th>
                            <th className="px-6 py-4">Debit (+)</th>
                            <th className="px-6 py-4">Credit (-)</th>
                            <th className="px-6 py-4">Running Balance</th>
                            <th className="px-6 py-4">Description</th>
                          </tr>
                        </thead>
                        <tbody className="text-xs divide-y divide-gray-50">
                          {(customerLedger.ledger || []).map((row) => (
                            <tr key={row.id} className="hover:bg-gray-50/30 transition-colors">
                              <td className="px-6 py-4 text-gray-400 font-medium">{row.created_at ? new Date(row.created_at).toLocaleString() : "-"}</td>
                              <td className="px-6 py-4 font-black text-[10px] text-gray-500 uppercase">{row.entry_type}</td>
                              <td className="px-6 py-4 text-red-500 font-bold">{row.debit_cents ? money(row.debit_cents) : "-"}</td>
                              <td className="px-6 py-4 text-green-600 font-bold">{row.credit_cents ? money(row.credit_cents) : "-"}</td>
                              <td className="px-6 py-4 font-black">{money(row.balance_cents || 0)}</td>
                              <td className="px-6 py-4 text-gray-500 italic text-[11px]">{row.description || row.note || "-"}</td>
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
            <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 space-y-8 animate-in fade-in duration-300">
               <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3 items-end border-b border-gray-50 pb-8">
                  <div className="lg:col-span-1 space-y-1">
                    <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Vendor Name</label>
                    <input className="w-full px-4 py-2 bg-gray-50 border border-gray-100 rounded-xl text-xs font-bold" placeholder="Required" value={newVendor.name} onChange={(e) => setNewVendor((p) => ({ ...p, name: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Phone</label>
                    <input className="w-full px-4 py-2 bg-gray-50 border border-gray-100 rounded-xl text-xs font-bold" value={newVendor.phone} onChange={(e) => setNewVendor((p) => ({ ...p, phone: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Address</label>
                    <input className="w-full px-4 py-2 bg-gray-50 border border-gray-100 rounded-xl text-xs font-bold" value={newVendor.address} onChange={(e) => setNewVendor((p) => ({ ...p, address: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Notes</label>
                    <input className="w-full px-4 py-2 bg-gray-50 border border-gray-100 rounded-xl text-xs font-bold" value={newVendor.notes} onChange={(e) => setNewVendor((p) => ({ ...p, notes: e.target.value }))} />
                  </div>
                  <button className="py-2.5 bg-gray-900 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-gray-800" disabled={busy} onClick={createVendor}>Add Vendor</button>
               </div>

               <div className="space-y-4">
                  <div className="flex justify-between items-center px-1">
                    <input className="w-64 px-4 py-2 bg-gray-50 border border-transparent rounded-xl text-xs outline-none focus:bg-white focus:border-teal-200 transition-all" placeholder="Search vendors..." value={vendorSearch} onChange={(e) => setVendorSearch(e.target.value)} />
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Total: {filteredVendors.length}</span>
                  </div>

                  <div className="border border-gray-50 rounded-2xl overflow-hidden">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-gray-50/50 text-[9px] font-black text-gray-400 uppercase tracking-widest">
                        <tr><th className="px-6 py-4">Vendor</th><th className="px-6 py-4">Contact Details</th><th className="px-6 py-4">Total Payable</th><th className="px-6 py-4">Internal Notes</th><th className="px-6 py-4"></th></tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {filteredVendors.map((v) => {
                          const isSelected = selectedVendorId === v.id;
                          return (
                            <tr key={v.id} className={`hover:bg-gray-50/30 transition-colors cursor-pointer ${isSelected ? 'bg-teal-50/30' : ''}`} onClick={() => setSelectedVendorId(v.id)}>
                              <td className="px-6 py-4">
                                  {isSelected ? 
                                    <input className="bg-white border border-teal-200 rounded px-2 py-1 font-bold outline-none" value={editVendor.name} onClick={e => e.stopPropagation()} onChange={(e) => setEditVendor((p) => ({ ...p, name: e.target.value }))} /> 
                                    : <div className="font-bold text-gray-800">{v.name}</div>}
                              </td>
                              <td className="px-6 py-4">
                                {isSelected ? (
                                  <div className="space-y-1" onClick={e => e.stopPropagation()}>
                                    <input className="block bg-white border border-gray-100 rounded px-2 py-0.5 text-[10px]" value={editVendor.phone} onChange={(e) => setEditVendor((p) => ({ ...p, phone: e.target.value }))} />
                                    <input className="block bg-white border border-gray-100 rounded px-2 py-0.5 text-[10px]" value={editVendor.address} onChange={(e) => setEditVendor((p) => ({ ...p, address: e.target.value }))} />
                                  </div>
                                ) : <div className="text-gray-400 tracking-tight">{v.phone || "-"} <span className="text-[10px] opacity-50 block">{v.address || "-"}</span></div>}
                              </td>
                              <td className="px-6 py-4 font-black text-red-600">{money(v.current_balance_cents || 0)}</td>
                              <td className="px-6 py-4 text-gray-400 italic">
                                {isSelected ? 
                                  <input className="bg-white border border-gray-100 rounded px-2 py-1 outline-none font-normal" value={editVendor.notes} onClick={e => e.stopPropagation()} onChange={(e) => setEditVendor((p) => ({ ...p, notes: e.target.value }))} /> 
                                  : (v.notes || "-")}
                              </td>
                              <td className="px-6 py-4 text-right">
                                {isSelected ? (
                                  <div className="flex justify-end gap-2" onClick={e => e.stopPropagation()}>
                                    <button className="px-3 py-1 bg-teal-600 text-white rounded-lg font-bold text-[10px] uppercase" onClick={saveVendor}>Save</button>
                                    <button className="px-3 py-1 bg-red-50 text-red-500 rounded-lg font-bold text-[10px] uppercase" onClick={deleteVendor}>Delete</button>
                                  </div>
                                ) : <button className="text-[10px] font-black text-gray-300 uppercase hover:text-teal-600">Edit</button>}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
               </div>
            </div>
          )}

          {tab === "new-purchase" && (
            <div className="max-w-2xl bg-white rounded-3xl shadow-sm border border-gray-100 p-8 space-y-6 mx-auto animate-in fade-in duration-300">
               <div>
                  <h3 className="text-xl font-black text-gray-900 leading-none">Record Vendor Purchase</h3>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-2 px-1">Increase business payable amounts</p>
               </div>
               
               <div className="space-y-4 pt-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest pl-1">Supplier / Vendor</label>
                    <select className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-bold outline-none" value={purchaseVendorId} onChange={(e) => setPurchaseVendorId(e.target.value)}>
                      <option value="">Select vendor...</option>
                      {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                    </select>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest pl-1">Purchase Total</label>
                      <input className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-2xl text-lg font-black outline-none" placeholder="0.00" value={purchaseTotal} onChange={(e) => setPurchaseTotal(e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-teal-600 uppercase tracking-widest pl-1">Advance Paid</label>
                      <input className="w-full px-4 py-3 bg-teal-50/30 border border-teal-100 rounded-2xl text-lg font-black text-teal-700 outline-none" placeholder="0.00" value={purchasePaid} onChange={(e) => setPurchasePaid(e.target.value)} />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest pl-1">Description / Items</label>
                    <input className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-2xl text-sm outline-none" placeholder="e.g. Flour 50 Bags @ 5000" value={purchaseDescription} onChange={(e) => setPurchaseDescription(e.target.value)} />
                  </div>

                  <button className="w-full py-4 bg-gray-900 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-gray-800 shadow-xl shadow-gray-200 transition-all mt-4" disabled={busy} onClick={createPurchase}>
                    Record Purchase Payable
                  </button>
               </div>
            </div>
          )}

          {tab === "vendor-payments" && (
             <div className="max-w-md bg-white rounded-3xl shadow-sm border border-gray-100 p-8 space-y-6 mx-auto animate-in slide-in-from-top-4 duration-300">
               <div className="text-center space-y-2">
                 <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto text-2xl font-black">PKR</div>
                 <h3 className="text-xl font-black text-gray-900 uppercase">Vendor Disbursement</h3>
                 <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Payments to suppliers</p>
               </div>
               
               <div className="space-y-4 pt-2">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest pl-1">Select Vendor</label>
                    <select className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-bold outline-none" value={vendorPaymentVendorId} onChange={(e) => setVendorPaymentVendorId(e.target.value)}>
                      <option value="">Pick vendor...</option>
                      {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest pl-1">Amount Paid Out</label>
                    <input className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-2xl text-2xl font-black text-red-600 outline-none" value={vendorPaymentAmount} onChange={(e) => setVendorPaymentAmount(e.target.value)} placeholder="0" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest pl-1">Pay-out Details</label>
                    <input className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-2xl text-sm outline-none" value={vendorPaymentNote} onChange={(e) => setVendorPaymentNote(e.target.value)} placeholder="e.g. Bank Transfer / Cash Ref-998" />
                  </div>
                  <button className="w-full py-4 bg-red-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-red-700 shadow-xl shadow-red-100 transition-all" disabled={busy} onClick={createVendorPayment}>
                    Confirm Payment Out
                  </button>
               </div>
             </div>
          )}

          {tab === "vendor-ledger" && (
            <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 space-y-6 flex flex-col h-full animate-in fade-in duration-300">
               <div className="flex flex-col md:flex-row justify-between items-center gap-4 border-b border-gray-50 pb-6">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Vendor Account</span>
                    <select className="flex-1 max-w-xs px-4 py-2 bg-gray-50 border border-transparent rounded-xl text-sm font-black outline-none focus:bg-white focus:border-red-200" value={ledgerVendorId} onChange={(e) => setLedgerVendorId(e.target.value)}>
                      <option value="">Select Vendor...</option>
                      {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                    </select>
                    <button className="px-4 py-2 bg-gray-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest" disabled={busy} onClick={loadVendorLedger}>Open Ledger</button>
                  </div>
                  
                  <div className="flex gap-2">
                    <button className="px-4 py-2 bg-white border border-gray-100 rounded-xl text-[10px] font-black uppercase hover:bg-gray-50" disabled={!vendorLedger.vendor} onClick={() => window.print()}>Print</button>
                    <button className="px-4 py-2 bg-red-50 text-red-600 border border-red-100 rounded-xl text-[10px] font-black uppercase hover:bg-red-100" disabled={!vendorLedger.vendor} onClick={shareVendorLedger}>Share</button>
                  </div>
               </div>

               {vendorLedger.vendor && (
                 <div className="flex-1 flex flex-col min-h-0 bg-white p-2">
                    <div className="flex justify-between items-end mb-6 px-4">
                       <div>
                          <h4 className="text-2xl font-black text-gray-900">{vendorLedger.vendor.name}</h4>
                          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">Vendor Account Statement • {vendorLedger.vendor.phone || "No Phone"}</p>
                       </div>
                       <div className="text-right">
                          <span className="text-[9px] font-black text-gray-400 uppercase block mb-1">Company Payable</span>
                          <span className="text-3xl font-black text-red-600">{money(vendorLedger.vendor.current_balance_cents || 0)}</span>
                       </div>
                    </div>

                    <div className="flex-1 overflow-y-auto border border-gray-50 rounded-2xl">
                        <table className="w-full text-left text-xs">
                          <thead className="sticky top-0 bg-gray-50 text-[9px] font-black text-gray-400 uppercase tracking-widest">
                            <tr><th className="px-6 py-4">Date</th><th className="px-6 py-4">Transaction</th><th className="px-6 py-4">Payable (+)</th><th className="px-6 py-4">Payment (-)</th><th className="px-6 py-4">Final Balance</th><th className="px-6 py-4">Memo</th></tr>
                          </thead>
                          <tbody className="divide-y divide-gray-50">
                            {(vendorLedger.ledger || []).map((row) => (
                              <tr key={row.id} className="hover:bg-gray-50/30 transition-colors">
                                <td className="px-6 py-4 text-gray-400 font-medium">{row.created_at ? new Date(row.created_at).toLocaleString() : "-"}</td>
                                <td className="px-6 py-4 font-black text-[10px] text-gray-500 uppercase">{row.entry_type}</td>
                                <td className="px-6 py-4 text-red-500 font-bold">{row.debit_cents ? money(row.debit_cents) : "-"}</td>
                                <td className="px-6 py-4 text-green-600 font-bold">{row.credit_cents ? money(row.credit_cents) : "-"}</td>
                                <td className="px-6 py-4 font-black">{money(row.balance_cents || 0)}</td>
                                <td className="px-6 py-4 text-gray-500 italic text-[11px]">{row.description || row.note || "-"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                    </div>
                 </div>
               )}
            </div>
          )}
        </div>

        {/* Global Notifications */}
        {message && (
          <div className="fixed bottom-6 right-6 px-6 py-4 bg-gray-900 text-white rounded-2xl font-black shadow-2xl animate-in slide-in-from-right-full duration-300 z-50 text-xs uppercase tracking-widest border border-white/10 flex items-center gap-3">
             <span className="w-2 h-2 bg-teal-400 rounded-full animate-ping"></span>
             {message}
          </div>
        )}
        {error && (
          <div className="fixed bottom-6 right-6 px-6 py-4 bg-red-600 text-white rounded-2xl font-black shadow-2xl animate-in shake duration-500 z-50 text-xs uppercase tracking-widest flex items-center gap-3">
             <span className="text-lg">❌</span>
             {error}
          </div>
        )}
      </div>
    );
  }

  window.POSComponents = window.POSComponents || {};
  window.POSComponents.CreditRegister = CreditRegister;
})();
