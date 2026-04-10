(function() {
  function CreditPanel({ data }) {
    if (!data) return null;
    
    const customer = data.customerCredit;
    const vendor = data.vendorPayables;
    const total = customer + vendor;
    const customerPct = total > 0 ? (customer / total) * 100 : 0;
    const vendorPct = total > 0 ? (vendor / total) * 100 : 0;

    const { money } = window.POSUtils.db;

    return (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 h-full flex flex-col">
        <h3 className="text-xl font-bold text-gray-800 mb-6 font-sans">Credit vs Payables</h3>
        
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-yellow-500"></span>
            <span className="text-sm font-medium text-gray-600">Customer</span>
          </div>
          <span className="font-bold text-gray-800">{money(customer)}</span>
        </div>

        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-red-400"></span>
            <span className="text-sm font-medium text-gray-600">Vendor</span>
          </div>
          <span className="font-bold text-gray-800">{money(vendor)}</span>
        </div>

        <div className="w-full h-4 flex rounded-full overflow-hidden mb-2">
          <div className="bg-yellow-500 h-full" style={{ width: `${customerPct}%` }}></div>
          <div className="bg-red-400 h-full" style={{ width: `${vendorPct}%` }}></div>
        </div>
        <div className="flex justify-between text-xs text-gray-400">
          <span>{customerPct.toFixed(0)}%</span>
          <span>{vendorPct.toFixed(0)}%</span>
        </div>
      </div>
    );
  }

  window.POSComponents = window.POSComponents || {};
  window.POSComponents.CreditPanel = CreditPanel;
})();
