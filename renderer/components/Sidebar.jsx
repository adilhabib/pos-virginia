(function() {
  function NavIcon({ name }) {
    const common = {
      width: 20,
      height: 20,
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

  function Sidebar({ activeKey, onSelect, navItems, onLogout }) {
    return (
      <aside className="w-full h-full bg-white flex flex-col border-r border-gray-100">
        <div className="p-4 flex items-center justify-center h-20">
          <img className="h-10 w-auto object-contain" src="../assets/logo.png" alt="Logo" />
        </div>
        <nav className="flex-1 px-3 py-6 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = activeKey === item.key;
            return (
              <button
                key={item.key}
                onClick={() => onSelect(item)}
                className={`w-full flex lg:flex-row flex-col items-center gap-3 px-3 py-3 rounded-xl transition-all duration-300 ${
                  isActive 
                    ? "bg-teal-600 text-white font-bold shadow-md transform scale-[1.02]" 
                    : "text-gray-400 hover:bg-gray-50 hover:text-teal-600 font-medium"
                }`}
              >
                <NavIcon name={item.icon} />
                <span className="text-[10px] lg:text-xs uppercase font-bold tracking-tighter lg:tracking-normal">{item.label}</span>
              </button>
            );
          })}
        </nav>
        <div className="p-4 border-t border-gray-50 bg-gray-50/30">
          <button 
            onClick={onLogout}
            className="w-full py-2 px-4 text-gray-400 font-bold hover:text-red-500 transition-colors uppercase text-[10px] tracking-widest text-center"
          >
            Sign Out
          </button>
        </div>
      </aside>
    );
  }

  window.POSComponents = window.POSComponents || {};
  window.POSComponents.Sidebar = Sidebar;
})();
