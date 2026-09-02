import { useState } from 'react';
import { post } from '../lib/api.js';

/* Shown in place of the app when a user's account is flagged
   must_change_password (bulk-imported users signing in for the first time).
   It reuses the existing /auth/change-password endpoint — the "current"
   password is the temporary one from the import sheet. On success we reload so
   the AuthProvider re-fetches /auth/me with the flag now cleared. */
export default function ForcePassword({ user }) {
  const [cur, setCur] = useState('');
  const [nxt, setNxt] = useState('');
  const [conf, setConf] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (nxt.length < 8) { setErr('The new password needs at least 8 characters'); return; }
    if (nxt === cur) { setErr('The new password must be different from the temporary one'); return; }
    if (nxt !== conf) { setErr('The new password and confirmation do not match'); return; }
    setBusy(true); setErr('');
    try {
      await post('/auth/change-password', { current: cur, next: nxt });
      window.location.reload();
    } catch (e2) { setErr(e2.message); setBusy(false); }
  };

  const field = { display: 'block', width: '100%', marginBottom: 10 };

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 16 }}>
      <form onSubmit={submit} style={{ background: '#fff', borderRadius: 10, padding: 24,
        width: 'min(420px, 100%)', boxShadow: '0 24px 60px rgba(10,20,50,.25)' }}>
        <h3 style={{ marginTop: 0 }}>Set a new password</h3>
        <p style={{ fontSize: 13, color: 'var(--muted)' }}>
          Welcome{user?.name ? `, ${user.name}` : ''}. For security, please replace your temporary
          password before continuing.
        </p>
        {err && <div style={{ color: 'var(--red)', fontSize: 13, marginBottom: 8 }}>{err}</div>}
        <label>Temporary password</label>
        <input style={field} type="password" value={cur} onChange={e => setCur(e.target.value)} autoFocus />
        <label>New password</label>
        <input style={field} type="password" value={nxt} onChange={e => setNxt(e.target.value)} />
        <label>Confirm new password</label>
        <input style={field} type="password" value={conf} onChange={e => setConf(e.target.value)} />
        <button className="btn primary" type="submit" disabled={busy} style={{ width: '100%', marginTop: 6 }}>
          {busy ? 'Saving…' : 'Set password & continue'}
        </button>
      </form>
    </div>
  );
}
