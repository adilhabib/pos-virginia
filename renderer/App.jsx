const { useEffect, useMemo, useState } = React;

const NAV_ITEMS = [
  { key: "dashboard", target: "dashboard", label: "DASHBOARD", icon: "dashboard", roles: ["ADMIN", "MANAGER", "CASHIER"] },
  { key: "home", target: "orders", label: "HOME", icon: "home", roles: ["ADMIN", "MANAGER", "CASHIER"] },
  { key: "payment", target: "checkout", label: "PAYMENT", icon: "payment", roles: ["ADMIN", "MANAGER", "CASHIER"] },
  { key: "credit", target: "credit", label: "CREDIT", icon: "credit", roles: ["ADMIN", "MANAGER", "CASHIER"] },
  { key: "inventory", target: "inventory", label: "INVENTORY", icon: "inventory", roles: ["ADMIN", "MANAGER"] },
  { key: "employees", target: "employees", label: "EMPLOYEE", icon: "employees", roles: ["ADMIN"] },
  { key: "reports", target: "reports", label: "REPORTS", icon: "reports", roles: ["ADMIN", "MANAGER"] },
  { key: "cash", target: "cash", label: "SETTINGS", icon: "settings", roles: ["ADMIN", "MANAGER", "CASHIER"] }
];

