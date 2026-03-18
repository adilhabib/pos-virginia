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
      <div className="menu-replica-layout">
        <section className="menu-canvas">
          {canManageMenu && (
            <div className="card">
              <div className="row">
                <strong>Menu Management</strong>
                <button onClick={() => setShowEditor((v) => !v)}>{showEditor ? "Hide Editor" : "Edit Menu"}</button>
              </div>
              {showEditor && (
                <>
                  <div className="row">
                    <input placeholder="New item name" value={newName} onChange={(e) => setNewName(e.target.value)} />
                    <select value={newCategory} onChange={(e) => setNewCategory(e.target.value)}>
                      <option value="">Select category</option>
                      {categoryOptions.map((c) => <option key={`new-cat-${c}`} value={c}>{c}</option>)}
                      <option value={ADD_NEW_CATEGORY}>Add new Category</option>
                    </select>
                    {newCategory === ADD_NEW_CATEGORY && (
                      <input
                        placeholder="New category name"
                        value={newCategoryCustom}
                        onChange={(e) => setNewCategoryCustom(e.target.value)}
                      />
                    )}
                    <input
                      placeholder="Size (optional, e.g. Small:300, Medium:450)"
                      value={newSize}
                      onChange={(e) => setNewSize(e.target.value)}
                    />
                    <input placeholder="Price" value={newPrice} onChange={(e) => setNewPrice(e.target.value)} />
                    <select value={newActive ? "1" : "0"} onChange={(e) => setNewActive(e.target.value === "1")}>
                      <option value="1">Active</option>
                      <option value="0">Inactive</option>
                    </select>
                    <button className="primary" onClick={createMenuItem}>Add Item</button>
                  </div>
                  <table className="table">
                    <thead>
                      <tr><th>Name</th><th>Category</th><th>Size</th><th>Price</th><th>Status</th><th></th><th></th></tr>
                    </thead>
                    <tbody>
                      {menu.map((item) => (
                        <tr key={item.id}>
                          <td>{item.name}</td>
                          <td>{item.category}</td>
                          <td>{item.size || "-"}</td>
                          <td>{money(item.price_cents)}</td>
                          <td>{item.active ? "Active" : "Inactive"}</td>
                          <td><button onClick={() => beginEdit(item)}>Edit</button></td>
                          <td><button onClick={() => toggleActive(item)}>{item.active ? "Deactivate" : "Activate"}</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {editId && (
                    <div className="card">
                      <h3>Edit Menu Item #{editId}</h3>
                      <div className="row">
                        <input value={editName} onChange={(e) => setEditName(e.target.value)} />
                        <select value={editCategory} onChange={(e) => setEditCategory(e.target.value)}>
                          <option value="">Select category</option>
                          {categoryOptions.map((c) => <option key={`edit-cat-${c}`} value={c}>{c}</option>)}
                          <option value={ADD_NEW_CATEGORY}>Add new Category</option>
                        </select>
                        {editCategory === ADD_NEW_CATEGORY && (
                          <input
                            placeholder="New category name"
                            value={editCategoryCustom}
                            onChange={(e) => setEditCategoryCustom(e.target.value)}
                          />
                        )}
                        <input placeholder="Size (optional)" value={editSize} onChange={(e) => setEditSize(e.target.value)} />
                        <input value={editPrice} onChange={(e) => setEditPrice(e.target.value)} />
                        <select value={editActive ? "1" : "0"} onChange={(e) => setEditActive(e.target.value === "1")}>
                          <option value="1">Active</option>
                          <option value="0">Inactive</option>
                        </select>
                        <button onClick={() => setEditId("")}>Cancel</button>
                        <button className="primary" onClick={saveMenuItem}>Save</button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          <div className="course-tabs">
            {tabs.map((tab) => (
              <button key={tab} className={activeTab === tab ? "course-tab active" : "course-tab"} onClick={() => setActiveTab(tab)}>
                {tab}
              </button>
            ))}
          </div>
          {activeTab !== "ALL" && sizeTabs.length > 0 && (
            <div className="size-tabs">
              {sizeTabs.map((tab) => (
                <button key={tab} className={activeSize === tab ? "size-tab active" : "size-tab"} onClick={() => setActiveSize(tab)}>
                  {tab === ALL_SIZES ? "All Sizes" : tab}
                </button>
              ))}
            </div>
          )}

          <div className="menu-grid-replica">
            {loading ? (
              <div className="card"><p className="muted">Loading...</p></div>
            ) : (
              visibleMenu.map((item) => (
                <button key={item.id} className="food-replica-card" onClick={() => addItem(item.id)}>
                  <div className="food-photo" title={item.category || ""}>{categoryIcon(item.category)}</div>
                  <div className="food-title">{item.name}</div>
                  <div className="food-cat-line">
                    <span>CATEGORY:</span>
                    <i>{item.category || "-"}</i>
                  </div>
                  {item.size && (
                    <div className="food-size-line">
                      <span>SIZE:</span>
                      <i>{item.size}</i>
                    </div>
                  )}
                </button>
              ))
            )}
          </div>
        </section>

        <aside className="order-summary-replica">
          <div className="summary-top">
            <h2>ORDER #</h2>
            <strong>{orderId || "----"}</strong>
          </div>
          <div className="summary-meta">
            <span>GUEST: <b>{guestLabel}</b></span>
            <span>MOBILE: <b>{mobileLabel}</b></span>
            {/* <span>TABLE: <b>1</b></span> */}
          </div>
          <div className="customer-fields">
            <input
              placeholder="Customer Name (optional)"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              onBlur={saveCustomerIfPossible}
            />
            <input
              placeholder="Customer Phone (optional)"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              onBlur={saveCustomerIfPossible}
            />
          </div>
          <div className="summary-discount-controls">
            <span>DYNAMIC DISCOUNT</span>
            <div className="row">
              <select value={discountMode} onChange={(e) => setDiscountMode(e.target.value)}>
                <option value="amount">Amount</option>
                <option value="percent">Percent (%)</option>
              </select>
              <input
                value={discountValue}
                onChange={(e) => setDiscountValue(e.target.value)}
                placeholder={discountMode === "percent" ? "10" : "100.00"}
              />
              <button onClick={applyDiscount}>Apply</button>
            </div>
          </div>

          <div className="summary-discount-controls">
            <span>PROMO CODE</span>
            <div className="row">
              <input
                value={promoCodeInput}
                onChange={(e) => setPromoCodeInput(e.target.value.toUpperCase())}
                placeholder="Enter promo code"
              />
              <button onClick={applyPromoCode}>Apply</button>
              <button onClick={clearPromoCode} disabled={!orderId || !activePromoCode}>Clear</button>
            </div>
            <div className="muted">Active: {activePromoCode || "Auto/None"}</div>
            <div className="muted">
              Available:{" "}
              {promotions
                .filter((p) => p.code)
                .map((p) => p.code)
                .join(", ") || "-"}
            </div>
          </div>

          <div className="open-orders-panel">
            <div className="open-orders-head">
              <strong>OPEN / HOLD ORDERS</strong>
              <button onClick={loadOpenOrders}>Refresh</button>
            </div>
            <div className="open-orders-list">
              {openOrders.length === 0 ? (
                <p className="muted">No open orders.</p>
              ) : (
                openOrders.map((row) => (
                  <button
                    key={row.id}
                    className={orderId === row.id ? "open-order-chip active" : "open-order-chip"}
                    onClick={() => recallOrder(row.id)}
                  >
                    <span>#{row.id}</span>
                    <span>{row.status}</span>
                    <span>{row.item_count} item(s)</span>
                    <span>{money(row.total_cents || 0)}</span>
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="summary-items">
            {billItems.length === 0 ? (
              <p className="muted">No items selected</p>
            ) : (
              billItems.map((item) => (
                <div key={item.id} className="summary-item">
                  <div className="summary-thumb" style={imageStyleFromName(item.item_name)} />
                  <div className="summary-info">
                    <div>{item.item_name}</div>
                    <strong>{money(item.line_total_cents)}</strong>
                  </div>
                  <div className="summary-qty">
                    <span>QTY</span>
                    <div className="qty-inline">
                      <button onClick={() => setQty(item.id, item.quantity - 1)}>-</button>
                      <b>{item.quantity}</b>
                      <button onClick={() => setQty(item.id, item.quantity + 1)}>+</button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="summary-totals">
            <div><span>Subtotal:</span><b>{money(subtotal)}</b></div>
            {manualDiscountApplied > 0 && (
              <div><span>Discount:</span><b>{money(manualDiscountApplied)}</b></div>
            )}
            {promoDiscountApplied > 0 && (
              <div><span>Promo:</span><b>{money(promoDiscountApplied)}</b></div>
            )}
            <div className="grand"><span>Total:</span><b>{money(total)}</b></div>
          </div>

          <div className="summary-actions">
            <button onClick={startNewOrder}>NEW</button>
            <button onClick={holdOrder} disabled={!orderId}>HOLD</button>
            <button className="danger-lite" onClick={cancelOrder}>CANCEL ORDER</button>
            <button className="send-lite" onClick={finalizeOrder}>GO TO PAYMENT</button>
          </div>

          {statusMsg && <div className="success">{statusMsg}</div>}
          {error && <div className="error">{error}</div>}
        </aside>
      </div>
    );
  }

  window.POSComponents = window.POSComponents || {};
  window.POSComponents.OrderScreen = OrderScreen;
})();
