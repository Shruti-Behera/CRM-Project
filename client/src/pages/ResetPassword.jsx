import { useEffect, useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { get, post } from "../lib/api.js";
import { ErrorNote } from "../components/Bits.jsx";

export default function ResetPassword() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get("token") || "";

  const [state, setState] = useState("checking");   // checking | valid | invalid | done
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) { setState("invalid"); return; }
    get(`/auth/reset/validate?token=${encodeURIComponent(token)}`)
      .then(r => setState(r?.valid ? "valid" : "invalid"))
      .catch(() => setState("invalid"));
  }, [token]);

  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    if (password.length < 8) { setErr("Use at least 8 characters"); return; }
    if (password !== confirm) { setErr("The two passwords don't match"); return; }
    setBusy(true);
    try {
      await post("/auth/reset", { token, password });
      setState("done");
      setTimeout(() => navigate("/login"), 2500);
    } catch (ex) {
      setErr(ex.message);
      if (/invalid|expired/i.test(ex.message)) setState("invalid");
    } finally { setBusy(false); }
  };

  return (
    <div className="login">
      <div className="login-card">
        <div className="login-aside">
          <div>
            <div className="logo-tile"><img src="/logo-login.jpg" alt="Ashika" /></div>
            <h2>Set a new password.</h2>
            <p>Choose a strong password you don't use anywhere else. The reset link works once and
              expires an hour after it was sent.</p>
          </div>
          <div className="login-stats">
            <span>2 WORKSPACES</span><span>50 SEATS</span><span>12 DEPARTMENTS</span>
          </div>
        </div>

        <div className="login-form">
          {state === "checking" && <p style={{ color: "var(--muted)" }}>Checking your link…</p>}

          {state === "invalid" && (
            <>
              <div className="eyebrow">Reset password</div>
              <h3 style={{ margin: "4px 0 10px" }}>Link expired</h3>
              <ErrorNote>This reset link is invalid or has expired. Reset links last one hour and can be used once.</ErrorNote>
              <Link className="btn primary" to="/login" style={{ width: "100%", padding: "9px", textAlign: "center" }}>Back to sign in</Link>
            </>
          )}

          {state === "done" && (
            <>
              <div className="eyebrow">Reset password</div>
              <h3 style={{ margin: "4px 0 10px" }}>Password updated</h3>
              <div style={{ background: "#DCF3E9", color: "#0E7350", padding: "8px 12px", borderRadius: 6, fontSize: 12.5, marginBottom: 12 }}>
                Your password has been changed. Redirecting you to sign in…
              </div>
              <Link className="btn primary" to="/login" style={{ width: "100%", padding: "9px", textAlign: "center" }}>Sign in now</Link>
            </>
          )}

          {state === "valid" && (
            <form onSubmit={submit}>
              <div className="eyebrow">Reset password</div>
              <h3 style={{ margin: "4px 0 20px" }}>Choose a new password</h3>
              {err && <ErrorNote>{err}</ErrorNote>}
              <div style={{ marginBottom: 14 }}>
                <label>New password</label>
                <input type="password" value={password} autoComplete="new-password"
                  onChange={(e) => setPassword(e.target.value)} />
                <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 4 }}>At least 8 characters.</div>
              </div>
              <div style={{ marginBottom: 18 }}>
                <label>Confirm password</label>
                <input type="password" value={confirm} autoComplete="new-password"
                  onChange={(e) => setConfirm(e.target.value)} />
              </div>
              <button className="btn primary" style={{ width: "100%", padding: "9px" }} disabled={busy}>
                {busy ? "Saving…" : "Set new password"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
