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

    const [reportTab, setReportTab] = useState("financials");

    return (
      <div className="flex flex-col h-full gap-6 p-2 overflow-hidden animate-in fade-in duration-500">
        {/* Header & Main Controls */}
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 flex flex-col md:flex-row justify-between items-center gap-6 shrink-0">
          <div className="flex-1">
            <h2 className="text-2xl font-black text-gray-900 leading-none">Business Analytics</h2>
            <div className="flex items-center gap-4 mt-2">
               <div className="flex bg-gray-100 p-1 rounded-xl">
                 {['daily', 'weekly', 'monthly'].map(t => (
                   <button 
                    key={t}
                    onClick={() => setRange(t)}
                    className={`px-4 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${range === t ? 'bg-white text-teal-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                   >
                    {t}
                   </button>
                 ))}
               </div>
               <span className="h-4 w-[1px] bg-gray-100"></span>
               <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-1">Statistical Audit Performance</p>
            </div>
          </div>
          <div className="flex gap-3">
             <button className="px-6 py-3 bg-white border border-gray-100 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-gray-50 transition-all" onClick={load}>Reload Data</button>
             <button className="px-6 py-3 bg-gray-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-gray-800 shadow-xl shadow-gray-200 transition-all" onClick={exportCsv}>Export CSV</button>
          </div>
        </div>

        {/* KPI Summary Row */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 shrink-0">
           {[
             { label: 'Opening Float', value: register?.totals?.openingFloat || 0, color: 'text-gray-900', bg: 'bg-white' },
             { label: 'Net Sales', value: register?.totals?.sales || 0, color: 'text-teal-600', bg: 'bg-teal-50' },
             { label: 'Cash In', value: register?.totals?.cashIn || 0, color: 'text-teal-600', bg: 'bg-white' },
             { label: 'Cash Out', value: register?.totals?.cashOut || 0, color: 'text-red-500', bg: 'bg-red-50' },
             { label: 'Expected Drawer', value: register?.totals?.expectedDrawer || 0, color: 'text-gray-900', bg: 'bg-white', border: 'border-teal-100' },
             { label: 'Actual Closed', value: register?.totals?.actualClosed || 0, color: 'text-gray-900', bg: 'bg-gray-50' }
           ].map((kpi, idx) => (
             <div key={idx} className={`p-4 rounded-3xl shadow-sm border border-gray-100 ${kpi.bg} ${kpi.border || ''}`}>
                <span className="block text-[8px] font-black text-gray-400 uppercase tracking-[0.2em] mb-1">{kpi.label}</span>
                <span className={`text-sm font-black tracking-tighter ${kpi.color}`}>{money(kpi.value)}</span>
             </div>
           ))}
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-2 shrink-0 border-b border-gray-100 pb-1">
           {[
             { id: 'financials', label: 'Financial Register' },
             { id: 'analytics', label: 'Product Analytics' },
             { id: 'system', label: 'System & Backups' }
           ].map(tab => (
             <button 
              key={tab.id}
              onClick={() => setReportTab(tab.id)}
              className={`px-6 py-3 text-[10px] font-black uppercase tracking-widest transition-all relative ${reportTab === tab.id ? 'text-teal-600' : 'text-gray-400 hover:text-gray-600'}`}
             >
                {tab.label}
                {reportTab === tab.id && <div className="absolute bottom-0 left-6 right-6 h-0.5 bg-teal-600 rounded-full animate-in fade-in slide-in-from-bottom-1"></div>}
             </button>
           ))}
        </div>

        {/* Scrollable Content Area */}
        <div className="flex-1 overflow-y-auto pr-1 scrollbar-hide">
          
          {reportTab === 'financials' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-left-4 duration-300">
               {/* Sales Register */}
               <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
                  <div className="p-5 border-b border-gray-50 bg-gray-50/30">
                     <h3 className="text-xs font-black text-gray-900 uppercase tracking-widest italic">Sales Transaction Audit</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                       <thead className="text-[9px] font-black text-gray-400 uppercase tracking-widest bg-white">
                          <tr>
                            <th className="px-6 py-4">Time</th>
                            <th className="px-4 py-4">Order ID</th>
                            <th className="px-4 py-4">Cashier</th>
                            <th className="px-4 py-4">Payment</th>
                            <th className="px-4 py-4 text-right">Value</th>
                            <th className="px-4 py-4 text-right">Received</th>
                            <th className="px-6 py-4 text-right">Change</th>
                          </tr>
                       </thead>
                       <tbody className="divide-y divide-gray-50 text-[11px] font-bold">
                          {(register?.sales || []).map((s) => (
                            <tr key={s.id} className="hover:bg-gray-50/50">
                               <td className="px-6 py-4 text-gray-400">{new Date(s.created_at).toLocaleTimeString()}</td>
                               <td className="px-4 py-4 text-gray-900">#{s.order_id}</td>
                               <td className="px-4 py-4 text-gray-500 uppercase">{s.cashier || "-"}</td>
                               <td className="px-4 py-4">
                                  <span className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded-full text-[9px] font-black uppercase">{s.method}</span>
                               </td>
                               <td className="px-4 py-4 text-right font-black">{money(s.amount_cents)}</td>
                               <td className="px-4 py-4 text-right text-gray-500">{money(s.received_cents)}</td>
                               <td className="px-6 py-4 text-right text-red-400">{money(s.change_cents)}</td>
                            </tr>
                          ))}
                       </tbody>
                    </table>
                  </div>
               </div>

               {/* Cash Movements */}
               <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
                  <div className="p-5 border-b border-gray-50 bg-gray-50/30">
                     <h3 className="text-xs font-black text-gray-900 uppercase tracking-widest italic">Cash Movement Ledger</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                       <thead className="text-[9px] font-black text-gray-400 uppercase tracking-widest">
                          <tr>
                             <th className="px-6 py-4">Timestamp</th>
                             <th className="px-4 py-4">User</th>
                             <th className="px-4 py-4">Direction</th>
                             <th className="px-4 py-4">Ref / Memo</th>
                             <th className="px-6 py-4 text-right">Amount PKR</th>
                          </tr>
                       </thead>
                       <tbody className="divide-y divide-gray-50 text-[11px] font-bold">
                          {(register?.cashMovements || []).map((m) => (
                            <tr key={m.id} className="hover:bg-gray-50/50">
                               <td className="px-6 py-4 text-gray-400">{new Date(m.created_at).toLocaleTimeString()}</td>
                               <td className="px-4 py-4 uppercase">{m.username || "-"}</td>
                               <td className="px-4 py-4">
                                  <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${m.transaction_type === "IN" ? 'bg-teal-50 text-teal-600' : 'bg-red-50 text-red-500'}`}>
                                     {m.transaction_type}
                                  </span>
                               </td>
                               <td className="px-4 py-4 text-gray-500 italic">{m.reason} <span className="text-[9px] ml-2 font-black opacity-30">{m.reference_type} #{m.reference_id}</span></td>
                               <td className={`px-6 py-4 text-right font-black ${m.transaction_type === "IN" ? 'text-teal-600' : 'text-red-500'}`}>{money(m.amount_cents)}</td>
                            </tr>
                          ))}
                       </tbody>
                    </table>
                  </div>
               </div>
            </div>
          )}

          {reportTab === 'analytics' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-in zoom-in-95 duration-300 pb-12">
               {/* Margin & Tax Grid */}
               <div className="space-y-6">
                  <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 space-y-4">
                     <h3 className="text-xs font-black text-gray-900 uppercase tracking-widest border-b border-gray-50 pb-3">Tax & Net Contribution</h3>
                     <div className="space-y-3">
                        {[
                          { label: 'Taxable Gross', value: summary?.taxSummary?.taxable_sales_cents || 0 },
                          { label: 'Total Discounts', value: summary?.taxSummary?.total_discount_cents || 0, color: 'text-red-500' },
                          { label: 'VAT / Tax Collected', value: summary?.taxSummary?.tax_collected_cents || 0, color: 'text-blue-600' },
                          { label: 'Net Business Income', value: summary?.taxSummary?.net_sales_cents || 0, color: 'text-teal-600 font-black' }
                        ].map((row, i) => (
                          <div key={i} className="flex justify-between items-center text-xs">
                             <span className="font-bold text-gray-400 uppercase tracking-wider">{row.label}</span>
                             <span className={`font-black tracking-tighter ${row.color || 'text-gray-900'}`}>{money(row.value)}</span>
                          </div>
                        ))}
                     </div>
                  </div>

                  <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
                     <div className="p-5 border-b border-gray-50"><h4 className="text-[10px] font-black uppercase tracking-widest text-gray-400 italic">Category Performance</h4></div>
                     <table className="w-full text-left text-[11px]">
                        <thead className="bg-gray-50 text-[9px] font-black text-gray-400">
                           <tr className="uppercase tracking-widest"><th className="px-6 py-3">Category</th><th className="px-4 py-3">Gross Sales</th><th className="px-6 py-3 text-right">Gross Margin</th></tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50 font-black">
                           {(summary?.categoryMargin || []).map((c) => (
                             <tr key={c.category} className="hover:bg-gray-50/30">
                                <td className="px-6 py-4 text-gray-900 uppercase tracking-tighter">{c.category}</td>
                                <td className="px-4 py-4 text-gray-500 font-medium">{money(c.net_sales_cents)}</td>
                                <td className="px-6 py-4 text-right text-teal-600">{money(c.gross_margin_cents)}</td>
                             </tr>
                           ))}
                        </tbody>
                     </table>
                  </div>
               </div>

               {/* Right Side: Staff & Procurement */}
               <div className="space-y-6">
                  <div className="bg-gray-900 text-white rounded-3xl shadow-xl p-8 space-y-6 border-b-8 border-teal-600">
                     <h3 className="text-xs font-black text-teal-400 uppercase tracking-[0.2em] italic">Procurement Performance</h3>
                     <div className="grid grid-cols-2 gap-6">
                        <div className="space-y-1">
                           <span className="text-[9px] text-teal-500/50 uppercase font-black">Stock Asset Valuation</span>
                           <h4 className="text-xl font-black">{money(procurement?.stockValuationCents || 0)}</h4>
                        </div>
                        <div className="space-y-1">
                           <span className="text-[9px] text-teal-500/50 uppercase font-black">Today Pur. Value</span>
                           <h4 className="text-xl font-black">{money(procurement?.todayReceivedValueCents || 0)}</h4>
                        </div>
                        <div className="col-span-2 grid grid-cols-2 gap-3 pt-4 border-t border-white/5">
                           <div className="p-3 bg-white/5 rounded-2xl">
                              <span className="text-[10px] text-gray-400 block mb-1">Active POs</span>
                              <span className="text-lg font-black">{procurement?.openPoCount || 0}</span>
                           </div>
                           <div className="p-3 bg-white/5 rounded-2xl">
                              <span className="text-[10px] text-gray-400 block mb-1">Fulfilled POs</span>
                              <span className="text-lg font-black">{procurement?.receivedPoCount || 0}</span>
                           </div>
                        </div>
                     </div>
                  </div>

                  <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
                     <div className="p-5 border-b border-gray-50"><h4 className="text-[10px] font-black uppercase tracking-widest text-gray-400 italic">Cashier Contribution</h4></div>
                     <table className="w-full text-left text-[11px]">
                        <thead className="bg-gray-50 text-[9px] font-black text-gray-400">
                           <tr className="uppercase tracking-widest"><th className="px-6 py-3">Cashier</th><th className="px-4 py-3">Orders</th><th className="px-6 py-3 text-right">Gross Generated</th></tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50 font-black">
                           {(summary?.cashierSales || []).map((c) => (
                             <tr key={c.cashier} className="hover:bg-gray-50/30">
                                <td className="px-6 py-4 text-gray-900 uppercase tracking-tighter">{c.cashier || "System"}</td>
                                <td className="px-4 py-4 text-gray-500 font-medium">{c.paid_orders} Txns</td>
                                <td className="px-6 py-4 text-right text-gray-900">{money(c.gross_sales)}</td>
                             </tr>
                           ))}
                        </tbody>
                     </table>
                  </div>
               </div>
            </div>
          )}

          {reportTab === 'system' && (
            <div className="max-w-4xl mx-auto space-y-6 animate-in slide-in-from-bottom-4 duration-500 pb-12">
               <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-8 space-y-8">
                  <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                     <div>
                        <h3 className="text-xl font-black text-gray-900">Vault & System Maintenance</h3>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1 italic">Database Backups & Disaster Recovery Tools</p>
                     </div>
                     <button className="px-8 py-4 bg-teal-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-teal-100 hover:bg-teal-700 transition-all active:scale-95" onClick={createBackupNow}>Initialize Instant Backup</button>
                  </div>

                  <div className="space-y-4">
                     <div className="flex items-center gap-4 p-4 bg-blue-50 border border-blue-100 rounded-3xl">
                        <div className="w-12 h-12 bg-white rounded-2xl shadow-sm flex items-center justify-center text-xl">🕒</div>
                        <div className="flex-1">
                           <label className="text-[10px] font-black text-blue-600 uppercase tracking-widest block mb-1">Available Recovery Points</label>
                           <select className="w-full bg-transparent border-none text-sm font-black text-blue-900 outline-none cursor-pointer" value={selectedBackup} onChange={(e) => setSelectedBackup(e.target.value)}>
                              <option value="">Select a snapshot for restoration...</option>
                              {backups.map(b => <option key={b.fileName} value={b.fileName}>{b.fileName} ({ (b.sizeBytes / 1024).toFixed(1) } KB)</option>)}
                           </select>
                        </div>
                        <button className="px-6 py-2 bg-gray-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-black transition-all" onClick={restoreSelectedBackup}>Restore</button>
                     </div>

                     <div className="overflow-hidden border border-gray-50 rounded-3xl">
                        <table className="w-full text-left text-xs">
                           <thead className="bg-gray-50 text-[9px] font-black text-gray-400 uppercase tracking-widest">
                              <tr><th className="px-8 py-4">Snapshot Identifier</th><th className="px-6 py-4">Creation Date</th><th className="px-8 py-4 text-right">Payload Size</th></tr>
                           </thead>
                           <tbody className="divide-y divide-gray-50 font-bold">
                              {backups.map(b => (
                                <tr key={b.fileName} className="hover:bg-gray-50/50 transition-colors">
                                   <td className="px-8 py-4 text-gray-900 italic">{b.fileName}</td>
                                   <td className="px-6 py-4 text-gray-400">{b.modifiedAt}</td>
                                   <td className="px-8 py-4 text-right font-black text-teal-600">{(b.sizeBytes / 1024).toFixed(2)} KB</td>
                                </tr>
                              ))}
                           </tbody>
                        </table>
                     </div>
                  </div>
               </div>
            </div>
          )}
        </div>

        {/* Feedback Messages */}
        {message && (
          <div className="fixed bottom-6 right-6 px-8 py-5 bg-gray-900 text-white rounded-[2rem] font-black shadow-2xl animate-in slide-in-from-right-full z-50 text-xs uppercase tracking-widest border border-white/10 flex items-center gap-4">
             <span className="w-2 h-2 bg-teal-400 rounded-full animate-ping"></span>
             {message}
          </div>
        )}
        {error && (
          <div className="fixed bottom-6 right-6 px-8 py-5 bg-red-600 text-white rounded-[2rem] font-black shadow-2xl animate-in shake z-50 text-xs uppercase tracking-widest flex items-center gap-4 border-b-4 border-red-800">
             <span className="text-xl">⚠️</span>
             {error}
          </div>
        )}
      </div>
    );
  }

  window.POSComponents = window.POSComponents || {};
  window.POSComponents.Reports = Reports;
})();
