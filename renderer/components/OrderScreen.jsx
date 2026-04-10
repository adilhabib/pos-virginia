(function () {
  const { useEffect, useMemo, useState } = React;
  const { money } = window.POSUtils.db;
  const ADD_NEW_CATEGORY = "__ADD_NEW_CATEGORY__";
  const ALL_SIZES = "__ALL_SIZES__";

  function imageStyleFromName(name) {
    const seed = Array.from(name).reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
    const hueA = seed % 360;
    const hueB = (seed + 55) % 360;
    return {
      background: `linear-gradient(135deg, hsl(${hueA} 55% 35%), hsl(${hueB} 60% 58%))`
    };
  }
  function categoryIcon(category) {
    const key = String(category || "").trim().toLowerCase();
    if (!key) return "\u{1F37D}";
    if (key.includes("pizza")) return "\u{1F355}";
    if (key.includes("burger") || key.includes("sandwich")) return "\u{1F354}";
    if (key.includes("drink") || key.includes("beverage") || key.includes("juice") || key.includes("coffee") || key.includes("tea")) return "\u{1F964}";
    if (key.includes("dessert") || key.includes("sweet") || key.includes("cake")) return "\u{1F370}";
    if (key.includes("fries") || key.includes("snack") || key.includes("side")) return "\u{1F35F}";
    if (key.includes("salad")) return "\u{1F957}";
    if (key.includes("rice") || key.includes("biryani")) return "\u{1F35B}";
    if (key.includes("chicken")) return "\u{1F357}";
    if (key.includes("seafood") || key.includes("fish")) return "\u{1F41F}";
    return "\u{1F372}";
  }

  function OrderScreen({ user, onOrderSelected, onGoToPayment }) {
    const canManageMenu = user.role === "ADMIN" || user.role === "MANAGER";

    const [menu, setMenu] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [statusMsg, setStatusMsg] = useState("");
    const [orderId, setOrderId] = useState(null);
    const [orderData, setOrderData] = useState(null);
    const [openOrders, setOpenOrders] = useState([]);
    const [promotions, setPromotions] = useState([]);
    const [customerName, setCustomerName] = useState("");
    const [customerPhone, setCustomerPhone] = useState("");
    const [discountMode, setDiscountMode] = useState("amount");
    const [discountValue, setDiscountValue] = useState("");
    const [promoCodeInput, setPromoCodeInput] = useState("");
    const [activeTab, setActiveTab] = useState("ALL");
    const [showEditor, setShowEditor] = useState(false);
    const [newName, setNewName] = useState("");
    const [newCategory, setNewCategory] = useState("");
    const [newCategoryCustom, setNewCategoryCustom] = useState("");
    const [newSize, setNewSize] = useState("");
    const [newPrice, setNewPrice] = useState("");
    const [newActive, setNewActive] = useState(true);
    const [editId, setEditId] = useState("");
    const [editName, setEditName] = useState("");
    const [editCategory, setEditCategory] = useState("");
    const [editCategoryCustom, setEditCategoryCustom] = useState("");
    const [editSize, setEditSize] = useState("");
    const [editPrice, setEditPrice] = useState("");
    const [editActive, setEditActive] = useState(true);
    const [activeSize, setActiveSize] = useState(ALL_SIZES);

    async function loadMenu() {
      setMenu(await window.POSUtils.orders.listMenu(user.id, canManageMenu));
    }

    async function loadOpenOrders() {
      const rows = await window.POSUtils.orders.listOpenOrders(user.id);
      setOpenOrders(rows);
    }

    async function loadPromotions() {
      const rows = await window.POSUtils.orders.listPromotions();
      setPromotions(rows.filter((p) => p.active));
    }

    async function refreshOrder(id) {
      const resp = await window.POSUtils.orders.getOrder(id);
      setOrderData(resp);
      setCustomerName(resp.order.customer_name || "");
      setCustomerPhone(resp.order.customer_phone || "");
      setPromoCodeInput(resp.order.promo_code || "");
      setDiscountMode("amount");
      const manualDiscountCents = resp.order.manual_discount_cents != null
        ? Number(resp.order.manual_discount_cents || 0)
        : Math.max(0, Number(resp.order.discount_cents || 0) - Number(resp.order.promo_discount_cents || 0));
      setDiscountValue((manualDiscountCents / 100).toFixed(2));
      onOrderSelected(resp.order, resp.items);
      await loadOpenOrders();
    }

    async function ensureOrder() {
      if (orderId) return orderId;
      const id = await window.POSUtils.orders.createOrder(user.id, "");
      if (customerName.trim() || customerPhone.trim()) {
        await window.POSUtils.orders.updateOrderCustomer(id, customerName, customerPhone, user.id);
      }
      setOrderId(id);
      await refreshOrder(id);
      await loadOpenOrders();
      return id;
    }

    async function saveCustomerIfPossible() {
      if (!orderId) return;
      try {
        await window.POSUtils.orders.updateOrderCustomer(orderId, customerName, customerPhone, user.id);
      } catch (err) {
        setError(err.message || "Unable to save customer details.");
      }
    }

    async function addItem(menuItemId) {
      setError("");
      try {
        const prevCount = orderData?.items ? orderData.items.length : 0;
        const id = await ensureOrder();
        await window.POSUtils.orders.addOrderItem(id, menuItemId, 1);
        const refreshed = await refreshOrder(id);
        if (onGoToPayment && prevCount === 0 && (refreshed?.items?.length || 0) > 0) {
          onGoToPayment();
        }
      } catch (err) {
        setError(err.message || "Failed to add item.");
      }
    }

    async function setQty(orderItemId, qty) {
      if (!orderId) return;
      setError("");
      try {
        await window.POSUtils.orders.updateOrderItemQty(orderId, orderItemId, qty);
        await refreshOrder(orderId);
      } catch (err) {
        setError(err.message || "Unable to update quantity.");
      }
    }

    async function applyDiscount() {
      const id = await ensureOrder();
      setError("");
      try {
        await window.POSUtils.orders.updateOrderDiscount(id, requestedManualDiscountCents, user.id);
        await refreshOrder(id);
        setStatusMsg("Discount applied.");
      } catch (err) {
        setError(err.message || "Unable to apply discount.");
      }
    }

    async function applyPromoCode() {
      const id = await ensureOrder();
      setError("");
      setStatusMsg("");
      try {
        await window.POSUtils.orders.applyOrderPromo(id, promoCodeInput, user.id);
        await refreshOrder(id);
        setStatusMsg("Promo applied.");
      } catch (err) {
        setError(err.message || "Unable to apply promo.");
      }
    }

    async function clearPromoCode() {
      if (!orderId) return;
      setError("");
      setStatusMsg("");
      try {
        await window.POSUtils.orders.clearOrderPromo(orderId, user.id);
        await refreshOrder(orderId);
        setPromoCodeInput("");
        setStatusMsg("Promo removed.");
      } catch (err) {
        setError(err.message || "Unable to clear promo.");
      }
    }

    async function cancelOrder() {
      if (!orderId) return;
      setError("");
      try {
        await window.POSUtils.orders.setOrderStatus(orderId, "CANCELLED", user.id);
        setStatusMsg("Order cancelled.");
        setOrderId(null);
        setOrderData(null);
        setCustomerName("");
        setCustomerPhone("");
        onOrderSelected(null, []);
        await loadOpenOrders();
      } catch (err) {
        setError(err.message || "Unable to cancel order.");
      }
    }

    async function holdOrder() {
      if (!orderId) return;
      setError("");
      try {
        await window.POSUtils.orders.setOrderStatus(orderId, "HOLD", user.id);
        setStatusMsg("Order moved to hold.");
        setOrderId(null);
        setOrderData(null);
        setCustomerName("");
        setCustomerPhone("");
        onOrderSelected(null, []);
        await loadOpenOrders();
      } catch (err) {
        setError(err.message || "Unable to hold order.");
      }
    }

    async function recallOrder(selectedOrderId) {
      setError("");
      try {
        await window.POSUtils.orders.setOrderStatus(selectedOrderId, "DRAFT", user.id);
        setOrderId(selectedOrderId);
        await refreshOrder(selectedOrderId);
        setStatusMsg(`Order #${selectedOrderId} loaded.`);
      } catch (err) {
        setError(err.message || "Unable to load order.");
      }
    }

    function startNewOrder() {
      setOrderId(null);
      setOrderData(null);
      setCustomerName("");
      setCustomerPhone("");
      setDiscountMode("amount");
      setDiscountValue("");
      onOrderSelected(null, []);
      setStatusMsg("Started a new order.");
    }

    async function finalizeOrder() {
      if (!orderId) return;
      setError("");
      try {
        await window.POSUtils.orders.setOrderStatus(orderId, "FINALIZED", user.id);
        await refreshOrder(orderId);
        setStatusMsg("Order ready for payment.");
        if (onGoToPayment) onGoToPayment();
      } catch (err) {
        if (err.shortages) {
          setError("Stock shortage: " + err.shortages.map((s) => s.ingredient_name).join(", "));
          return;
        }
        setError(err.message || "Unable to send order.");
      }
    }

    function beginEdit(item) {
      setEditId(String(item.id));
      setEditName(item.name);
      setEditCategory(item.category);
      setEditCategoryCustom("");
      setEditSize(item.size || "");
      setEditPrice((Number(item.price_cents || 0) / 100).toFixed(2));
      setEditActive(!!item.active);
    }

    async function createMenuItem() {
      setError("");
      setStatusMsg("");
      try {
        const resolvedCategory = newCategory === ADD_NEW_CATEGORY ? newCategoryCustom : newCategory;
        const baseSize = String(newSize || "").trim();
        const rawSizes = baseSize
          ? baseSize.split(",").map((s) => s.trim()).filter((s) => s.length > 0)
          : [""];
        const seen = new Set();
        for (const raw of rawSizes) {
          const [sizePart, pricePart] = raw.split(":").map((s) => s.trim());
          const size = sizePart || "";
          const priceOverride = pricePart ? Math.round(Number(pricePart) * 100) : null;
          const priceCents = priceOverride != null && Number.isFinite(priceOverride)
            ? priceOverride
            : Math.round(Number(newPrice || 0) * 100);
          const key = `${size}::${priceCents}`;
          if (seen.has(key)) continue;
          seen.add(key);
          await window.POSUtils.orders.createMenuItem(user.id, {
            name: newName,
            category: resolvedCategory,
            size: size || null,
            priceCents,
            active: newActive
          });
        }
        setStatusMsg("Menu item created.");
        setNewName("");
        setNewCategory("");
        setNewCategoryCustom("");
        setNewSize("");
        setNewPrice("");
        setNewActive(true);
        await loadMenu();
      } catch (err) {
        setError(err.message || "Failed to create menu item.");
      }
    }

    async function saveMenuItem() {
      setError("");
      setStatusMsg("");
      try {
        const resolvedCategory = editCategory === ADD_NEW_CATEGORY ? editCategoryCustom : editCategory;
        await window.POSUtils.orders.updateMenuItem(user.id, Number(editId), {
          name: editName,
          category: resolvedCategory,
          size: editSize,
          priceCents: Math.round(Number(editPrice || 0) * 100),
          active: editActive
        });
        setStatusMsg("Menu item updated.");
        setEditId("");
        await loadMenu();
      } catch (err) {
        setError(err.message || "Failed to update menu item.");
      }
    }

    async function toggleActive(item) {
      setError("");
      setStatusMsg("");
      try {
        await window.POSUtils.orders.updateMenuItem(user.id, item.id, { active: !item.active });
        setStatusMsg(item.active ? "Menu item deactivated." : "Menu item activated.");
        await loadMenu();
      } catch (err) {
        setError(err.message || "Failed to update status.");
      }
    }

    useEffect(() => {
      (async () => {
        try {
          await loadMenu();
          await loadOpenOrders();
          await loadPromotions();
        } catch (err) {
          setError(err.message || "Failed to load menu.");
        } finally {
          setLoading(false);
        }
      })();
    }, []);

    const tabs = useMemo(() => {
      const categories = Array.from(
        new Set(
          menu
            .map((m) => String(m.category || "").trim())
            .filter((c) => c.length > 0)
        )
      );
      return ["ALL", ...categories];
    }, [menu]);

    const categoryOptions = useMemo(() => tabs.filter((t) => t !== "ALL"), [tabs]);
    const sizeTabs = useMemo(() => {
      if (activeTab === "ALL") return [];
      const sizes = Array.from(new Set(
        menu
          .filter((m) => m.active && m.category === activeTab)
          .map((m) => String(m.size || "").trim())
          .filter((s) => s.length > 0)
      ));
      return sizes.length ? [ALL_SIZES, ...sizes] : [];
    }, [menu, activeTab]);

    useEffect(() => {
      if (!tabs.includes(activeTab)) {
        setActiveTab(tabs[0] || "ALL");
      }
    }, [tabs, activeTab]);

    useEffect(() => {
      if (!sizeTabs.length) {
        if (activeSize !== ALL_SIZES) setActiveSize(ALL_SIZES);
        return;
      }
      if (!sizeTabs.includes(activeSize)) {
        setActiveSize(sizeTabs[0]);
      }
    }, [sizeTabs, activeSize]);

    const visibleMenu = useMemo(() => {
      const activeOnly = menu.filter((m) => m.active);
      if (activeTab === "ALL") return activeOnly;
      const sized = activeOnly.filter((m) => m.category === activeTab);
      if (activeSize === ALL_SIZES || !activeSize) return sized;
      return sized.filter((m) => String(m.size || "").trim() === activeSize);
    }, [menu, activeTab, activeSize]);

    const billItems = orderData?.items || [];
    const subtotal = orderData?.order?.subtotal_cents || 0;
    const manualDiscountApplied = orderData?.order?.manual_discount_cents != null
      ? Number(orderData?.order?.manual_discount_cents || 0)
      : Math.max(0, Number(orderData?.order?.discount_cents || 0) - Number(orderData?.order?.promo_discount_cents || 0));
    const promoDiscountApplied = orderData?.order?.promo_discount_cents || 0;
    const activePromoCode = orderData?.order?.promo_code || "";
    const total = orderData?.order?.total_cents || 0;
    const discountNumeric = Number(discountValue || 0);
    const requestedManualDiscountCents = discountMode === "percent"
      ? Math.round((subtotal * Math.max(0, discountNumeric)) / 100)
      : Math.round(Math.max(0, discountNumeric) * 100);
    const guestLabel = customerName.trim() ? customerName.trim() : "Guest";
    const mobileLabel = customerPhone.trim() ? customerPhone.trim() : "-";

    return (
      <div className="flex flex-col lg:flex-row h-full gap-6 p-2">
        {/* Main Menu Area */}
        <section className="flex-1 flex flex-col min-w-0">
          {canManageMenu && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-4">
              <div className="flex justify-between items-center mb-2">
                <h3 className="font-bold text-gray-800">Menu Management</h3>
                <button 
                  onClick={() => setShowEditor((v) => !v)}
                  className="text-teal-600 font-semibold text-sm hover:underline"
                >
                  {showEditor ? "Hide Editor" : "Edit Menu"}
                </button>
              </div>
              {showEditor && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                    <input className="px-3 py-2 bg-gray-50 border border-gray-100 rounded-lg text-sm" placeholder="New item name" value={newName} onChange={(e) => setNewName(e.target.value)} />
                    <select className="px-3 py-2 bg-gray-50 border border-gray-100 rounded-lg text-sm" value={newCategory} onChange={(e) => setNewCategory(e.target.value)}>
                      <option value="">Select category</option>
                      {categoryOptions.map((c) => <option key={`new-cat-${c}`} value={c}>{c}</option>)}
                      <option value={ADD_NEW_CATEGORY}>+ Add new Category</option>
                    </select>
                    {newCategory === ADD_NEW_CATEGORY && (
                      <input
                        className="px-3 py-2 bg-gray-50 border border-gray-100 rounded-lg text-sm"
                        placeholder="New category name"
                        value={newCategoryCustom}
                        onChange={(e) => setNewCategoryCustom(e.target.value)}
                      />
                    )}
                    <input
                      className="px-3 py-2 bg-gray-50 border border-gray-100 rounded-lg text-sm"
                      placeholder="Size (e.g. Small:300)"
                      value={newSize}
                      onChange={(e) => setNewSize(e.target.value)}
                    />
                    <input className="px-3 py-2 bg-gray-50 border border-gray-100 rounded-lg text-sm" placeholder="Price" value={newPrice} onChange={(e) => setNewPrice(e.target.value)} />
                    <select className="px-3 py-2 bg-gray-50 border border-gray-100 rounded-lg text-sm" value={newActive ? "1" : "0"} onChange={(e) => setNewActive(e.target.value === "1")}>
                      <option value="1">Active</option>
                      <option value="0">Inactive</option>
                    </select>
                    <button className="bg-teal-600 text-white font-bold py-2 rounded-lg text-sm hover:bg-teal-700 transition-colors" onClick={createMenuItem}>Add Item</button>
                  </div>
                  
                  <div className="overflow-x-auto rounded-lg border border-gray-50">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-gray-50 text-gray-500 uppercase text-[10px] font-bold">
                        <tr>
                          <th className="px-4 py-3">Name</th>
                          <th className="px-4 py-3">Category</th>
                          <th className="px-4 py-3">Size</th>
                          <th className="px-4 py-3">Price</th>
                          <th className="px-4 py-3">Status</th>
                          <th className="px-4 py-3">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {menu.map((item) => (
                          <tr key={item.id} className="hover:bg-gray-50">
                            <td className="px-4 py-3 font-medium">{item.name}</td>
                            <td className="px-4 py-3">{item.category}</td>
                            <td className="px-4 py-3">{item.size || "-"}</td>
                            <td className="px-4 py-3 font-bold">{money(item.price_cents)}</td>
                            <td className="px-4 py-3">
                              <span className={`px-2 py-1 rounded-full text-[10px] font-bold ${item.active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                {item.active ? "Active" : "Inactive"}
                              </span>
                            </td>
                            <td className="px-4 py-3 flex gap-2">
                              <button onClick={() => beginEdit(item)} className="text-teal-600 hover:text-teal-800 font-bold">Edit</button>
                              <button onClick={() => toggleActive(item)} className="text-gray-400 hover:text-gray-600 font-bold">{item.active ? "Deactivate" : "Activate"}</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {editId && (
                    <div className="p-4 bg-teal-50 rounded-xl border border-teal-100 mt-4">
                      <h4 className="font-bold text-teal-800 mb-3 text-sm uppercase">Editing Item #{editId}</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                        <input className="px-3 py-2 bg-white border border-teal-100 rounded-lg text-sm" value={editName} onChange={(e) => setEditName(e.target.value)} />
                        <select className="px-3 py-2 bg-white border border-teal-100 rounded-lg text-sm" value={editCategory} onChange={(e) => setEditCategory(e.target.value)}>
                          <option value="">Select category</option>
                          {categoryOptions.map((c) => <option key={`edit-cat-${c}`} value={c}>{c}</option>)}
                          <option value={ADD_NEW_CATEGORY}>Add new Category</option>
                        </select>
                        <input className="px-3 py-2 bg-white border border-teal-100 rounded-lg text-sm" value={editSize} onChange={(e) => setEditSize(e.target.value)} />
                        <input className="px-3 py-2 bg-white border border-teal-100 rounded-lg text-sm" value={editPrice} onChange={(e) => setEditPrice(e.target.value)} />
                        <div className="flex gap-2">
                          <button onClick={() => setEditId("")} className="flex-1 py-2 rounded-lg border border-teal-200 text-teal-700 font-bold text-sm bg-white">Cancel</button>
                          <button className="flex-1 py-2 rounded-lg bg-teal-600 text-white font-bold text-sm hover:bg-teal-700" onClick={saveMenuItem}>Save</button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Category Tabs */}
          <div className="flex gap-2 mb-6 overflow-x-auto pb-2 scrollbar-hide">
            {tabs.map((tab) => (
              <button 
                key={tab} 
                className={`flex-shrink-0 px-6 py-2.5 rounded-xl font-bold text-sm transition-all ${
                  activeTab === tab 
                    ? "bg-teal-600 text-white shadow-lg shadow-teal-100" 
                    : "bg-white text-gray-500 hover:bg-teal-50 hover:text-teal-600 border border-gray-100"
                }`} 
                onClick={() => setActiveTab(tab)}
              >
                {tab}
              </button>
            ))}
          </div>

          {activeTab !== "ALL" && sizeTabs.length > 0 && (
            <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
              {sizeTabs.map((tab) => (
                <button 
                  key={tab} 
                  className={`flex-shrink-0 px-4 py-1.5 rounded-lg font-bold text-xs transition-all ${
                    activeSize === tab 
                      ? "bg-gray-800 text-white" 
                      : "bg-gray-100 text-gray-400 hover:bg-gray-200"
                  }`} 
                  onClick={() => setActiveSize(tab)}
                >
                  {tab === ALL_SIZES ? "All Sizes" : tab}
                </button>
              ))}
            </div>
          )}

          {/* Menu Items Grid */}
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4 overflow-y-auto pr-2">
            {loading ? (
              <div className="col-span-full py-12 flex justify-center text-gray-400 font-medium">Loading menu...</div>
            ) : (
              visibleMenu.map((item) => (
                <button 
                  key={item.id} 
                  className="group bg-white rounded-2xl p-3 border border-gray-100 shadow-sm hover:shadow-xl hover:border-teal-200 transition-all text-left flex flex-col items-center" 
                  onClick={() => addItem(item.id)}
                >
                  <div 
                    className="w-full aspect-square rounded-xl flex items-center justify-center text-4xl mb-3 shadow-inner group-hover:scale-105 transition-transform" 
                    style={imageStyleFromName(item.name)}
                    title={item.category || ""}
                  >
                    {categoryIcon(item.category)}
                  </div>
                  <div className="w-full px-1">
                    <div className="font-bold text-gray-800 text-base truncate mb-0.5">{item.name}</div>
                    <div className="flex justify-between items-center mt-1">
                      <span className="text-[10px] uppercase font-extrabold text-gray-300 trekking-widest">{item.size || (item.category === activeTab ? "" : item.category)}</span>
                      <span className="text-teal-600 font-extrabold text-sm">{money(item.price_cents)}</span>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </section>

        {/* Right Sidebar - Order Summary */}
        <aside className="w-full lg:w-[400px] flex flex-col bg-white rounded-3xl shadow-2xl border border-gray-100 overflow-hidden">
          <div className="p-6 bg-gray-50 flex flex-col">
            <div className="flex justify-between items-end mb-4">
              <div>
                <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Order ID</h4>
                <div className="text-3xl font-black text-gray-900">#{orderId || "----"}</div>
              </div>
              <div className="text-right">
                <div className="text-teal-600 font-black text-4xl mb-1">{money(total)}</div>
                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Total Payable</div>
              </div>
            </div>
            
            <div className="customer-info space-y-2 mt-4">
              <input
                className="w-full px-4 py-2.5 bg-white border border-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-teal-500 outline-none"
                placeholder="Customer Name"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                onBlur={saveCustomerIfPossible}
              />
              <input
                className="w-full px-4 py-2.5 bg-white border border-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-teal-500 outline-none"
                placeholder="Mobile Number"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                onBlur={saveCustomerIfPossible}
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {/* Promotions & Discounts */}
            <div className="space-y-4">
              <div className="p-4 bg-yellow-50/50 rounded-2xl border border-yellow-100">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[10px] font-bold text-yellow-700 uppercase tracking-widest">Add Discount</span>
                  <div className="flex bg-white rounded-lg p-0.5 border border-yellow-200">
                    <button onClick={() => setDiscountMode("amount")} className={`px-2 py-0.5 text-[9px] font-bold rounded ${discountMode === "amount" ? "bg-yellow-500 text-white" : "text-gray-400"}`}>$</button>
                    <button onClick={() => setDiscountMode("percent")} className={`px-2 py-0.5 text-[9px] font-bold rounded ${discountMode === "percent" ? "bg-yellow-500 text-white" : "text-gray-400"}`}>%</button>
                  </div>
                </div>
                <div className="flex gap-2">
                  <input
                    className="flex-1 px-3 py-1.5 bg-white border border-yellow-200 rounded-lg text-sm font-bold"
                    value={discountValue}
                    onChange={(e) => setDiscountValue(e.target.value)}
                    placeholder={discountMode === "percent" ? "10%" : "0.00"}
                  />
                  <button onClick={applyDiscount} className="bg-yellow-500 text-white px-4 py-1.5 rounded-lg font-bold text-xs">Apply</button>
                </div>
              </div>

              <div className="p-4 bg-teal-50/50 rounded-2xl border border-teal-100">
                <span className="text-[10px] font-bold text-teal-700 uppercase tracking-widest mb-3 block">Promo Code</span>
                <div className="flex gap-2">
                  <input
                    className="flex-1 px-3 py-1.5 bg-white border border-teal-200 rounded-lg text-sm font-bold placeholder:text-gray-300"
                    value={promoCodeInput}
                    onChange={(e) => setPromoCodeInput(e.target.value.toUpperCase())}
                    placeholder="VIRGINIA20"
                  />
                  <button onClick={applyPromoCode} className="bg-teal-600 text-white px-4 py-1.5 rounded-lg font-bold text-xs">GO</button>
                  {activePromoCode && (
                    <button onClick={clearPromoCode} className="text-red-400 font-bold px-1 hover:text-red-600">×</button>
                  )}
                </div>
                {activePromoCode && <div className="mt-2 text-[10px] font-bold text-teal-600">Active Code: {activePromoCode}</div>}
              </div>
            </div>

            {/* Open Orders */}
            <div className="space-y-2">
               <div className="flex justify-between items-center mb-1">
                 <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">On Hold / Queued</span>
                 <button onClick={loadOpenOrders} className="text-[10px] font-bold text-teal-600 hover:underline">Refresh</button>
               </div>
               <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-invisible">
                 {openOrders.map((row) => (
                   <button
                     key={row.id}
                     className={`flex-shrink-0 flex flex-col p-3 rounded-2xl border transition-all ${orderId === row.id ? "bg-teal-600 border-teal-600 text-white shadow-lg" : "bg-white border-gray-100 text-gray-600 hover:border-teal-300"}`}
                     onClick={() => recallOrder(row.id)}
                   >
                     <span className="text-xs font-black mb-1">#{row.id}</span>
                     <span className="text-[9px] font-bold uppercase opacity-70 mb-2">{row.status}</span>
                     <span className="text-[10px] font-black">{money(row.total_cents || 0)}</span>
                   </button>
                 ))}
               </div>
            </div>

            {/* Cart Items */}
            <div className="space-y-3">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-2">Cart Items ({billItems.length})</span>
              {billItems.length === 0 ? (
                <div className="py-8 text-center text-gray-300 italic text-sm">Empty cart</div>
              ) : (
                billItems.map((item) => (
                  <div key={item.id} className="flex gap-4 group">
                    <div className="w-14 h-14 rounded-xl flex items-center justify-center text-2xl shadow-sm border border-gray-50 flex-shrink-0" style={imageStyleFromName(item.item_name)}>
                      {categoryIcon(item.category)}
                    </div>
                    <div className="flex-1 flex flex-col justify-center min-w-0">
                      <div className="font-bold text-gray-800 text-sm truncate">{item.item_name}</div>
                      <div className="font-bold text-teal-600 text-xs">{money(item.line_total_cents)}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => setQty(item.id, item.quantity - 1)} className="w-6 h-6 rounded-lg bg-gray-100 text-gray-500 font-bold hover:bg-gray-200 transition-colors">-</button>
                      <span className="w-5 text-center font-black text-sm">{item.quantity}</span>
                      <button onClick={() => setQty(item.id, item.quantity + 1)} className="w-6 h-6 rounded-lg bg-gray-100 text-gray-500 font-bold hover:bg-gray-200 transition-colors">+</button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Pricing & Actions */}
          <div className="px-6 py-6 bg-gray-900 text-white">
            <div className="space-y-1.5 mb-6">
              <div className="flex justify-between text-xs font-bold text-gray-400 uppercase tracking-wider">
                <span>Subtotal</span>
                <span>{money(subtotal)}</span>
              </div>
              {manualDiscountApplied > 0 && (
                <div className="flex justify-between text-xs font-bold text-yellow-400 uppercase tracking-wider">
                  <span>Discount</span>
                  <span>-{money(manualDiscountApplied)}</span>
                </div>
              )}
              {promoDiscountApplied > 0 && (
                <div className="flex justify-between text-xs font-bold text-teal-400 uppercase tracking-wider">
                  <span>Promo</span>
                  <span>-{money(promoDiscountApplied)}</span>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button 
                 onClick={startNewOrder}
                 className="py-3 bg-gray-700 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-gray-600 transition-colors"
              >
                New
              </button>
              <button 
                 onClick={holdOrder} 
                 disabled={!orderId}
                 className="py-3 bg-gray-700 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-gray-600 transition-all disabled:opacity-30"
              >
                Hold
              </button>
              <button 
                 onClick={cancelOrder} 
                 className="col-span-1 py-3 bg-red-500/10 text-red-500 border border-red-500/20 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-red-500 hover:text-white transition-all"
              >
                Delete
              </button>
              <button 
                 onClick={finalizeOrder} 
                 className="col-span-1 py-3 bg-teal-500 text-white rounded-xl font-black text-xs uppercase tracking-widest shadow-lg shadow-teal-500/20 hover:scale-[1.02] active:scale-95 transition-all"
              >
                Pay Now
              </button>
            </div>
          </div>
          
          {statusMsg && <div className="absolute bottom-4 left-6 right-6 p-4 bg-green-500 text-white rounded-xl font-bold shadow-2xl animate-bounce text-center text-sm">{statusMsg}</div>}
          {error && <div className="absolute bottom-4 left-6 right-6 p-4 bg-red-500 text-white rounded-xl font-bold shadow-2xl text-center text-sm">{error}</div>}
        </aside>
      </div>
    );
  }

  window.POSComponents = window.POSComponents || {};
  window.POSComponents.OrderScreen = OrderScreen;
})();
