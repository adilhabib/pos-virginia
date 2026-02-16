(function () {
  const { useEffect, useMemo, useState } = React;

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
    const [message, setMessage] = useState("");
    const [error, setError] = useState("");

    async function load() {
      setIngredients(await window.POSUtils.inventory.listIngredients());
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
