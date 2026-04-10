(function () {
  function TopItems({ data }) {
    if (!data || data.length === 0) {
      return (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 h-full flex flex-col">
          <h3 className="text-xl font-bold text-gray-800 mb-6 font-sans">Top Items</h3>
          <div className="flex-1 flex items-center justify-center text-gray-400 italic">No sales today</div>
        </div>
      );
    }

    // Find max to calculate progress bar percentages
    const maxQty = Math.max(1, ...data.map(d => d.qty));

    return (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 h-full flex flex-col">
        <h3 className="text-xl font-bold text-gray-800 mb-6 font-sans">Top Items</h3>
        <div className="space-y-4 flex-1 overflow-y-auto pr-2">
          {data.map((item, idx) => (
            <div key={idx} className="flex flex-col gap-1">
              <div className="flex justify-between text-sm font-medium text-gray-700">
                <span>{item.name}</span>
                <span>{item.qty}</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2.5">
                <div
                  className="bg-teal-500 h-2.5 rounded-full"
                  style={{ width: `${(item.qty / maxQty) * 100}%` }}
                ></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  window.POSComponents = window.POSComponents || {};
  window.POSComponents.TopItems = TopItems;
})();
