(function() {
  function ActivityPanel({ data }) {
    if (!data) return null;

    return (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 h-full flex flex-col">
        <h3 className="text-xl font-bold text-gray-800 mb-6 font-sans">Recent Activity</h3>
        <div className="space-y-4 flex-1 overflow-y-auto pr-2">
          {data.map((item) => (
            <div key={item.id} className="flex gap-4 items-start pb-4 border-b border-gray-50 last:border-0 last:pb-0">
              <div className="w-2 h-2 mt-2 rounded-full bg-teal-400 shadow-[0_0_0_4px_rgba(45,212,191,0.2)]"></div>
              <div className="flex-1">
                <p className="text-gray-800 font-medium text-sm">{item.action}</p>
                <span className="text-xs text-gray-400">{item.time}</span>
              </div>
            </div>
          ))}
        </div>
        <button className="mt-4 w-full py-2 bg-gray-50 text-teal-600 font-medium text-sm rounded-xl hover:bg-gray-100 transition-colors">
          View All Activity
        </button>
      </div>
    );
  }

  window.POSComponents = window.POSComponents || {};
  window.POSComponents.ActivityPanel = ActivityPanel;
})();
