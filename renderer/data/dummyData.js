window.POSData = window.POSData || {};
window.POSData.dummyData = {
  kpi: {
    dailySales: 1250.50,
    monthlySales: 34200.00,
    customerCredit: 450.00,
    vendorPayables: 1200.00
  },
  salesChart: [
    { name: 'Mon', sales: 4000 },
    { name: 'Tue', sales: 3000 },
    { name: 'Wed', sales: 2000 },
    { name: 'Thu', sales: 2780 },
    { name: 'Fri', sales: 1890 },
    { name: 'Sat', sales: 2390 },
    { name: 'Sun', sales: 3490 },
  ],
  topItems: [
    { name: 'Cheeseburger', qty: 120 },
    { name: 'Fries', qty: 98 },
    { name: 'Coke', qty: 86 },
    { name: 'Pizza', qty: 65 },
    { name: 'Wings', qty: 45 },
  ],
  activityMetrics: [
    { id: 1, action: "Order #1024 Paid", time: "10:30 AM" },
    { id: 2, action: "Credit created for John", time: "11:15 AM" },
    { id: 3, action: "New Vendor Payable", time: "12:00 PM" },
    { id: 4, action: "Cash Session Opened", time: "08:00 AM" }
  ]
};
