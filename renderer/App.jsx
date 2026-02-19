const { useMemo, useState } = React;

const NAV_ITEMS = [
  { key: "home", target: "orders", label: "HOME", icon: "home", roles: ["ADMIN", "MANAGER", "CASHIER"] },
  { key: "kitchen", target: "kds", label: "KITCHEN", icon: "kitchen", roles: ["ADMIN", "MANAGER", "CASHIER"] },
  { key: "payment", target: "checkout", label: "PAYMENT", icon: "payment", roles: ["ADMIN", "MANAGER", "CASHIER"] },
  { key: "inventory", target: "inventory", label: "INVENTORY", icon: "inventory", roles: ["ADMIN", "MANAGER"] },
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
  if (name === "kitchen") {
    return (
      <svg {...common}>
        <path d="M4 3v7a4 4 0 0 0 4 4h0V3" />
        <path d="M8 3v11" />
        <path d="M12 3v6" />
        <path d="M16 9a3 3 0 1 0 0 6h0V3" />
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
  const [activeScreen, setActiveScreen] = useState("orders");
  const [activeNavKey, setActiveNavKey] = useState("home");
  const [selectedOrder, setSelectedOrder] = useState(null);

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

  if (!user) return <window.POSComponents.Login onLogin={setUser} />;

  return (
    <div className="replica-shell">
      <header className="replica-topbar">
        <div className="logo-mark">
          <img className="logo-image" src="../assets/logo.png" alt="POS logo" />
        </div>
        <div className="top-right-tools">
          <div className="top-search">
            <input placeholder="Search product or any order..." />
            <span><SearchIcon /></span>
          </div>
          <div className="top-date">
            <DateIcon />
            <span>{formatNow()}</span>
          </div>
        </div>
      </header>

      <div className="replica-body">
        <aside className="replica-nav">
          {availableNav.map((item) => (
            <button
              key={item.key}
              className={activeNavKey === item.key ? "left-nav-item active" : "left-nav-item"}
              onClick={() => {
                setActiveNavKey(item.key);
                setActiveScreen(item.target);
              }}
            >
              <span className="icon"><NavIcon name={item.icon} /></span>
              <span>{item.label}</span>
            </button>
          ))}
          <div className="version-tag">v.1.0</div>
          <button className="logout-lite" onClick={() => setUser(null)}>Log out</button>
        </aside>

        <main className="replica-main">
          {activeScreen === "orders" && (
            <window.POSComponents.OrderScreen user={user} onOrderSelected={handleOrderSelected} />
          )}
          {activeScreen === "checkout" && (
            <window.POSComponents.Checkout user={user} selectedOrder={selectedOrder} onPaid={handleOrderPaid} />
          )}
          {activeScreen === "kds" && <window.POSComponents.KDS user={user} />}
          {activeScreen === "inventory" && <window.POSComponents.Inventory user={user} />}
          {activeScreen === "cash" && <window.POSComponents.CashSession user={user} />}
          {activeScreen === "reports" && <window.POSComponents.Reports />}
        </main>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
