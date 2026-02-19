(function () {
  const { useEffect, useMemo, useState } = React;

  function minsSince(ts) {
    if (!ts) return 0;
    const ms = Date.now() - new Date(String(ts).replace(" ", "T") + "Z").getTime();
    return Math.max(0, Math.floor(ms / 60000));
  }

  function laneClass(mins) {
    if (mins >= 20) return "kds-time danger";
    if (mins >= 10) return "kds-time warn";
    return "kds-time ok";
  }

  function KDS({ user }) {
    const [tickets, setTickets] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [message, setMessage] = useState("");
    const [showHistory, setShowHistory] = useState(false);

    async function load() {
      setError("");
      const statuses = showHistory
        ? ["QUEUED", "PREPARING", "READY", "SERVED", "CANCELLED"]
        : ["QUEUED", "PREPARING", "READY"];
      try {
        const rows = await window.POSUtils.kds.listTickets(statuses);
        setTickets(rows);
      } catch (err) {
        setError(err.message || "Failed to load kitchen tickets.");
      } finally {
        setLoading(false);
      }
    }

    useEffect(() => {
      load();
      const timer = setInterval(load, 15000);
      return () => clearInterval(timer);
    }, [showHistory]);

    async function bump(ticketId) {
      setError("");
      setMessage("");
      try {
        await window.POSUtils.kds.bumpTicket(ticketId, user.id);
        setMessage(`Ticket #${ticketId} moved to next stage.`);
        await load();
      } catch (err) {
        setError(err.message || "Unable to bump ticket.");
      }
    }

    async function setStatus(ticketId, status) {
      setError("");
      setMessage("");
      try {
        await window.POSUtils.kds.updateTicketStatus(ticketId, status, user.id);
        setMessage(`Ticket #${ticketId} set to ${status}.`);
        await load();
      } catch (err) {
        setError(err.message || "Unable to update ticket.");
      }
    }

    const lanes = useMemo(() => {
      const grouped = { QUEUED: [], PREPARING: [], READY: [], SERVED: [], CANCELLED: [] };
      for (const t of tickets) {
        grouped[t.status] = grouped[t.status] || [];
        grouped[t.status].push(t);
      }
      return grouped;
    }, [tickets]);

    return (
      <div className="kds-screen">
        <div className="kds-header">
          <h2>Kitchen Display</h2>
          <div className="kds-actions">
            <label>
              <input type="checkbox" checked={showHistory} onChange={(e) => setShowHistory(e.target.checked)} />
              Show served/cancelled
            </label>
            <button onClick={load}>Refresh</button>
          </div>
        </div>

        {loading ? (
          <div className="card"><p className="muted">Loading tickets...</p></div>
        ) : (
          <div className="kds-lanes">
            {["QUEUED", "PREPARING", "READY"].map((status) => (
              <section className="kds-lane" key={status}>
                <div className="kds-lane-head">
                  <h3>{status}</h3>
                  <span>{lanes[status].length}</span>
                </div>
                <div className="kds-cards">
                  {lanes[status].length === 0 ? (
                    <p className="muted">No tickets</p>
                  ) : (
                    lanes[status].map((t) => {
                      const ticketAge = minsSince(t.created_at);
                      return (
                        <article key={t.id} className="kds-card">
                          <div className="kds-card-head">
                            <strong>#{t.id}</strong>
                            <span>Order #{t.order_id}</span>
                          </div>
                          <div className={laneClass(ticketAge)}>{ticketAge} min</div>
                          <div className="kds-card-meta">
                            <span>{t.customer_name || "Guest"}</span>
                            <span>{t.customer_phone || "-"}</span>
                          </div>
                          <div className="kds-items">
                            {(t.items || []).map((i) => (
                              <div key={i.id} className="kds-item-row">
                                <span>{i.quantity}x {i.menu_item_name}</span>
                                <em>{i.category || "-"}</em>
                              </div>
                            ))}
                          </div>
                          <div className="kds-card-actions">
                            <button onClick={() => bump(t.id)}>Bump</button>
                            {status !== "READY" && (
                              <button onClick={() => setStatus(t.id, "READY")}>Mark Ready</button>
                            )}
                            {status === "READY" && (
                              <button className="primary" onClick={() => setStatus(t.id, "SERVED")}>Serve</button>
                            )}
                            <button onClick={() => setStatus(t.id, "CANCELLED")}>Cancel</button>
                          </div>
                        </article>
                      );
                    })
                  )}
                </div>
              </section>
            ))}
          </div>
        )}

        {showHistory && (
          <div className="kds-history">
            <div className="card">
              <h3>Served</h3>
              {(lanes.SERVED || []).slice(0, 10).map((t) => (
                <div key={`s-${t.id}`} className="kds-history-row">#{t.id} / Order #{t.order_id}</div>
              ))}
            </div>
            <div className="card">
              <h3>Cancelled</h3>
              {(lanes.CANCELLED || []).slice(0, 10).map((t) => (
                <div key={`c-${t.id}`} className="kds-history-row">#{t.id} / Order #{t.order_id}</div>
              ))}
            </div>
          </div>
        )}

        {message && <div className="success">{message}</div>}
        {error && <div className="error">{error}</div>}
      </div>
    );
  }

  window.POSComponents = window.POSComponents || {};
  window.POSComponents.KDS = KDS;
})();

