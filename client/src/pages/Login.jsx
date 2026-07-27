import { useState } from "react";
import { useNavigate } from "react-router-dom"; // 1. Import useNavigate
import { useAuth } from "../lib/auth.jsx";
import { ErrorNote } from "../components/Bits.jsx";

export default function Login() {
  const navigate = useNavigate(); // 2. Initialize navigate
  const { signIn } = useAuth();
  const [identifier, setId] = useState("");
  const [password, setPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      await signIn(identifier, password);
      navigate("/banking"); // 3. Redirect to dashboard on success!
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <form className="box" onSubmit={submit}>
        <div className="eyebrow">Sign in</div>
        <h3 style={{ margin: "4px 0 20px" }}>Welcome back</h3>
        {err && <ErrorNote>{err}</ErrorNote>}
        <div style={{ marginBottom: 12 }}>
          <label>Employee ID or email</label>
          <input
            value={identifier}
            onChange={(e) => setId(e.target.value)}
            autoComplete="username"
          />
        </div>
        <div style={{ marginBottom: 20 }}>
          <label>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPw(e.target.value)}
            autoComplete="current-password"
          />
        </div>
        <button
          className="btn primary"
          style={{ width: "100%" }}
          disabled={busy}
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
