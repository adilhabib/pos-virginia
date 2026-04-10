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
        <div className="flex items-center justify-center h-full animate-in fade-in duration-500">
           <div className="bg-white rounded-3xl shadow-xl border border-red-50 p-12 text-center space-y-4 max-w-sm">
              <div className="text-5xl mb-4">👮</div>
              <h2 className="text-xl font-black text-gray-900 uppercase">Access Restricted</h2>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest leading-relaxed">Staff management is restricted to Administrative accounts only.</p>
           </div>
        </div>
      );
    }

    return (
      <div className="flex flex-col h-full gap-6 p-2 overflow-hidden animate-in zoom-in-95 duration-300">
        {/* Header Section */}
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 flex flex-col md:flex-row justify-between items-center gap-6 shrink-0">
          <div className="flex-1">
            <h2 className="text-2xl font-black text-gray-900 leading-none">Staff Management</h2>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-2 px-1">Payroll, Attendance & Credit Register</p>
          </div>
          <div className="flex gap-4">
             <div className="px-5 py-3 bg-teal-50 text-teal-700 rounded-2xl border border-teal-100/30">
                <span className="block text-[8px] font-black uppercase opacity-60">Total Staff</span>
                <span className="text-lg font-black tracking-tighter">{employees.length} Members</span>
             </div>
             <div className="px-5 py-3 bg-gray-50 text-gray-700 rounded-2xl border border-gray-100">
                <span className="block text-[8px] font-black uppercase opacity-60">Active Shifts</span>
                <span className="text-lg font-black tracking-tighter">{employees.filter(e => e.active).length} Active</span>
             </div>
          </div>
        </div>

        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 gap-6 overflow-hidden">
          {/* Main Register Area */}
          <div className="lg:col-span-8 flex flex-col gap-6 overflow-hidden">
            
            {/* Employee Data Table */}
            <div className={`bg-white rounded-3xl shadow-sm border border-gray-100 flex flex-col h-full overflow-hidden transition-all duration-500 ${selectedId ? 'h-[45%]' : 'h-full'}`}>
               <div className="p-4 border-b border-gray-50 flex justify-between items-center shrink-0">
                  <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] italic pl-2">Member Register</h3>
                  <button className="text-[10px] font-black text-teal-600 uppercase tracking-widest hover:bg-teal-50 px-3 py-1 rounded-lg" onClick={() => loadEmployees(true)}>Refresh List</button>
               </div>
               
               <div className="flex-1 overflow-y-auto">
                 <table className="w-full text-left">
                    <thead className="sticky top-0 bg-white/90 backdrop-blur text-[9px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-50">
                       <tr>
                          <th className="px-6 py-4">Full Employee Name</th>
                          <th className="px-4 py-4">Monthly Base</th>
                          <th className="px-4 py-4">Net Payable</th>
                          <th className="px-4 py-4">Quick Credit</th>
                          <th className="px-6 py-4">Status</th>
                       </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                       {employees.map((emp) => (
                         <tr 
                          key={emp.id} 
                          className={`hover:bg-gray-50 transition-all cursor-pointer ${selectedId === emp.id ? 'bg-teal-50/50' : ''}`}
                          onClick={() => setSelectedId(emp.id)}
                         >
                            <td className="px-6 py-4">
                               <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-xs font-black text-gray-400">{emp.full_name.charAt(0)}</div>
                                  <div className="flex flex-col">
                                     <span className="text-xs font-black text-gray-900">{emp.full_name}</span>
                                     <span className="text-[9px] text-gray-400 font-bold">{emp.phone || "No Phone"}</span>
                                  </div>
                               </div>
                            </td>
                            <td className="px-4 py-4 text-xs font-bold text-gray-500">
                               {money(emp.monthly_salary_cents || 0)}
                            </td>
                            <td className="px-4 py-4 text-xs font-black text-teal-700">
                               {money(emp.summary?.netPayableCents || 0)}
                            </td>
                            <td className="px-4 py-4" onClick={e => e.stopPropagation()}>
                                <div className="flex gap-1">
                                   <input 
                                    className="w-16 bg-gray-50 border border-transparent rounded-lg px-2 py-1 text-[10px] font-black outline-none focus:bg-white focus:border-teal-200" 
                                    placeholder="Amt"
                                    value={quickCreditAmounts[emp.id] || ""}
                                    onChange={(e) => setQuickCreditAmounts((prev) => ({ ...prev, [emp.id]: e.target.value }))}
                                   />
                                   <button className="px-2 py-1 bg-teal-600 text-white rounded-lg text-[9px] font-black uppercase" disabled={busy} onClick={() => addQuickCredit(emp.id)}>OK</button>
                                </div>
                            </td>
                            <td className="px-6 py-4">
                               <span className={`px-2 py-1 rounded-full text-[8px] font-black uppercase ${emp.active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-500'}`}>
                                  {emp.active ? 'On-Duty' : 'Inactive'}
                               </span>
                            </td>
                         </tr>
                       ))}
                    </tbody>
                 </table>
               </div>
            </div>

            {/* Ledger Section (Visible when selected) */}
            {selectedEmployee && (
              <div className="bg-white rounded-3xl shadow-sm border border-gray-100 flex flex-1 flex-col overflow-hidden animate-in slide-in-from-bottom-4">
                 <div className="p-5 border-b border-gray-50 flex justify-between items-center bg-gray-900 text-white shrink-0">
                    <div className="flex items-center gap-4">
                       <h3 className="text-xs font-black uppercase tracking-widest">{selectedEmployee.full_name} Account Statement</h3>
                       <span className="text-[10px] bg-white/10 px-2 py-1 rounded font-bold uppercase tracking-widest">Active Member</span>
                    </div>
                    <button className="text-[10px] font-black text-gray-400 hover:text-white" onClick={() => setSelectedId(null)}>DISMISS</button>
                 </div>
                 
                 <div className="flex-1 flex flex-col min-h-0 bg-white p-6 gap-6">
                    <div className="grid grid-cols-4 gap-4">
                       <div className="p-3 bg-gray-50 rounded-2xl border border-gray-100">
                          <span className="text-[8px] font-black text-gray-400 uppercase block mb-1">Total Salary</span>
                          <span className="text-sm font-black text-gray-900">{money(ledger.summary?.totalSalaryCents || 0)}</span>
                       </div>
                       <div className="p-3 bg-red-50 rounded-2xl border border-red-100/30">
                          <span className="text-[8px] font-black text-red-400 uppercase block mb-1">Staff Credits</span>
                          <span className="text-sm font-black text-red-600">-{money(ledger.summary?.creditCents || 0)}</span>
                       </div>
                       <div className="p-3 bg-teal-50 rounded-2xl border border-teal-100/30">
                          <span className="text-[8px] font-black text-teal-600 uppercase block mb-1">Salary Status</span>
                          <span className={`text-xs font-black uppercase ${ledger.currentMonthClosed ? 'text-teal-700' : 'text-orange-500'}`}>
                             {ledger.currentMonthClosed ? 'Month Finalized' : 'Draft Mode'}
                          </span>
                       </div>
                       <div className="p-3 bg-gray-900 rounded-2xl border border-white/10 text-white text-center">
                          <span className="text-[8px] font-black text-gray-400 uppercase block mb-1">Payable Now</span>
                          <span className="text-sm font-black text-teal-400">{money(ledger.summary?.netPayableCents || 0)}</span>
                       </div>
                    </div>

                    <div className="flex-1 overflow-y-auto border border-gray-50 rounded-2xl">
                       <table className="w-full text-left text-[11px]">
                          <thead className="sticky top-0 bg-gray-50 text-[9px] font-black text-gray-400 uppercase tracking-widest">
                             <tr>
                                <th className="px-4 py-3">Date</th>
                                <th className="px-4 py-3">Transaction</th>
                                <th className="px-4 py-3">Notes / Memo</th>
                                <th className="px-4 py-3 text-right">Value (PKR)</th>
                                <th className="px-4 py-3"></th>
                             </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-50 font-bold">
                             {(ledger.entries || []).map((entry) => (
                               <tr key={entry.id} className="hover:bg-gray-50/50">
                                  <td className="px-4 py-3 text-gray-400">{new Date(entry.created_at).toLocaleDateString()}</td>
                                  <td className="px-4 py-3">
                                     <span className={`uppercase text-[9px] ${entry.entry_type === "CREDIT" ? 'text-red-500' : 'text-teal-600'}`}>
                                        {entry.entry_type}
                                     </span>
                                  </td>
                                  <td className="px-4 py-3 text-gray-500 italic">{entry.notes || "-"}</td>
                                  <td className={`px-4 py-3 text-right font-black ${entry.entry_type === "CREDIT" ? 'text-red-500' : 'text-gray-900'}`}>
                                     {entry.entry_type === "CREDIT" ? '-' : '+'}{money(entry.amount_cents)}
                                  </td>
                                  <td className="px-4 py-3 text-right">
                                     {entry.entry_type === "CREDIT" && !ledger.currentMonthClosed && (
                                       <button className="text-red-200 hover:text-red-500" onClick={() => deleteCreditEntry(entry)}>✖</button>
                                     )}
                                  </td>
                               </tr>
                             ))}
                          </tbody>
                       </table>
                    </div>
                 </div>
              </div>
            )}
          </div>

          {/* Configuration Sidebar */}
          <div className="lg:col-span-4 flex flex-col gap-6 overflow-y-auto scrollbar-hide">
            
            {/* Rapid Salary Tool */}
            {selectedEmployee && (
               <div className="bg-gray-900 text-white rounded-3xl shadow-xl p-6 space-y-6 shrink-0 border-b-4 border-teal-600 animate-in slide-in-from-right-4">
                  <h3 className="text-xs font-black text-teal-400 uppercase tracking-[0.2em] italic">Post Quick Entry</h3>
                  <div className="space-y-4">
                     <div className="space-y-1">
                        <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest pl-1">Amount PKR</label>
                        <input className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-xl font-black text-white outline-none focus:bg-white/10 focus:border-teal-500" value={entryAmount} onChange={(e) => setEntryAmount(e.target.value)} placeholder="0.00" />
                     </div>
                     <div className="space-y-1">
                        <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest pl-1">Reason / Brief</label>
                        <input className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-xs font-bold text-gray-400 outline-none focus:bg-white/10 focus:border-teal-500" value={entryNotes} onChange={(e) => setEntryNotes(e.target.value)} placeholder="Bonus / Fine / Loan" />
                     </div>
                     <div className="grid grid-cols-2 gap-3 pt-2">
                        <button className="py-4 bg-red-600/20 text-red-400 border border-red-600/30 rounded-2xl text-[10px] font-black uppercase hover:bg-red-600 hover:text-white transition-all" disabled={busy || !!ledger.currentMonthClosed} onClick={addCredit}>Post Credit</button>
                        <button className="py-4 bg-teal-600 text-white rounded-2xl text-[10px] font-black uppercase hover:bg-teal-700 transition-all" disabled={busy || !!ledger.currentMonthClosed} onClick={addSalaryAdjustment}>Post Salary</button>
                     </div>
                     <hr className="opacity-10" />
                     <button className={`w-full py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${ledger.currentMonthClosed ? 'bg-teal-500/10 text-teal-500 border border-teal-500/20 cursor-default' : 'bg-white text-gray-900 hover:bg-gray-200 shadow-xl'}`} onClick={closeCurrentMonth} disabled={busy || ledger.currentMonthClosed}>
                        {ledger.currentMonthClosed ? `Ledger Locked (${ledger.currentMonth})` : `Finalize Month: ${ledger.currentMonth}`}
                     </button>
                  </div>
               </div>
            )}

            {/* Registration Card (Only when not editing) */}
            <div className={`bg-white rounded-3xl shadow-sm border p-8 space-y-6 transition-all duration-500 ${selectedId ? 'opacity-40 pointer-events-none scale-95' : 'opacity-100 shrink-0'}`}>
               <div className="flex justify-between items-center">
                  <h3 className="text-xs font-black text-gray-900 uppercase tracking-widest italic">New Staff Join</h3>
                  <div className="w-2 h-2 rounded-full bg-teal-500 animate-pulse"></div>
               </div>
               <div className="space-y-4">
                  <div className="space-y-3">
                     <input className="w-full px-5 py-3.5 bg-gray-50 border border-gray-100 rounded-2xl text-xs font-bold" placeholder="Staff Full Name" value={name} onChange={(e) => setName(e.target.value)} />
                     <input className="w-full px-5 py-3.5 bg-gray-50 border border-gray-100 rounded-2xl text-xs font-bold" placeholder="Mobile Number" value={phone} onChange={(e) => setPhone(e.target.value)} />
                     <input className="w-full px-5 py-3.5 bg-gray-50 border border-gray-100 rounded-2xl text-xs font-black text-teal-700" placeholder="Base Monthly Salary" value={monthlySalary} onChange={(e) => setMonthlySalary(e.target.value)} />
                     <input className="w-full px-5 py-3.5 bg-gray-50 border border-gray-100 rounded-2xl text-xs font-bold text-gray-400" placeholder="Biometric Ref / Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
                  </div>
                  <button className="w-full py-5 bg-gray-900 text-white rounded-3xl font-black text-[10px] uppercase tracking-widest shadow-xl shadow-gray-200 hover:bg-gray-800 transition-all active:scale-[0.98]" disabled={busy} onClick={createEmployee}>Enroll Staff Member</button>
               </div>
            </div>

            {/* Edit Panel (Visible when selected) */}
            {selectedId && (
               <div className="bg-white rounded-3xl shadow-sm border border-teal-200 p-8 space-y-6 shrink-0 animate-in flip-in-x duration-500">
                  <h3 className="text-xs font-black text-teal-600 uppercase tracking-widest border-b border-teal-50 pb-4">Modify Access / Details</h3>
                  <div className="space-y-4">
                     <div className="space-y-3">
                        <input className="w-full px-5 py-3.5 bg-gray-50 border border-gray-100 rounded-2xl text-xs font-bold" value={editName} onChange={(e) => setEditName(e.target.value)} />
                        <input className="w-full px-5 py-3.5 bg-gray-50 border border-gray-100 rounded-2xl text-xs font-bold" value={editPhone} onChange={(e) => setEditPhone(e.target.value)} />
                        <input className="w-full px-5 py-3.5 bg-gray-50 border border-gray-100 rounded-2xl text-xs font-black text-teal-700" value={editMonthlySalary} onChange={(e) => setEditMonthlySalary(e.target.value)} />
                     </div>
                     <div className="grid grid-cols-2 gap-2">
                        <button className="py-4 bg-teal-600 text-white rounded-2xl text-[10px] font-black uppercase shadow-lg shadow-teal-100" onClick={saveEmployee} disabled={busy}>Commit</button>
                        <button className={`py-4 rounded-2xl text-[10px] font-black uppercase border ${selectedEmployee?.active ? 'border-red-200 text-red-500 hover:bg-red-50' : 'border-teal-200 text-teal-600 hover:bg-teal-50'}`} onClick={() => toggleActive(selectedEmployee)} disabled={busy}>
                           {selectedEmployee?.active ? 'Deactivate' : 'Activate'}
                        </button>
                     </div>
                  </div>
               </div>
            )}
            
            {/* Notifications */}
            {message && <div className="fixed bottom-6 left-6 px-10 py-6 bg-teal-600 text-white rounded-full font-black shadow-2xl animate-in slide-in-from-left-full z-50 text-[10px] uppercase tracking-widest">{message}</div>}
            {error && <div className="fixed bottom-6 left-6 px-10 py-6 bg-red-600 text-white rounded-full font-black shadow-2xl animate-in shake z-50 text-[10px] uppercase tracking-widest">{error}</div>}
          </div>
        </div>
      </div>
    );
  }

  window.POSComponents = window.POSComponents || {};
  window.POSComponents.Employees = Employees;
})();
