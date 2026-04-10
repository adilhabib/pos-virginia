(function() {
  const { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } = window.Recharts || {};

  function SalesChart({ data }) {
    if (!window.Recharts) return <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 h-80 flex items-center justify-center text-gray-500">Recharts not loaded</div>;
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 h-full flex flex-col">
        <h3 className="text-xl font-bold text-gray-800 mb-6 font-sans">Sales Trend</h3>
        <div className="flex-1 w-full min-h-[250px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 5, right: 20, left: -20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#9CA3AF'}} dy={10} />
              <YAxis axisLine={false} tickLine={false} tick={{fill: '#9CA3AF'}} />
              <Tooltip 
                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
              />
              <Line type="monotone" dataKey="sales" stroke="#0F766E" strokeWidth={3} dot={{r: 4, strokeWidth: 2}} activeDot={{ r: 8, fill: '#0F766E' }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    );
  }

  window.POSComponents = window.POSComponents || {};
  window.POSComponents.SalesChart = SalesChart;
})();
