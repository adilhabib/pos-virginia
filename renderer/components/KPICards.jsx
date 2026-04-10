(function() {
  function KPICards({ data }) {
    if (!data) return null;
    const { money } = window.POSUtils.db;
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
        <div className="bg-white rounded-2xl shadow-sm p-6 border border-gray-100 hover:shadow-md transition-shadow">
          <h4 className="text-gray-500 text-sm font-semibold mb-2 uppercase tracking-wide">Daily Sales</h4>
          <div className="text-3xl font-bold text-gray-800">{money(data.dailySales)}</div>
          <div className="mt-2 text-sm text-green-600 font-medium">↑ 12% vs yesterday</div>
        </div>
        <div className="bg-white rounded-2xl shadow-sm p-6 border border-gray-100 hover:shadow-md transition-shadow">
          <h4 className="text-gray-500 text-sm font-semibold mb-2 uppercase tracking-wide">Monthly Sales</h4>
          <div className="text-3xl font-bold text-gray-800">{money(data.monthlySales)}</div>
          <div className="mt-2 text-sm text-green-600 font-medium">↑ 8% vs last month</div>
        </div>
        <div className="bg-white rounded-2xl shadow-sm p-6 border border-gray-100 hover:shadow-md transition-shadow">
          <h4 className="text-gray-500 text-sm font-semibold mb-2 uppercase tracking-wide">Customer Credit</h4>
          <div className="text-3xl font-bold text-yellow-600">{money(data.customerCredit)}</div>
          <div className="mt-2 text-sm text-gray-400 font-medium">Outstanding</div>
        </div>
        <div className="bg-white rounded-2xl shadow-sm p-6 border border-gray-100 hover:shadow-md transition-shadow">
          <h4 className="text-gray-500 text-sm font-semibold mb-2 uppercase tracking-wide">Vendor Payables</h4>
          <div className="text-3xl font-bold text-red-500">{money(data.vendorPayables)}</div>
          <div className="mt-2 text-sm text-gray-400 font-medium">Due this week</div>
        </div>
      </div>
    );
  }

  window.POSComponents = window.POSComponents || {};
  window.POSComponents.KPICards = KPICards;
})();
