(function () {
  const { useEffect, useMemo, useState } = React;
  const { money } = window.POSUtils.db;

  function Employees({ user }) {
    const [employees, setEmployees] = useState([]);
    const [selectedId, setSelectedId] = useState(null);
    const [ledger, setLedger] = useState({ employee: null, summary: null, entries: [] });
    const [name, setName] = useState("");
    const [phone, setPhone] = useState("");
    const [monthlySalary, setMonthlySalary] = useState("");
    const [notes, setNotes] = useState("");
    const [entryAmount, setEntryAmount] = useState("");
    const [entryNotes, setEntryNotes] = useState("");
    const [editName, setEditName] = useState("");
    const [editPhone, setEditPhone] = useState("");
    const [editMonthlySalary, setEditMonthlySalary] = useState("");
    const [editNotes, setEditNotes] = useState("");
    const [ledgerFromDate, setLedgerFromDate] = useState("");
    const [ledgerToDate, setLedgerToDate] = useState("");
    const [closeMonthNotes, setCloseMonthNotes] = useState("");
    const [quickCreditAmounts, setQuickCreditAmounts] = useState({});
    const [quickCreditNotes, setQuickCreditNotes] = useState({});
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState("");
    const [error, setError] = useState("");

    const selectedEmployee = useMemo(
      () => employees.find((e) => e.id === selectedId) || null,
      [employees, selectedId]
    );

    async function loadEmployees(keepSelection = true) {
      const rows = await window.POSUtils.employees.listEmployees(user.id, true);
      setEmployees(rows);
      if (!rows.length) {
        setSelectedId(null);
        return;
      }
      if (!keepSelection || !rows.some((e) => e.id === selectedId)) {
        setSelectedId(null);
      }
    }

    async function loadLedger(employeeId, fromDate = ledgerFromDate, toDate = ledgerToDate) {
      if (!employeeId) {
        setLedger({ employee: null, summary: null, entries: [] });
        return;
      }
      const data = await window.POSUtils.employees.getLedger(user.id, employeeId, fromDate, toDate);
      setLedger(data);
    }

    useEffect(() => {
      loadEmployees(true).catch((e) => setError(e.message || "Failed to load employee register."));
    }, []);

    useEffect(() => {
      loadLedger(selectedId).catch((e) => setError(e.message || "Failed to load employee ledger."));
    }, [selectedId]);

    useEffect(() => {
      if (!selectedEmployee) {
        setEditName("");
        setEditPhone("");
        setEditMonthlySalary("");
        setEditNotes("");
        return;
      }
      setEditName(selectedEmployee.full_name || "");
      setEditPhone(selectedEmployee.phone || "");
      setEditMonthlySalary((Number(selectedEmployee.monthly_salary_cents || 0) / 100).toFixed(2));
      setEditNotes(selectedEmployee.notes || "");
    }, [selectedEmployee?.id]);

    async function createEmployee() {
      setError("");
      setMessage("");
      const fullName = name.trim();
      if (!fullName) {
        setError("Employee name is required.");
        return;
      }
      setBusy(true);
      try {
        await window.POSUtils.employees.createEmployee(user.id, {
          fullName,
          phone: phone.trim(),
          monthlySalaryCents: Math.round(Number(monthlySalary || 0) * 100),
          notes: notes.trim(),
          active: true
        });
        setName("");
        setPhone("");
        setMonthlySalary("");
        setNotes("");
        setMessage("Employee added.");
        await loadEmployees(false);
      } catch (e) {
        setError(e.message || "Failed to add employee.");
      } finally {
        setBusy(false);
      }
    }

    async function saveEmployee() {
      if (!selectedEmployee) return;
      setError("");
      setMessage("");
      const trimmedName = editName.trim();
      if (!trimmedName) {
        setError("Employee name is required.");
        return;
      }
      const salaryCents = Math.round(Number(editMonthlySalary || 0) * 100);
      if (!Number.isFinite(salaryCents) || salaryCents < 0) {
        setError("Enter a valid monthly salary.");
        return;
      }
      setBusy(true);
      try {
        await window.POSUtils.employees.updateEmployee(user.id, selectedEmployee.id, {
          fullName: trimmedName,
          phone: editPhone.trim(),
          monthlySalaryCents: salaryCents,
          notes: editNotes.trim(),
          active: selectedEmployee.active === 1
        });
        setMessage("Employee updated.");
        await loadEmployees(true);
        await loadLedger(selectedId);
      } catch (e) {
        setError(e.message || "Failed to update employee.");
      } finally {
        setBusy(false);
      }
    }

    async function toggleActive(employee) {
      setError("");
      setMessage("");
      setBusy(true);
      try {
        await window.POSUtils.employees.updateEmployee(user.id, employee.id, {
          active: employee.active !== 1
        });
        setMessage(employee.active === 1 ? "Employee deactivated." : "Employee activated.");
        await loadEmployees(true);
        await loadLedger(selectedId);
      } catch (e) {
        setError(e.message || "Failed to update employee status.");
      } finally {
        setBusy(false);
      }
    }

    async function postEntry(entryType) {
      if (!selectedId) return;
      setError("");
      setMessage("");
      const amountCents = Math.round(Number(entryAmount || 0) * 100);
      if (amountCents <= 0) {
        setError("Enter a valid amount.");
        return;
      }
      setBusy(true);
      try {
        await window.POSUtils.employees.addLedgerEntry(user.id, selectedId, entryType, amountCents, entryNotes.trim());
        setEntryAmount("");
        setEntryNotes("");
        setMessage(entryType === "SALARY" ? "Salary entry added." : "Credit entry added.");
        await loadEmployees(true);
        await loadLedger(selectedId);
      } catch (e) {
        setError(e.message || "Failed to add ledger entry.");
      } finally {
        setBusy(false);
      }
    }

    async function addCredit() {
      await postEntry("CREDIT");
    }

    async function addSalaryAdjustment() {
      await postEntry("SALARY");
    }

    async function applyLedgerFilter() {
      if (!selectedId) return;
      setError("");
      setMessage("");
      setBusy(true);
      try {
        await loadLedger(selectedId, ledgerFromDate, ledgerToDate);
      } catch (e) {
        setError(e.message || "Failed to apply ledger filter.");
      } finally {
        setBusy(false);
      }
    }

    async function exportLedgerCsv() {
      if (!selectedId) return;
      setError("");
      setMessage("");
      setBusy(true);
      try {
        const out = await window.POSUtils.employees.exportLedgerCsv(user.id, selectedId, ledgerFromDate, ledgerToDate);
        setMessage(`Ledger CSV exported: ${out.filePath}`);
      } catch (e) {
        setError(e.message || "Failed to export ledger CSV.");
      } finally {
        setBusy(false);
      }
    }

    async function addQuickCredit(employeeId) {
      setError("");
      setMessage("");
      const rawAmount = quickCreditAmounts[employeeId] || "";
      const amountCents = Math.round(Number(rawAmount || 0) * 100);
      if (amountCents <= 0) {
        setError("Enter a valid quick credit amount.");
        return;
      }
      if (ledger.currentMonthClosed && selectedId === employeeId) {
        setError(`Salary month ${ledger.currentMonth} is already closed for this employee.`);
        return;
      }
      setBusy(true);
      try {
        await window.POSUtils.employees.addLedgerEntry(
          user.id,
          employeeId,
          "CREDIT",
          amountCents,
          String(quickCreditNotes[employeeId] || "").trim()
        );
        setQuickCreditAmounts((prev) => ({ ...prev, [employeeId]: "" }));
        setQuickCreditNotes((prev) => ({ ...prev, [employeeId]: "" }));
        setMessage("Quick credit added.");
        await loadEmployees(true);
        if (selectedId === employeeId) {
          await loadLedger(selectedId);
        }
      } catch (e) {
        setError(e.message || "Failed to add quick credit.");
      } finally {
        setBusy(false);
      }
    }

    async function deleteCreditEntry(entry) {
      if (!entry || entry.entry_type !== "CREDIT") return;
      const ok = window.confirm(`Delete credit entry #${entry.id} (${money(entry.amount_cents)})?`);
      if (!ok) return;
      setError("");
      setMessage("");
      setBusy(true);
      try {
        await window.POSUtils.employees.deleteLedgerEntry(user.id, entry.id);
        setMessage("Credit entry deleted.");
        await loadEmployees(true);
        await loadLedger(selectedId);
      } catch (e) {
        setError(e.message || "Failed to delete credit entry.");
      } finally {
        setBusy(false);
      }
    }

    async function closeCurrentMonth() {
      if (!selectedId) return;
      const targetMonth = ledger.currentMonth || new Date().toISOString().slice(0, 7);
      if (ledger.currentMonthClosed) {
        setError(`Salary month ${targetMonth} is already closed.`);
        return;
      }
      const ok = window.confirm(`Close salary for month ${targetMonth}? This locks new salary/credit edits for that month.`);
      if (!ok) return;
      setError("");
      setMessage("");
      setBusy(true);
      try {
        await window.POSUtils.employees.closeCurrentMonth(user.id, selectedId, closeMonthNotes.trim());
        setCloseMonthNotes("");
        setMessage(`Salary month ${targetMonth} closed.`);
        await loadEmployees(true);
        await loadLedger(selectedId);
      } catch (e) {
        setError(e.message || "Failed to close current month.");
      } finally {
        setBusy(false);
      }
    }

    if (user.role !== "ADMIN") {
      return (
        <div className="screen-grid">
          <div className="card">
            <h2>Employee Register</h2>
            <p className="muted">Only admin can access this module.</p>
          </div>
        </div>
      );
    }

    return (
      <div className="screen-grid employees-screen">
        <div className="card employees-card">
          <h2 className="employees-title">Employee Register</h2>
          <div className="row employees-create-row">
            <input placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} />
            <input placeholder="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div className="row employees-create-row">
            <input placeholder="Monthly salary (e.g. 45000)" value={monthlySalary} onChange={(e) => setMonthlySalary(e.target.value)} />
            <input placeholder="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
            <button className="primary employees-add-btn" disabled={busy} onClick={createEmployee}>Add Employee</button>
          </div>

          <div className="employees-table-wrap">
            <table className="table employees-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Phone</th>
                  <th>Monthly Salary</th>
                  <th>Notes</th>
                  <th>Total Salary</th>
                  <th>Credit</th>
                  <th>After Credit</th>
                  <th>Quick Credit</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {employees.map((emp) => (
                  <tr key={emp.id} className={selectedId === emp.id ? "selected-row" : ""} onClick={() => setSelectedId(emp.id)}>
                    <td>{selectedId === emp.id ? <input value={editName} onChange={(e) => setEditName(e.target.value)} /> : emp.full_name}</td>
                    <td>{selectedId === emp.id ? <input value={editPhone} onChange={(e) => setEditPhone(e.target.value)} /> : (emp.phone || "-")}</td>
                    <td>{selectedId === emp.id ? <input value={editMonthlySalary} onChange={(e) => setEditMonthlySalary(e.target.value)} /> : money(emp.monthly_salary_cents || 0)}</td>
                    <td>{selectedId === emp.id ? <input value={editNotes} onChange={(e) => setEditNotes(e.target.value)} /> : (emp.notes || "-")}</td>
                    <td className="employees-money">{money(emp.summary?.salaryCents || 0)}</td>
                    <td className="employees-money">{money(emp.summary?.creditCents || 0)}</td>
                    <td className="employees-money employees-net">{money(emp.summary?.netPayableCents || 0)}</td>
                    <td>
                      <div className="employees-quick-credit">
                        <input
                          placeholder="Amount"
                          value={quickCreditAmounts[emp.id] || ""}
                          onChange={(e) => setQuickCreditAmounts((prev) => ({ ...prev, [emp.id]: e.target.value }))}
                        />
                        <input
                          placeholder="Note"
                          value={quickCreditNotes[emp.id] || ""}
                          onChange={(e) => setQuickCreditNotes((prev) => ({ ...prev, [emp.id]: e.target.value }))}
                        />
                        <button className="primary" disabled={busy} onClick={() => addQuickCredit(emp.id)}>Add</button>
                      </div>
                    </td>
                    <td>
                      <span className={emp.active === 1 ? "status-pill active" : "status-pill inactive"}>
                        {emp.active === 1 ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td>
                      <div className="employees-row-actions">
                        {selectedId === emp.id ? (
                          <>
                            <button className="primary" onClick={saveEmployee} disabled={busy}>Save</button>
                            <button onClick={() => toggleActive(emp)} disabled={busy}>{emp.active === 1 ? "Deactivate" : "Activate"}</button>
                          </>
                        ) : (
                          <button>Edit</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {selectedEmployee && (
          <div className="card employees-card">
            <div className="employees-ledger-head">
              <h2 className="employees-title">Salary / Credit Ledger</h2>
              <button onClick={() => setSelectedId(null)} disabled={busy}>Close Ledger</button>
            </div>
            <>
              <p className="employees-selected-head"><strong>{selectedEmployee.full_name}</strong> ({selectedEmployee.active === 1 ? "Active" : "Inactive"})</p>
              <div className="employees-metrics">
                <div className="employees-metric"><span>Monthly Salary</span><strong>{money(ledger.summary?.baseSalaryCents || selectedEmployee.monthly_salary_cents || 0)}</strong></div>
                <div className="employees-metric"><span>Salary Adjustments</span><strong>{money(ledger.summary?.salaryAdjustmentsCents || 0)}</strong></div>
                <div className="employees-metric"><span>Total Salary</span><strong>{money(ledger.summary?.totalSalaryCents || ledger.summary?.salaryCents || 0)}</strong></div>
                <div className="employees-metric"><span>Total Credit</span><strong>{money(ledger.summary?.creditCents || 0)}</strong></div>
                <div className="employees-metric highlight"><span>Salary After Credit</span><strong>{money(ledger.summary?.netPayableCents || 0)}</strong></div>
              </div>
              <div className="employees-close-month">
                <input
                  placeholder="Close month notes (optional)"
                  value={closeMonthNotes}
                  onChange={(e) => setCloseMonthNotes(e.target.value)}
                />
                <button className="primary" disabled={busy || !!ledger.currentMonthClosed} onClick={closeCurrentMonth}>
                  {ledger.currentMonthClosed ? `Closed (${ledger.currentMonth || "-"})` : `Close Current Month (${ledger.currentMonth || "-"})`}
                </button>
              </div>
              {ledger.currentMonthClosed && (
                <div className="muted">
                  Closed at: {ledger.currentMonthClosure?.closed_at ? new Date(ledger.currentMonthClosure.closed_at).toLocaleString() : "-"}
                </div>
              )}
              <div className="row employees-toolbar">
                <input type="date" value={ledgerFromDate} onChange={(e) => setLedgerFromDate(e.target.value)} />
                <input type="date" value={ledgerToDate} onChange={(e) => setLedgerToDate(e.target.value)} />
                <button onClick={applyLedgerFilter} disabled={busy}>Apply Filter</button>
                <button onClick={exportLedgerCsv} disabled={busy}>Export CSV</button>
              </div>

              <div className="row employees-toolbar">
                <input placeholder="Amount" value={entryAmount} onChange={(e) => setEntryAmount(e.target.value)} />
                <input placeholder="Notes" value={entryNotes} onChange={(e) => setEntryNotes(e.target.value)} />
                <button className="primary" disabled={busy || !!ledger.currentMonthClosed} onClick={addCredit}>Add Credit</button>
                <button disabled={busy || !!ledger.currentMonthClosed} onClick={addSalaryAdjustment}>Add Salary</button>
              </div>

              <div className="employees-table-wrap">
                <table className="table employees-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Type</th>
                    <th>Amount</th>
                    <th>By</th>
                    <th>Notes</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {(ledger.entries || []).map((entry) => (
                    <tr key={entry.id}>
                      <td>{new Date(entry.created_at).toLocaleString()}</td>
                      <td>{entry.entry_type}</td>
                      <td>{money(entry.amount_cents)}</td>
                      <td>{entry.created_by_username || "-"}</td>
                      <td>{entry.notes || "-"}</td>
                      <td>
                        {entry.entry_type === "CREDIT" ? (
                          <button className="employees-delete-btn" onClick={() => deleteCreditEntry(entry)} disabled={busy}>
                            Delete
                          </button>
                        ) : (
                          "-"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                </table>
              </div>
            </>
            {message && <div className="success">{message}</div>}
            {error && <div className="error">{error}</div>}
          </div>
        )}
        {!selectedEmployee && message && <div className="success">{message}</div>}
        {!selectedEmployee && error && <div className="error">{error}</div>}
      </div>
    );
  }

  window.POSComponents = window.POSComponents || {};
  window.POSComponents.Employees = Employees;
})();
