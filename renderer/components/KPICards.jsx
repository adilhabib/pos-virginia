(function() {
  function KPICards({ data }) {
    if (!data) return null;
    const { money } = window.POSUtils.db;
    function Trend({ value, label }) {
      if (value === undefined || value === null) return null;
      const isUp = value > 0;
      const isDown = value < 0;
      const color = isUp ? "text-green-600" : isDown ? "text-red-500" : "text-gray-400";
      const arrow = isUp ? "↑" : isDown ? "↓" : "→";
      return (
        <div className={`mt-2 text-sm font-medium ${color}`}>
          {arrow} {Math.abs(value)}% vs {label}
        </div>
      );
    }

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
        <div className="bg-white rounded-2xl shadow-sm p-6 border border-gray-100 hover:shadow-md transition-shadow">
          <h4 className="text-gray-500 text-sm font-semibold mb-2 uppercase tracking-wide">Daily Sales</h4>
          <div className="text-3xl font-bold text-gray-800">{money(data.dailySales)}</div>
          <Trend value={data.comp?.salesChangePct} label="yesterday" />
        </div>
        <div className="bg-white rounded-2xl shadow-sm p-6 border border-gray-100 hover:shadow-md transition-shadow">
          <h4 className="text-gray-500 text-sm font-semibold mb-2 uppercase tracking-wide">Monthly Sales</h4>
          <div className="text-3xl font-bold text-gray-800">{money(data.monthlySales)}</div>
          <Trend value={data.monthComp?.salesChangePct} label="last month" />
        </div>
        <div className="bg-white rounded-2xl shadow-sm p-6 border border-gray-100 hover:shadow-md transition-shadow">
          <h4 className="text-gray-500 text-sm font-semibold mb-2 uppercase tracking-wide">Customer Credit</h4>
          <div className="text-3xl font-bold text-yellow-600">{money(data.customerCredit)}</div>
          <div className="mt-2 text-sm text-gray-400 font-medium">Outstanding</div>
        </div>
        <div className="bg-white rounded-2xl shadow-sm p-6 border border-gray-100 hover:shadow-md transition-shadow">
          <h4 className="text-gray-500 text-sm font-semibold mb-2 uppercase tracking-wide">Vendor Payables</h4>
          <div className="text-3xl font-bold text-red-500">{money(data.vendorPayables)}</div>
          <div className="mt-2 text-sm text-gray-400 font-medium font-bold text-red-400">Due Today</div>
        </div>
      </div>
    );
  }

  window.POSComponents = window.POSComponents || {};
  window.POSComponents.KPICards = KPICards;
})();
