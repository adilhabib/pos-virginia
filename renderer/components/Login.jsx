(function () {
  const { useState } = React;

  function Login({ onLogin }) {
    const [username, setUsername] = useState("cashier");
    const [pin, setPin] = useState("9999");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    async function handleSubmit(e) {
      e.preventDefault();
      setError("");
      setLoading(true);
      try {
        const user = await window.POSUtils.db.login(username.trim(), pin.trim());
        onLogin(user);
      } catch (err) {
        setError(err.message || "Login failed.");
      } finally {
        setLoading(false);
      }
    }

    return (
      <div className="login-wrap">
        <div className="card login-card">
          <h1>Virginia Pizza & Fast Food POS</h1>
          <p className="muted">PIN-based secure access</p>
          <form onSubmit={handleSubmit}>
            <label>Username</label>
            <input value={username} onChange={(e) => setUsername(e.target.value)} />
            <label>PIN</label>
            <input type="password" value={pin} onChange={(e) => setPin(e.target.value)} />
            {error && <div className="error">{error}</div>}
            <button className="primary" disabled={loading}>
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </form>
          <div className="hint">
            Default users: <code>admin/1234</code>, <code>manager/2222</code>, <code>cashier/9999</code>
          </div>
        </div>
      </div>
    );
  }

  window.POSComponents = window.POSComponents || {};
  window.POSComponents.Login = Login;
})();
