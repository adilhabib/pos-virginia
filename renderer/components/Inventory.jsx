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
      <div className="flex flex-col h-full gap-6 p-2 overflow-hidden">
        {/* Header and Quick Stats */}
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex-1">
            <h2 className="text-2xl font-black text-gray-900 leading-none">Inventory Control</h2>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-2 px-1">Stock, Procurement & Supplier Management</p>
          </div>
          <div className="flex gap-4">
            <div className="px-5 py-3 bg-teal-50 text-teal-700 rounded-2xl border border-teal-100/50">
               <span className="block text-[9px] font-black uppercase opacity-60">Inventory Value</span>
               <span className="text-lg font-black tracking-tighter">PKR {Number(ingredients.reduce((acc, i) => acc + (i.stock_qty * (i.unit_cost_cents || 0)), 0) / 100).toLocaleString()}</span>
            </div>
            <div className={`px-5 py-3 rounded-2xl border ${ingredients.filter(i => i.stock_qty <= (i.low_stock_threshold || 10)).length > 0 ? 'bg-red-50 text-red-600 border-red-100' : 'bg-gray-50 text-gray-500 border-gray-100'}`}>
               <span className="block text-[9px] font-black uppercase opacity-60">Low Stock</span>
               <span className="text-lg font-black tracking-tighter">{ingredients.filter(i => i.stock_qty <= (i.low_stock_threshold || 10)).length} Alerts</span>
            </div>
          </div>
        </div>

        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 gap-6 overflow-hidden">
          {/* Main Content Area */}
          <div className="lg:col-span-8 flex flex-col gap-6 overflow-y-auto pr-1">
            
            {/* Dashboard / Stock List */}
            <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden flex flex-col shrink-0 min-h-[400px]">
              <div className="p-5 border-b border-gray-50 flex justify-between items-center">
                 <h3 className="text-xs font-black text-gray-900 uppercase tracking-widest">Stock Ledger</h3>
                 <button className="p-2 px-4 bg-gray-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-gray-800 transition-all" onClick={load}>Sync Data</button>
              </div>
              <div className="flex-1 overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-gray-50/50 text-[9px] font-black text-gray-400 uppercase tracking-widest">
                    <tr>
                      <th className="px-6 py-4">Ingredient</th>
                      <th className="px-4 py-4 text-center">In-Stock</th>
                      <th className="px-4 py-4 text-center">Alert Lv.</th>
                      <th className="px-4 py-4">Unit Cost</th>
                      <th className="px-4 py-4">Supplier</th>
                      <th className="px-6 py-4"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 text-xs font-bold">
                    {ingredients.map((i) => {
                      const isLow = i.stock_qty <= (i.low_stock_threshold || 10);
                      return (
                        <tr key={i.id} className="hover:bg-gray-50/50 transition-colors">
                          <td className="px-6 py-4">
                             <div className="text-gray-900">{i.name}</div>
                             <div className="text-[9px] text-gray-400 font-medium">Ref: #ING-{i.id}</div>
                          </td>
                          <td className="px-4 py-4 text-center">
                             <span className={`px-2 py-1 rounded-lg text-[10px] ${isLow ? 'bg-red-100 text-red-600' : 'bg-teal-50 text-teal-600'}`}>
                                {i.stock_qty} {i.unit}
                             </span>
                          </td>
                          <td className="px-4 py-4 text-center text-gray-400 font-medium">{i.low_stock_threshold}</td>
                          <td className="px-4 py-4 text-gray-600 font-black">{money(i.unit_cost_cents || 0)}</td>
                          <td className="px-4 py-4 text-gray-400 font-medium">{i.supplier || "—"}</td>
                          <td className="px-6 py-4 text-right">
                             <button className="text-[10px] font-black text-gray-300 uppercase hover:text-teal-600" onClick={() => startEdit(i)}>Edit</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Purchase Orders Section */}
            <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 space-y-6 shrink-0">
               <div className="flex justify-between items-center border-b border-gray-50 pb-4">
                  <h3 className="text-xs font-black text-gray-900 uppercase tracking-widest">Procurement Register</h3>
               </div>
               <div className="overflow-x-auto">
                 <table className="w-full text-left text-xs">
                    <thead className="text-[9px] font-black text-gray-400 uppercase tracking-widest">
                      <tr className="border-b border-gray-50">
                        <th className="py-4">Order ID</th>
                        <th className="py-4">Supplier</th>
                        <th className="py-4">Status</th>
                        <th className="py-4">Total Amount</th>
                        <th className="py-4"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {poList.map((po) => (
                        <tr key={po.id} className={`hover:bg-gray-50/50 transition-colors ${String(activePoId) === String(po.id) ? 'bg-teal-50/30' : ''}`}>
                          <td className="py-4 font-black text-gray-900">#{po.id}</td>
                          <td className="py-4 text-gray-500">{po.supplier}</td>
                          <td className="py-4">
                             <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${po.status === 'RECEIVED' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                               {po.status}
                             </span>
                          </td>
                          <td className="py-4 font-black">{money(po.total_cost_cents || 0)}</td>
                          <td className="py-4 text-right space-x-2">
                             <button className="text-[10px] font-black text-teal-600 uppercase hover:underline" onClick={() => openPo(po.id)}>View Items</button>
                             {po.status === "OPEN" && (
                               <button className="px-3 py-1 bg-teal-600 text-white rounded-lg text-[9px] font-black uppercase hover:bg-teal-700 shadow-lg shadow-teal-100" onClick={() => receivePO(po.id)}>Receive</button>
                             )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                 </table>
               </div>
            </div>

            {/* PO Details Modal-like View */}
            {activePoDetail && (
              <div className="bg-gray-900 text-white rounded-3xl p-8 space-y-6 animate-in zoom-in-95 duration-300">
                <div className="flex justify-between items-start">
                   <div>
                     <span className="text-[10px] font-black text-teal-400 uppercase tracking-widest block">Detailed View</span>
                     <h3 className="text-2xl font-black mt-1">Order #PO-{activePoDetail.order.id}</h3>
                     <p className="text-xs text-gray-400 mt-1">{activePoDetail.order.supplier} • {new Date(activePoDetail.order.created_at).toLocaleDateString()}</p>
                   </div>
                   <button className="text-gray-500 hover:text-white" onClick={() => setActivePoDetail(null)}>CLOSE [ESC]</button>
                </div>
                <div className="border border-white/10 rounded-2xl overflow-hidden">
                   <table className="w-full text-left text-xs">
                     <thead className="bg-white/5 text-[9px] font-black text-gray-400 uppercase tracking-widest">
                       <tr><th className="px-6 py-3">Ingredient</th><th className="px-4 py-3 text-center">Ordered</th><th className="px-4 py-3 text-center">Received</th><th className="px-6 py-3 text-right">Line Total</th></tr>
                     </thead>
                     <tbody className="divide-y divide-white/5">
                        {activePoDetail.items.map((line) => (
                           <tr key={line.id}>
                             <td className="px-6 py-4 font-bold">{line.ingredient_name}</td>
                             <td className="px-4 py-4 text-center font-medium opacity-60">{line.qty_ordered}</td>
                             <td className="px-4 py-4 text-center font-medium">{line.qty_received}</td>
                             <td className="px-6 py-4 text-right font-black text-teal-400">{money(line.line_cost_cents || 0)}</td>
                           </tr>
                        ))}
                     </tbody>
                   </table>
                </div>
              </div>
            )}
          </div>

          {/* Sidebar Area: Adjustments & Forms */}
          <div className="lg:col-span-4 flex flex-col gap-6 overflow-y-auto scrollbar-hide">
             {/* Manual Adjustment Form */}
             <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 space-y-5 shrink-0">
               <h3 className="text-xs font-black text-gray-900 uppercase tracking-widest border-b border-gray-50 pb-3 italic">Quick Adjust stock</h3>
               <div className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest pl-1">Target Ingredient</label>
                    <select className="w-full px-4 py-3 bg-gray-50 border border-transparent rounded-2xl text-xs font-black outline-none focus:bg-white focus:border-teal-200" value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
                       <option value="">Pick item...</option>
                       {ingredients.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                     <div className="space-y-1">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest pl-1">Add/Rem Qty</label>
                        <input className="w-full px-4 py-3 bg-gray-50 border border-transparent rounded-2xl text-xs font-black text-center" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="+/- 0" />
                     </div>
                     <div className="space-y-1">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest pl-1">Memo</label>
                        <input className="w-full px-4 py-3 bg-gray-50 border border-transparent rounded-2xl text-xs font-black" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason" />
                     </div>
                  </div>
                  <button className="w-full py-4 bg-teal-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-teal-700 shadow-lg shadow-teal-50" onClick={adjust}>Update Inventory</button>
               </div>
             </div>

             {/* Add New Form */}
             <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 space-y-5 shrink-0">
               <h3 className="text-xs font-black text-gray-900 uppercase tracking-widest border-b border-gray-50 pb-3">Register New Product</h3>
               <div className="space-y-3">
                  <input className="w-full px-4 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-xs font-bold" placeholder="Item Name" value={newName} onChange={(e) => setNewName(e.target.value)} />
                  <div className="grid grid-cols-2 gap-2">
                    <input className="px-4 py-2 bg-gray-50 border border-gray-100 rounded-xl text-xs" placeholder="Unit (kg/ltr)" value={newUnit} onChange={(e) => setNewUnit(e.target.value)} />
                    <input className="px-4 py-2 bg-gray-50 border border-gray-100 rounded-xl text-xs font-black text-teal-600" placeholder="Open Stock" value={newStock} onChange={(e) => setNewStock(e.target.value)} />
                    <input className="px-4 py-2 bg-gray-50 border border-gray-100 rounded-xl text-xs" placeholder="Unit Cost (PKR)" value={newUnitCost} onChange={(e) => setNewUnitCost(e.target.value)} />
                    <input className="px-4 py-2 bg-gray-50 border border-gray-100 rounded-xl text-xs" placeholder="Threshold" value={newThreshold} onChange={(e) => setNewThreshold(e.target.value)} />
                  </div>
                  <input className="w-full px-4 py-2 bg-gray-50 border border-gray-100 rounded-xl text-xs" placeholder="Primary Supplier" value={newSupplier} onChange={(e) => setNewSupplier(e.target.value)} />
                  <button className="w-full py-4 bg-gray-900 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-gray-800 transition-all shadow-xl shadow-gray-100" onClick={createIngredient}>Save Ingredient</button>
               </div>
             </div>

             {/* Edit Context Form */}
             {activeEditorId && (
               <div className="bg-white rounded-3xl shadow-2xl border-2 border-teal-500 p-6 space-y-5 shrink-0 animate-in slide-in-from-right-4">
                  <div className="flex justify-between">
                    <h3 className="text-xs font-black text-teal-600 uppercase tracking-widest">Editing Restricted</h3>
                    <button className="text-xs text-gray-300 font-black" onClick={() => setActiveEditorId("")}>CANCEL</button>
                  </div>
                  <div className="space-y-3">
                     <input className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold" value={editName} onChange={(e) => setEditName(e.target.value)} />
                     <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <label className="text-[8px] font-black text-gray-400 uppercase tracking-widest pl-1">Unit</label>
                          <input className="w-full px-4 py-2 bg-gray-50 border border-gray-100 rounded-xl text-xs" value={editUnit} onChange={(e) => setEditUnit(e.target.value)} />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[8px] font-black text-gray-400 uppercase tracking-widest pl-1">Cost PK</label>
                          <input className="w-full px-4 py-2 bg-gray-50 border border-gray-100 rounded-xl text-xs" value={editUnitCost} onChange={(e) => setEditUnitCost(e.target.value)} />
                        </div>
                     </div>
                     <input className="w-full px-4 py-2 bg-gray-50 border border-gray-100 rounded-xl text-xs" value={editSupplier} onChange={(e) => setEditSupplier(e.target.value)} />
                     <button className="w-full py-4 bg-teal-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl shadow-teal-100" onClick={saveIngredient}>Commit Changes</button>
                  </div>
               </div>
             )}

             {/* Feedback */}
             {message && <div className="fixed bottom-6 right-6 px-6 py-4 bg-teal-600 text-white rounded-2xl font-black shadow-2xl animate-in slide-in-from-right-full z-50 text-[10px] uppercase tracking-widest">{message}</div>}
             {error && <div className="fixed bottom-6 right-6 px-6 py-4 bg-red-600 text-white rounded-2xl font-black shadow-2xl animate-in shake z-50 text-[10px] uppercase tracking-widest">{error}</div>}
          </div>
        </div>
      </div>
    );
  }

  window.POSComponents = window.POSComponents || {};
  window.POSComponents.Inventory = Inventory;
})();
