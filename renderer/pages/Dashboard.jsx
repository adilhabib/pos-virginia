(function () {
  const { useState, useEffect } = React;

  function DashboardPage() {
    const { KPICards, SalesChart, TopItems, CreditPanel, ActivityPanel } = window.POSComponents || {};
    const [data, setData] = useState({
      kpi: null,
      topItems: [],
      salesChart: [],
      activityMetrics: []
    });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    async function fetchData() {
      try {
        setLoading(true);
        const [dailyResp, monthlyResp, creditResp] = await Promise.all([
          window.posAPI.getReportSummary({ range: "daily" }),
          window.posAPI.getReportSummary({ range: "monthly" }),
          window.posAPI.getCreditDashboardStats()
        ]);

        if (!dailyResp.ok || !monthlyResp.ok || !creditResp.ok) {
          throw new Error("Failed to fetch some dashboard data");
        }

        const dailySales = dailyResp.summary?.sales?.gross_sales || 0;
        const monthlySales = monthlyResp.summary?.sales?.gross_sales || 0;
        const customerCredit = creditResp.stats?.customerOutstandingTotal || 0;
        const vendorPayables = creditResp.stats?.vendorPayableTotal || 0;

        // Transform for KPICards
        const kpi = {
          dailySales,
          monthlySales,
          customerCredit,
          vendorPayables,
          comp: dailyResp.summary?.comparison,
          monthComp: monthlyResp.summary?.comparison
        };

        // Top Items from daily summary
        const topItems = (dailyResp.summary?.topItems || []).map(item => ({
          name: item.name,
          qty: item.qty
        }));

        const { money } = window.POSUtils.db;

        // Activity Metrics (Mocking for now as no direct API exists, but using actual stats if possible)
        // In a real scenario, we'd fetch audit logs
        const activityMetrics = [
          { id: 1, action: `Daily sales volume: ${dailyResp.summary?.sales?.paid_orders || 0} orders`, time: "Today" },
          { id: 2, action: `Monthly sales volume: ${monthlyResp.summary?.sales?.paid_orders || 0} orders`, time: "This Month" },
          { id: 3, action: `Customer Due Count: ${creditResp.stats?.customerDueCount || 0}`, time: "Today" },
          { id: 4, action: `Today's Vendor Payments: ${money(creditResp.stats?.todayVendorPaymentsTotal || 0)}`, time: "Today" }
        ];

        // Sales Chart (Simulating a trend since we only have daily/monthly totals)
        // In a real app, you'd fetch sales by day for the week
        const salesChart = [
          { name: 'Month Target', sales: monthlySales / 4 },
          { name: 'Daily Actual', sales: dailySales }
        ];

        setData({ kpi, topItems, salesChart, activityMetrics });
        setError(null);
      } catch (err) {
        console.error(err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    useEffect(() => {
      fetchData();
    }, []);

    if (loading) return (
      <div className="flex items-center justify-center h-64">
        <div className="text-xl font-medium text-gray-500 animate-pulse">Loading dashboard...</div>
      </div>
    );

    if (error) return (
      <div className="p-8 bg-red-50 text-red-700 rounded-2xl border border-red-100">
        <h3 className="font-bold text-lg mb-2">Error Loading Dashboard</h3>
        <p>{error}</p>
        <button onClick={fetchData} className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg">Retry</button>
      </div>
    );

    return (
      <div className="w-full flex justify-center">
        <div className="w-full max-w-[1400px]">
          <div className="flex justify-between items-end mb-8">
            <div>
              <h2 className="text-3xl font-extrabold text-gray-800 mb-1 tracking-tight">Dashboard</h2>
              <p className="text-gray-500 font-medium">Welcome back. Here's what's happening today.</p>
            </div>
            <button
              onClick={fetchData}
              className="bg-white border border-gray-200 px-4 py-2 rounded-xl text-gray-600 font-bold hover:bg-gray-50 flex items-center gap-2"
            >
              <span>Refresh</span>
            </button>
          </div>

          <KPICards data={data.kpi} />

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
            <div className="lg:col-span-2">
              <SalesChart data={data.salesChart} />
            </div>
            <div>
              <TopItems data={data.topItems} />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 pb-12">
            <div className="lg:col-span-2">
              <CreditPanel data={data.kpi} />
            </div>
            <div>
              <ActivityPanel data={data.activityMetrics} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  window.POSPages = window.POSPages || {};
  window.POSPages.Dashboard = DashboardPage;
})();
