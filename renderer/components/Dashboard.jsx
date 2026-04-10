
(function () {
  const { useEffect, useMemo, useState } = React;
  const { money } = window.POSUtils.db;

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function barHeights(values, maxHeight) {
    const max = Math.max(1, ...values.map((v) => Number(v || 0)));
    return values.map((v) => Math.round((Number(v || 0) / max) * maxHeight));
  }

  function Dashboard({ user }) {
    const [dailySummary, setDailySummary] = useState(null);
    const [monthlySummary, setMonthlySummary] = useState(null);
    const [creditStats, setCreditStats] = useState(null);
    const [error, setError] = useState("");

    async function load() {
      setError("");
      const [dailyResp, monthlyResp] = await Promise.all([
        window.posAPI.getReportSummary({ range: "daily" }),
        window.posAPI.getReportSummary({ range: "monthly" })
      ]);
      if (!dailyResp.ok) throw new Error(dailyResp.error || "Failed to load daily summary.");
      if (!monthlyResp.ok) throw new Error(monthlyResp.error || "Failed to load monthly summary.");
      setDailySummary(dailyResp.summary);
      setMonthlySummary(monthlyResp.summary);
      try {
        const creditResp = await window.posAPI.getCreditDashboardStats();
        if (!creditResp.ok) throw new Error(creditResp.error || "Failed to load credit stats.");
        setCreditStats(creditResp.stats);
      } catch (e) {
        setCreditStats(null);
      }
    }

    useEffect(() => {
      load().catch((e) => setError(e.message || "Failed to load dashboard."));
    }, []);

    const dailySales = dailySummary?.sales?.gross_sales || 0;
    const monthlySales = monthlySummary?.sales?.gross_sales || 0;
    const customerCredit = creditStats?.customerOutstandingTotal || 0;
    const vendorPayables = creditStats?.vendorPayableTotal || 0;
    const compareHeights = barHeights([dailySales, monthlySales], 120);
    const creditHeights = barHeights([customerCredit, vendorPayables], 110);

    const paymentMix = useMemo(() => {
      const rows = dailySummary?.cashierSales || [];
      const total = rows.reduce((a, r) => a + Number(r.gross_sales || 0), 0) || 1;
      return rows.slice(0, 5).map((r) => ({
        label: r.cashier || "-",
        value: Number(r.gross_sales || 0),
        pct: clamp(Math.round((Number(r.gross_sales || 0) / total) * 100), 0, 100)
      }));
    }, [dailySummary]);

    const topItems = dailySummary?.topItems || [];
    const topItemHeights = barHeights(topItems.map((i) => i.qty || 0), 120);

    return (
      <div className="screen-grid dashboard-screen">
        <div className="card dashboard-hero">
          <div>
            <h2>Business Snapshot</h2>
            <p className="muted">Welcome back, {user?.username || "User"}. Here is today and month-to-date performance.</p>
          </div>
          <button onClick={load}>Refresh</button>
        </div>

        <div className="dashboard-kpis">
          <div className="card kpi">
            <span>Daily Sales</span>
            <strong>{money(dailySales)}</strong>
            <small>Paid orders: {dailySummary?.sales?.paid_orders || 0}</small>
          </div>
          <div className="card kpi">
            <span>Monthly Sales</span>
            <strong>{money(monthlySales)}</strong>
            <small>Paid orders: {monthlySummary?.sales?.paid_orders || 0}</small>
          </div>
          <div className="card kpi">
            <span>Customer Credit</span>
            <strong>{money(customerCredit)}</strong>
            <small>Customers due: {creditStats?.customerDueCount || 0}</small>
          </div>
          <div className="card kpi">
            <span>Vendor Payables</span>
            <strong>{money(vendorPayables)}</strong>
            <small>Vendor payments today: {money(creditStats?.todayVendorPaymentsTotal || 0)}</small>
          </div>
        </div>

        <div className="dashboard-charts">
          <div className="card chart-card">
            <h3>Sales Comparison</h3>
            <svg viewBox="0 0 320 180" className="chart-svg">
              <rect x="0" y="0" width="320" height="180" rx="16" fill="#f7f9fb" />
              <line x1="40" y1="150" x2="290" y2="150" stroke="#cbd5dc" strokeWidth="2" />
              <rect x="80" y={150 - compareHeights[0]} width="60" height={compareHeights[0]} fill="#84aeb9" rx="6" />
              <rect x="180" y={150 - compareHeights[1]} width="60" height={compareHeights[1]} fill="#526b35" rx="6" />
              <text x="110" y="165" textAnchor="middle" fontSize="12" fill="#43505a">Daily</text>
              <text x="210" y="165" textAnchor="middle" fontSize="12" fill="#43505a">Monthly</text>
            </svg>
            <div className="chart-legend">
              <span>Daily: {money(dailySales)}</span>
              <span>Monthly: {money(monthlySales)}</span>
            </div>
          </div>

          <div className="card chart-card">
            <h3>Top Items (Today)</h3>
            <svg viewBox="0 0 320 180" className="chart-svg">
              <rect x="0" y="0" width="320" height="180" rx="16" fill="#f7f9fb" />
              <line x1="24" y1="150" x2="296" y2="150" stroke="#cbd5dc" strokeWidth="2" />
              {topItems.slice(0, 6).map((item, idx) => {
                const h = topItemHeights[idx] || 0;
                const x = 30 + idx * 45;
                const y = 150 - h;
                return <rect key={item.name} x={x} y={y} width="28" height={h} fill="#9ebfc8" rx="6" />;
              })}
            </svg>
            <div className="chart-legend">
              {topItems.slice(0, 3).map((item) => (
                <span key={item.name}>{item.name}: {item.qty}</span>
              ))}
            </div>
          </div>

          <div className="card chart-card">
            <h3>Cashier Share (Daily)</h3>
            <div className="donut-wrap">
              <svg viewBox="0 0 200 200" className="chart-svg">
                <circle cx="100" cy="100" r="70" fill="none" stroke="#e2e6ea" strokeWidth="24" />
                {paymentMix.reduce((acc, row, idx) => {
                  const dash = `${row.pct * 4.4} ${440 - row.pct * 4.4}`;
                  const rot = acc.offset;
                  acc.offset += row.pct * 3.6;
                  acc.parts.push(
                    <circle
                      key={row.label}
                      cx="100"
                      cy="100"
                      r="70"
                      fill="none"
                      stroke={idx % 2 === 0 ? "#84aeb9" : "#526b35"}
                      strokeWidth="24"
                      strokeDasharray={dash}
                      transform={`rotate(${rot} 100 100)`}
                    />
                  );
                  return acc;
                }, { offset: -90, parts: [] }).parts}
                <circle cx="100" cy="100" r="40" fill="#f7f9fb" />
                <text x="100" y="105" textAnchor="middle" fontSize="14" fill="#43505a">Daily</text>
              </svg>
              <div className="donut-legend">
                {paymentMix.length ? (
                  paymentMix.map((row) => (
                    <div key={row.label}>
                      <strong>{row.pct}%</strong>
                      <span>{row.label}</span>
                    </div>
                  ))
                ) : (
                  <div>
                    <strong>0%</strong>
                    <span>No sales yet</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="card chart-card">
            <h3>Credit vs Payables</h3>
            <svg viewBox="0 0 320 180" className="chart-svg">
              <rect x="0" y="0" width="320" height="180" rx="16" fill="#f7f9fb" />
              <line x1="40" y1="150" x2="290" y2="150" stroke="#cbd5dc" strokeWidth="2" />
              <rect x="90" y={150 - creditHeights[0]} width="50" height={creditHeights[0]} fill="#526b35" rx="6" />
              <rect x="180" y={150 - creditHeights[1]} width="50" height={creditHeights[1]} fill="#ec5a5e" rx="6" />
              <text x="115" y="165" textAnchor="middle" fontSize="12" fill="#43505a">Credit</text>
              <text x="205" y="165" textAnchor="middle" fontSize="12" fill="#43505a">Payable</text>
            </svg>
            <div className="chart-legend">
              <span>Customer: {money(customerCredit)}</span>
              <span>Vendor: {money(vendorPayables)}</span>
            </div>
          </div>
        </div>

        {error && <div className="error">{error}</div>}
      </div>
    );
  }

  window.POSComponents = window.POSComponents || {};
  window.POSComponents.Dashboard = Dashboard;
})();
