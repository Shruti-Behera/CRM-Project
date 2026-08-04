import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth.jsx";
import { post } from "../lib/api.js";
import { ErrorNote } from "../components/Bits.jsx";

export default function Login() {
  const navigate = useNavigate();
  const { signIn } = useAuth();
  const [mode, setMode] = useState("signin");   // 'signin' | 'forgot'
  const [identifier, setId] = useState("");
  const [password, setPw] = useState("");
  const [remember, setRemember] = useState(true);
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr(""); setBusy(true);
    try {
      await signIn(identifier, password);
      navigate("/banking");
    } catch (ex) { setErr(ex.message); }
    finally { setBusy(false); }
  };

  const forgot = async (e) => {
    e.preventDefault();
    if (!identifier.trim()) { setErr("Enter your employee ID or email first"); return; }
    setErr(""); setBusy(true);
    try {
      await post("/auth/forgot", { identifier });
      setNote("If that account exists, a password reset link has been emailed to you. It expires in one hour.");
    } catch (ex) { setErr(ex.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="login">
      <div className="login-card">
        <div className="login-aside">
          <div>
            <div className="logo-tile"><img src="/logo-login.jpg" alt="Ashika" /></div>
            <h2>Deals and internal work,<br />on one desk.</h2>
            <p>
              Track accounts, opportunities and mandates on the banking side. Track assignments,
              approvals and meetings on the internal side. Same login, same people, one record of what happened.
            </p>
          </div>
          <div className="login-stats">
            <span>2 WORKSPACES</span><span>50 SEATS</span><span>12 DEPARTMENTS</span>
          </div>
        </div>

        <form className="login-form" onSubmit={mode === "signin" ? submit : forgot}>
          {mode === "signin" ? (
            <>
              <div className="eyebrow">Sign in</div>
              <h3 style={{ margin: "4px 0 20px" }}>Welcome back</h3>
              {err && <ErrorNote>{err}</ErrorNote>}
              <div style={{ marginBottom: 14 }}>
                <label>Employee ID or email</label>
                <input value={identifier} placeholder="admin@ashika.com" autoComplete="username"
                  onChange={(e) => setId(e.target.value)} />
              </div>
              <div style={{ marginBottom: 16 }}>
                <label>Password</label>
                <input type="password" value={password} autoComplete="current-password"
                  onChange={(e) => setPw(e.target.value)} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
                <label className="remember">
                  <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
                  Remember me
                </label>
                <a href="#" style={{ fontSize: 13 }}
                  onClick={(e) => { e.preventDefault(); setErr(""); setNote(""); setMode("forgot"); }}>Forgot password?</a>
              </div>
              <button className="btn primary" style={{ width: "100%", padding: "9px" }} disabled={busy}>
                {busy ? "Signing in…" : "Sign in"}
              </button>
            </>
          ) : (
            <>
              <div className="eyebrow">Reset access</div>
              <h3 style={{ margin: "4px 0 8px" }}>Forgot password</h3>
              <p style={{ fontSize: 13, color: "var(--muted)", marginTop: 0 }}>
                Enter your employee ID or office email. Your administrator will be notified to reset it.
              </p>
              {err && <ErrorNote>{err}</ErrorNote>}
              {note && <div style={{ background: "#DCF3E9", color: "#0E7350", padding: "8px 12px", borderRadius: 6, fontSize: 12.5, marginBottom: 12 }}>{note}</div>}
              <div style={{ marginBottom: 16 }}>
                <label>Employee ID or email</label>
                <input value={identifier} placeholder="admin@ashika.com" autoComplete="username"
                  onChange={(e) => setId(e.target.value)} />
              </div>
              <button className="btn primary" style={{ width: "100%", padding: "9px" }} disabled={busy}>
                {busy ? "Sending…" : "Send reset request"}
              </button>
              <p style={{ textAlign: "center", marginTop: 14, marginBottom: 0 }}>
                <a href="#" style={{ fontSize: 13 }}
                  onClick={(e) => { e.preventDefault(); setErr(""); setNote(""); setMode("signin"); }}>Back to sign in</a>
              </p>
            </>
          )}
        </form>
      </div>
    </div>
  );
}