function NavIcon({ name }) {
  const common = {
    width: 22,
    height: 22,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round",
    strokeLinejoin: "round"
  };

  if (name === "home") {
    return (
      <svg {...common}>
        <path d="M3 10.5 12 3l9 7.5" />
        <path d="M5 9.5V20h14V9.5" />
      </svg>
    );
  }
  if (name === "payment") {
    return (
      <svg {...common}>
        <rect x="2" y="5" width="20" height="14" rx="2" />
        <path d="M2 10h20" />
      </svg>
    );
  }
  if (name === "dashboard") {
    return (
      <svg {...common}>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="11" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="16" width="7" height="5" rx="1" />
      </svg>
    );
  }
  if (name === "credit") {
    return (
      <svg {...common}>
        <path d="M4 7h16" />
        <path d="M4 12h16" />
        <path d="M4 17h10" />
        <path d="M18 14v6" />
        <path d="M15 17h6" />
      </svg>
    );
  }
  if (name === "inventory") {
    return (
      <svg {...common}>
        <rect x="3" y="4" width="8" height="7" rx="1" />
        <rect x="13" y="4" width="8" height="7" rx="1" />
        <rect x="3" y="13" width="8" height="7" rx="1" />
        <rect x="13" y="13" width="8" height="7" rx="1" />
      </svg>
    );
  }
  if (name === "reports") {
    return (
      <svg {...common}>
        <path d="M4 20h16" />
        <path d="M7 16v-5" />
        <path d="M12 16V8" />
        <path d="M17 16v-3" />
      </svg>
    );
  }
  if (name === "employees") {
    return (
      <svg {...common}>
        <circle cx="9" cy="8" r="3" />
        <path d="M3 19c0-3.3 2.7-6 6-6s6 2.7 6 6" />
        <circle cx="18" cy="9" r="2" />
        <path d="M14.5 19c.4-2.2 2.3-4 4.6-4 1.1 0 2.1.4 2.9 1.1" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1 1 0 0 0 .2 1.1l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1 1 0 0 0-1.1-.2 1 1 0 0 0-.6.9V20a2 2 0 1 1-4 0v-.2a1 1 0 0 0-.6-.9 1 1 0 0 0-1.1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1 1 0 0 0 .2-1.1 1 1 0 0 0-.9-.6H4a2 2 0 1 1 0-4h.2a1 1 0 0 0 .9-.6 1 1 0 0 0-.2-1.1l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1 1 0 0 0 1.1.2H9a1 1 0 0 0 .6-.9V4a2 2 0 1 1 4 0v.2a1 1 0 0 0 .6.9h.1a1 1 0 0 0 1.1-.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1 1 0 0 0-.2 1.1V9a1 1 0 0 0 .9.6H20a2 2 0 1 1 0 4h-.2a1 1 0 0 0-.9.6z" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

function DateIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  );
}

function formatNow() {
  const d = new Date();
  const date = d.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${date}, ${time}`;
}


function App() {
  const [user, setUser] = useState(null);
  const [activeScreen, setActiveScreen] = useState("dashboard");
  const [activeNavKey, setActiveNavKey] = useState("dashboard");
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [cashShiftOpen, setCashShiftOpen] = useState(true);
  const [cashShiftPromptVisible, setCashShiftPromptVisible] = useState(false);
  const [cashShiftPromptError, setCashShiftPromptError] = useState("");

  const availableNav = useMemo(() => {
    if (!user) return [];
    return NAV_ITEMS.filter((n) => n.roles.includes(user.role));
  }, [user]);

  function handleOrderSelected(order, items) {
    if (!order) {
      setSelectedOrder(null);
      return;
    }
    setSelectedOrder({ order, items });
  }

  function handleOrderPaid() {
    setSelectedOrder(null);
  }

  function goToPayment() {
    setActiveNavKey("payment");
    setActiveScreen("checkout");
  }

  async function refreshCashShiftStatus() {
    if (!user) return;
    try {
      const resp = await window.POSUtils.cash.getOpenSession();
      const isOpen = !!resp?.session && resp.session.status === "OPEN";
      setCashShiftOpen(isOpen);
      setCashShiftPromptVisible(!isOpen);
      setCashShiftPromptError("");
    } catch (err) {
      setCashShiftOpen(false);
      setCashShiftPromptVisible(true);
      setCashShiftPromptError(err.message || "Unable to verify cash shift status.");
    }
  }

  function navigateToCashShift() {
    setActiveNavKey("cash");
    setActiveScreen("cash");
    setCashShiftPromptVisible(false);
  }

  useEffect(() => {
    if (!user) {
      setCashShiftOpen(true);
      setCashShiftPromptVisible(false);
      setCashShiftPromptError("");
      return;
    }
    refreshCashShiftStatus();
    const t = setInterval(() => {
      refreshCashShiftStatus();
    }, 15000);
    return () => clearInterval(t);
  }, [user]);

  useEffect(() => {
    if (user && activeScreen !== "cash") {
      refreshCashShiftStatus();
    }
  }, [activeScreen]);

  if (!user) return <window.POSComponents.Login onLogin={setUser} />;

  return (
    <>
      {cashShiftPromptVisible && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 backdrop-blur-sm p-4 animate-in fade-in duration-300">
          <div className="bg-white rounded-3xl shadow-2xl border border-gray-100 p-8 max-w-sm w-full text-center space-y-6">
            <div className="w-16 h-16 bg-yellow-100 text-yellow-600 rounded-full flex items-center justify-center mx-auto text-2xl">⚠️</div>
            <div>
              <h3 className="text-xl font-black text-gray-900 uppercase tracking-tight">Shift Not Open</h3>
              <p className="text-gray-400 text-sm mt-2">Open a cash shift session before proceeding with any sales or payments.</p>
            </div>
            {cashShiftPromptError && <div className="p-3 bg-red-50 text-red-600 rounded-xl text-xs font-bold">{cashShiftPromptError}</div>}
            <div className="space-y-2 pt-2">
              <button className="w-full py-4 bg-teal-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-teal-700 shadow-lg shadow-teal-100 transition-all" onClick={navigateToCashShift}>Open Cash Shift</button>
              <button className="w-full py-3 text-gray-400 hover:text-gray-600 font-bold text-[10px] uppercase tracking-widest transition-colors" onClick={navigateToCashShift}>Skip to Session Page</button>
            </div>
          </div>
        </div>
      )}

      <window.POSLayouts.MainLayout
        sidebar={
          <window.POSComponents.Sidebar
            navItems={availableNav}
            activeKey={activeNavKey}
            onSelect={(item) => {
              setActiveNavKey(item.key);
              setActiveScreen(item.target);
              if (item.target === "cash") {
                setCashShiftPromptVisible(false);
              } else if (!cashShiftOpen) {
                setCashShiftPromptVisible(true);
              }
            }}
            onLogout={() => setUser(null)}
          />
        }
        topbar={<window.POSComponents.Topbar dateString={formatNow()} />}
      >
        {activeScreen === "dashboard" && <window.POSPages.Dashboard />}
        {activeScreen === "orders" && (
          <window.POSComponents.OrderScreen user={user} onOrderSelected={handleOrderSelected} onGoToPayment={goToPayment} />
        )}
        {activeScreen === "checkout" && (
          <window.POSComponents.Checkout user={user} selectedOrder={selectedOrder} onPaid={handleOrderPaid} />
        )}
        {activeScreen === "credit" && <window.POSComponents.CreditRegister user={user} />}
        {activeScreen === "inventory" && <window.POSComponents.Inventory user={user} />}
        {activeScreen === "employees" && <window.POSComponents.Employees user={user} />}
        {activeScreen === "cash" && <window.POSComponents.CashSession user={user} />}
        {activeScreen === "reports" && <window.POSComponents.Reports user={user} />}
      </window.POSLayouts.MainLayout>
    </>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
