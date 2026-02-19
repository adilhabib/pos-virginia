(function () {
  const { useEffect, useMemo, useState } = React;
  const { money } = window.POSUtils.db;

  function Inventory({ user }) {
    const canManage = user.role === "ADMIN" || user.role === "MANAGER";
    const [ingredients, setIngredients] = useState([]);
    const [selectedId, setSelectedId] = useState("");
    const [qty, setQty] = useState("");
    const [reason, setReason] = useState("");
    const [purchaseQty, setPurchaseQty] = useState("");
    const [supplierRef, setSupplierRef] = useState("");
    const [activeEditorId, setActiveEditorId] = useState("");
    const [editName, setEditName] = useState("");
    const [editUnit, setEditUnit] = useState("");
    const [editUnitCost, setEditUnitCost] = useState("");
    const [editThreshold, setEditThreshold] = useState("");
    const [editSupplier, setEditSupplier] = useState("");
    const [newName, setNewName] = useState("");
    const [newUnit, setNewUnit] = useState("");
    const [newUnitCost, setNewUnitCost] = useState("");
    const [newStock, setNewStock] = useState("");
    const [newThreshold, setNewThreshold] = useState("");
    const [newSupplier, setNewSupplier] = useState("");
    const [poSupplier, setPoSupplier] = useState("");
    const [poNotes, setPoNotes] = useState("");
    const [poIngredientId, setPoIngredientId] = useState("");
    const [poQty, setPoQty] = useState("");
    const [poUnitCost, setPoUnitCost] = useState("");
    const [poDraftItems, setPoDraftItems] = useState([]);
    const [poList, setPoList] = useState([]);
    const [activePoId, setActivePoId] = useState("");
    const [activePoDetail, setActivePoDetail] = useState(null);
    const [message, setMessage] = useState("");
    const [error, setError] = useState("");

    async function load() {
      const [ingredientRows, poRows] = await Promise.all([
        window.POSUtils.inventory.listIngredients(),
        window.POSUtils.inventory.listPurchaseOrders()
      ]);
      setIngredients(ingredientRows);
      setPoList(poRows);
    }

    useEffect(() => {
      load().catch((e) => setError(e.message || "Unable to load inventory."));
    }, []);

    const selectedIngredient = useMemo(
      () => ingredients.find((i) => String(i.id) === String(selectedId)),
      [ingredients, selectedId]
    );

    function startEdit(ingredient) {
      setActiveEditorId(String(ingredient.id));
      setEditName(ingredient.name);
      setEditUnit(ingredient.unit);
      setEditUnitCost(String(ingredient.unit_cost_cents || 0));
      setEditThreshold(String(ingredient.low_stock_threshold));
      setEditSupplier(ingredient.supplier || "");
    }

    async function adjust() {
      setError("");
      setMessage("");
      try {
        await window.POSUtils.inventory.adjustIngredient(Number(selectedId), Number(qty), reason, user.id);
        setMessage("Inventory adjustment saved.");
        setQty("");
        setReason("");
        await load();
      } catch (err) {
        setError(err.message || "Adjustment failed.");
      }
    }

    async function purchase() {
      setError("");
      setMessage("");
      try {
        await window.POSUtils.inventory.purchaseIngredient(Number(selectedId), Number(purchaseQty), supplierRef, user.id);
        setMessage("Purchase entry saved.");
        setPurchaseQty("");
        setSupplierRef("");
        await load();
      } catch (err) {
        setError(err.message || "Purchase entry failed.");
      }
    }

    async function createIngredient() {
      setError("");
      setMessage("");
      try {
        await window.POSUtils.inventory.createIngredient(user.id, {
          name: newName,
          unit: newUnit,
          stockQty: Number(newStock || 0),
          unitCostCents: Number(newUnitCost || 0),
          lowStockThreshold: Number(newThreshold || 0),
          supplier: newSupplier
        });
        setMessage("Ingredient created.");
        setNewName("");
        setNewUnit("");
        setNewUnitCost("");
        setNewStock("");
        setNewThreshold("");
        setNewSupplier("");
        await load();
      } catch (err) {
        setError(err.message || "Ingredient creation failed.");
      }
    }

    async function saveIngredient() {
      setError("");
      setMessage("");
      try {
        await window.POSUtils.inventory.updateIngredient(user.id, Number(activeEditorId), {
          name: editName,
          unit: editUnit,
          unitCostCents: Number(editUnitCost || 0),
          lowStockThreshold: Number(editThreshold || 0),
          supplier: editSupplier
        });
        setMessage("Ingredient updated.");
        setActiveEditorId("");
        await load();
      } catch (err) {
        setError(err.message || "Ingredient update failed.");
      }
    }

    function addPoLine() {
      const ingredientId = Number(poIngredientId || 0);
      const qtyNum = Number(poQty || 0);
      const unitCostNum = Math.max(0, Math.round(Number(poUnitCost || 0)));
      if (!ingredientId || qtyNum <= 0) {
        setError("Select ingredient and enter valid quantity for PO item.");
        return;
      }
      const ingredient = ingredients.find((i) => Number(i.id) === ingredientId);
      if (!ingredient) {
        setError("Ingredient not found.");
        return;
      }
      setPoDraftItems((prev) => [
        ...prev,
        { ingredientId, ingredientName: ingredient.name, qty: qtyNum, unitCostCents: unitCostNum }
      ]);
      setPoIngredientId("");
      setPoQty("");
      setPoUnitCost("");
      setError("");
    }

    function removePoLine(index) {
      setPoDraftItems((prev) => prev.filter((_, i) => i !== index));
    }

    async function createPO() {
      setError("");
      setMessage("");
      try {
        await window.POSUtils.inventory.createPurchaseOrder(
          user.id,
          poSupplier,
          poNotes,
          poDraftItems
        );
        setMessage("Purchase order created.");
        setPoSupplier("");
        setPoNotes("");
        setPoDraftItems([]);
        setActivePoId("");
        setActivePoDetail(null);
        await load();
      } catch (err) {
        setError(err.message || "Failed to create purchase order.");
      }
    }

    async function openPo(poId) {
      setError("");
      try {
        const detail = await window.POSUtils.inventory.getPurchaseOrder(Number(poId));
        setActivePoId(String(poId));
        setActivePoDetail(detail);
      } catch (err) {
        setError(err.message || "Failed to load purchase order.");
      }
    }

    async function receivePO(poId) {
      setError("");
      setMessage("");
      try {
        await window.POSUtils.inventory.receivePurchaseOrder(user.id, Number(poId));
        setMessage(`PO #${poId} received and stock updated.`);
        await load();
        await openPo(poId);
      } catch (err) {
        setError(err.message || "Failed to receive purchase order.");
      }
    }

    const poDraftTotal = poDraftItems.reduce(
      (acc, item) => acc + Math.round(Number(item.qty || 0) * Number(item.unitCostCents || 0)),
      0
    );

    if (!canManage) {
      return <div className="card"><h2>Inventory</h2><p className="muted">Only admin/manager can access inventory management.</p></div>;
    }

    return (
      <div className="screen-grid">
        <div className="card">
          <h2>Inventory Dashboard</h2>
          <table className="table">
            <thead>
              <tr><th>Name</th><th>Stock</th><th>Threshold</th><th>Supplier</th><th></th></tr>
            </thead>
            <tbody>
              {ingredients.map((i) => {
                const low = Number(i.stock_qty) <= Number(i.low_stock_threshold);
                return (
                  <tr key={i.id} className={low ? "low-stock" : ""}>
                    <td>{i.name}</td>
                    <td>{i.stock_qty} {i.unit}</td>
                    <td>{i.low_stock_threshold}</td>
                    <td>{i.supplier || "-"}</td>
                    <td><button onClick={() => startEdit(i)}>Edit</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="card">
          <h2>Stock Movements</h2>
          <label>Ingredient</label>
          <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
            <option value="">Select ingredient</option>
            {ingredients.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
          {selectedIngredient && (
            <p className="muted">
              Current stock: {selectedIngredient.stock_qty} {selectedIngredient.unit}
            </p>
          )}
          <label>Manual adjustment (+/-)</label>
          <input value={qty} onChange={(e) => setQty(e.target.value)} placeholder="-10 or 50" />
          <label>Reason</label>
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Spoilage / Correction" />
          <button onClick={adjust}>Save Adjustment</button>
          <hr />
          <label>Purchase quantity (+)</label>
          <input value={purchaseQty} onChange={(e) => setPurchaseQty(e.target.value)} placeholder="100" />
          <label>Supplier reference</label>
          <input value={supplierRef} onChange={(e) => setSupplierRef(e.target.value)} placeholder="PO-12345" />
          <button className="primary" onClick={purchase}>Save Purchase Entry</button>
        </div>

        <div className="card">
          <h2>Purchase Orders</h2>
          <label>Supplier</label>
          <input value={poSupplier} onChange={(e) => setPoSupplier(e.target.value)} placeholder="Supplier name" />
          <label>Notes</label>
          <input value={poNotes} onChange={(e) => setPoNotes(e.target.value)} placeholder="PO notes" />
          <label>Ingredient</label>
          <select value={poIngredientId} onChange={(e) => setPoIngredientId(e.target.value)}>
            <option value="">Select ingredient</option>
            {ingredients.map((i) => <option key={`po-ing-${i.id}`} value={i.id}>{i.name}</option>)}
          </select>
          <div className="row">
            <input value={poQty} onChange={(e) => setPoQty(e.target.value)} placeholder="Qty" />
            <input value={poUnitCost} onChange={(e) => setPoUnitCost(e.target.value)} placeholder="Unit cost (cents)" />
            <button onClick={addPoLine}>Add Line</button>
          </div>
          <table className="table">
            <thead>
              <tr><th>Ingredient</th><th>Qty</th><th>Unit Cost</th><th>Line Cost</th><th></th></tr>
            </thead>
            <tbody>
              {poDraftItems.map((item, index) => (
                <tr key={`po-line-${index}`}>
                  <td>{item.ingredientName}</td>
                  <td>{item.qty}</td>
                  <td>{money(item.unitCostCents)}</td>
                  <td>{money(Math.round(Number(item.qty) * Number(item.unitCostCents)))}</td>
                  <td><button onClick={() => removePoLine(index)}>Remove</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <p><strong>Draft Total:</strong> {money(poDraftTotal)}</p>
          <button className="primary" onClick={createPO}>Create PO</button>
        </div>

        <div className="card">
          <h2>PO Register</h2>
          <table className="table">
            <thead>
              <tr><th>ID</th><th>Supplier</th><th>Status</th><th>Total</th><th></th><th></th></tr>
            </thead>
            <tbody>
              {poList.map((po) => (
                <tr key={`po-${po.id}`} className={String(activePoId) === String(po.id) ? "selected-row" : ""}>
                  <td>#{po.id}</td>
                  <td>{po.supplier}</td>
                  <td>{po.status}</td>
                  <td>{money(po.total_cost_cents || 0)}</td>
                  <td><button onClick={() => openPo(po.id)}>View</button></td>
                  <td>
                    {po.status === "OPEN" ? (
                      <button className="primary" onClick={() => receivePO(po.id)}>Receive</button>
                    ) : (
                      <span className="muted">-</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {activePoDetail && (
            <div className="card">
              <h3>PO #{activePoDetail.order.id} Items</h3>
              <table className="table">
                <thead>
                  <tr><th>Ingredient</th><th>Qty Ordered</th><th>Qty Received</th><th>Line Cost</th></tr>
                </thead>
                <tbody>
                  {activePoDetail.items.map((line) => (
                    <tr key={`po-detail-${line.id}`}>
                      <td>{line.ingredient_name}</td>
                      <td>{line.qty_ordered}</td>
                      <td>{line.qty_received}</td>
                      <td>{money(line.line_cost_cents || 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="card">
          <h2>Add Ingredient</h2>
          <label>Name</label>
          <input value={newName} onChange={(e) => setNewName(e.target.value)} />
          <label>Unit</label>
          <input value={newUnit} onChange={(e) => setNewUnit(e.target.value)} placeholder="pcs, g, ml" />
          <label>Opening Stock</label>
          <input value={newStock} onChange={(e) => setNewStock(e.target.value)} />
          <label>Unit Cost (cents)</label>
          <input value={newUnitCost} onChange={(e) => setNewUnitCost(e.target.value)} />
          <label>Low Stock Threshold</label>
          <input value={newThreshold} onChange={(e) => setNewThreshold(e.target.value)} />
          <label>Supplier</label>
          <input value={newSupplier} onChange={(e) => setNewSupplier(e.target.value)} />
          <button className="primary" onClick={createIngredient}>Create Ingredient</button>
        </div>

        <div className="card">
          <h2>Edit Ingredient</h2>
          {!activeEditorId ? (
            <p className="muted">Select an ingredient from the table and click Edit.</p>
          ) : (
            <>
              <label>Name</label>
              <input value={editName} onChange={(e) => setEditName(e.target.value)} />
              <label>Unit</label>
              <input value={editUnit} onChange={(e) => setEditUnit(e.target.value)} />
              <label>Unit Cost (cents)</label>
              <input value={editUnitCost} onChange={(e) => setEditUnitCost(e.target.value)} />
              <label>Low Stock Threshold</label>
              <input value={editThreshold} onChange={(e) => setEditThreshold(e.target.value)} />
              <label>Supplier</label>
              <input value={editSupplier} onChange={(e) => setEditSupplier(e.target.value)} />
              <div className="row">
                <button onClick={() => setActiveEditorId("")}>Cancel</button>
                <button className="primary" onClick={saveIngredient}>Save</button>
              </div>
            </>
          )}
          {message && <div className="success">{message}</div>}
          {error && <div className="error">{error}</div>}
        </div>
      </div>
    );
  }

  window.POSComponents = window.POSComponents || {};
  window.POSComponents.Inventory = Inventory;
})();
