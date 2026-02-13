(function () {
  const { useEffect, useMemo, useState } = React;
  const { money } = window.POSUtils.db;
  const ADD_NEW_CATEGORY = "__ADD_NEW_CATEGORY__";

  function imageStyleFromName(name) {
    const seed = Array.from(name).reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
    const hueA = seed % 360;
    const hueB = (seed + 55) % 360;
    return {
      background: `linear-gradient(135deg, hsl(${hueA} 55% 35%), hsl(${hueB} 60% 58%))`
    };
  }

  function OrderScreen({ user, onOrderSelected }) {
    const canManageMenu = user.role === "ADMIN" || user.role === "MANAGER";

    const [menu, setMenu] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [statusMsg, setStatusMsg] = useState("");
    const [orderId, setOrderId] = useState(null);
    const [orderData, setOrderData] = useState(null);
    const [customerName, setCustomerName] = useState("");
    const [customerPhone, setCustomerPhone] = useState("");
    const [activeTab, setActiveTab] = useState("ALL");
    const [showEditor, setShowEditor] = useState(false);
    const [newName, setNewName] = useState("");
    const [newCategory, setNewCategory] = useState("");
    const [newCategoryCustom, setNewCategoryCustom] = useState("");
    const [newPrice, setNewPrice] = useState("");
    const [newActive, setNewActive] = useState(true);
    const [editId, setEditId] = useState("");
    const [editName, setEditName] = useState("");
    const [editCategory, setEditCategory] = useState("");
    const [editCategoryCustom, setEditCategoryCustom] = useState("");
    const [editPrice, setEditPrice] = useState("");
    const [editActive, setEditActive] = useState(true);

    async function loadMenu() {
      setMenu(await window.POSUtils.orders.listMenu(user.id, canManageMenu));
    }

    async function refreshOrder(id) {
      const resp = await window.POSUtils.orders.getOrder(id);
      setOrderData(resp);
      setCustomerName(resp.order.customer_name || "");
      setCustomerPhone(resp.order.customer_phone || "");
      onOrderSelected(resp.order, resp.items);
    }

    async function ensureOrder() {
      if (orderId) return orderId;
      const id = await window.POSUtils.orders.createOrder(user.id, "");
      setOrderId(id);
      await refreshOrder(id);
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
        const id = await ensureOrder();
        await window.POSUtils.orders.addOrderItem(id, menuItemId, 1);
        await refreshOrder(id);
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
      } catch (err) {
        setError(err.message || "Unable to cancel order.");
      }
    }

    async function finalizeOrder() {
      if (!orderId) return;
      setError("");
      try {
        await window.POSUtils.orders.setOrderStatus(orderId, "FINALIZED", user.id);
        await window.POSUtils.orders.sendKot(orderId);
        await refreshOrder(orderId);
        setStatusMsg("Order sent.");
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
      setEditPrice((Number(item.price_cents || 0) / 100).toFixed(2));
      setEditActive(!!item.active);
    }

    async function createMenuItem() {
      setError("");
      setStatusMsg("");
      try {
        const resolvedCategory = newCategory === ADD_NEW_CATEGORY ? newCategoryCustom : newCategory;
        await window.POSUtils.orders.createMenuItem(user.id, {
          name: newName,
          category: resolvedCategory,
          priceCents: Math.round(Number(newPrice || 0) * 100),
          active: newActive
        });
        setStatusMsg("Menu item created.");
        setNewName("");
        setNewCategory("");
        setNewCategoryCustom("");
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

    useEffect(() => {
      if (!tabs.includes(activeTab)) {
        setActiveTab(tabs[0] || "ALL");
      }
    }, [tabs, activeTab]);

    const visibleMenu = useMemo(() => {
      const activeOnly = menu.filter((m) => m.active);
      if (activeTab === "ALL") return activeOnly;
      return activeOnly.filter((m) => m.category === activeTab);
    }, [menu, activeTab]);

    const billItems = orderData?.items || [];
    const subtotal = orderData?.order?.subtotal_cents || 0;
    const discount = orderData?.order?.discount_cents || 0;
    const total = orderData?.order?.total_cents || 0;
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
                    <input placeholder="Price" value={newPrice} onChange={(e) => setNewPrice(e.target.value)} />
                    <select value={newActive ? "1" : "0"} onChange={(e) => setNewActive(e.target.value === "1")}>
                      <option value="1">Active</option>
                      <option value="0">Inactive</option>
                    </select>
                    <button className="primary" onClick={createMenuItem}>Add Item</button>
                  </div>
                  <table className="table">
                    <thead>
                      <tr><th>Name</th><th>Category</th><th>Price</th><th>Status</th><th></th><th></th></tr>
                    </thead>
                    <tbody>
                      {menu.map((item) => (
                        <tr key={item.id}>
                          <td>{item.name}</td>
                          <td>{item.category}</td>
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

          <div className="menu-grid-replica">
            {loading ? (
              <div className="card"><p className="muted">Loading...</p></div>
            ) : (
              visibleMenu.map((item) => (
                <button key={item.id} className="food-replica-card" onClick={() => addItem(item.id)}>
                  <div className="food-photo" style={imageStyleFromName(item.name)} />
                  <div className="food-title">{item.name}</div>
                  <div className="food-cat-line">
                    <span>CATEGORY:</span>
                    <em>{item.category.slice(0, 1)}</em>
                    <i>HOT</i>
                  </div>
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
            <div><span>SUBTOTAL</span><b>{money(subtotal)}</b></div>
            <div><span>DISCOUNT</span><b>{money(discount)}</b></div>
            <div className="grand"><span>TOTAL</span><b>{money(total)}</b></div>
          </div>

          <div className="summary-actions">
            <button className="danger-lite" onClick={cancelOrder}>CANCEL ORDER</button>
            <button className="send-lite" onClick={finalizeOrder}>SEND ORDER</button>
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
