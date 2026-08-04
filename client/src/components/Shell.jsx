import { NavLink, useLocation, useNavigate, Link } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../lib/auth.jsx';
import { get, post } from '../lib/api.js';
import { useNotifications, notificationPath } from '../lib/notifications.jsx';
import { ini, Modal, ErrorNote } from './Bits.jsx';

// The Master module is shared by every workspace — one definition, one set of
// routes. It is appended to each workspace's sidebar so it works identically
// wherever the user happens to be.
const MASTERS = ['Masters', [['/users', 'Users & rights'], ['/masters', 'Category & project'],
                             ['/departments', 'Departments'], ['/data-backup', 'Data & backup'],
                             ['/settings', 'Settings']]];

// Paths that belong to the shared Master module (or other cross-workspace pages)
// and therefore must NOT force the sidebar to switch workspaces.
const SHARED_PREFIXES = ['/users', '/masters', '/departments', '/data-backup', '/settings', '/notifications'];

// Each nav item: [path, label, countKey?]. countKey maps to /api/nav-counts.
const NAV = {
  banking: {
    label: 'Investment & Merchant Banking', hint: 'Accounts · Opportunities · Mandates',
    right: 'opportunities.view', icon: '₹', sub: 'Investment Banking', home: '/banking',
    sections: [
      ['Pipeline', [['/banking', 'Dashboard'], ['/banking/accounts', 'Accounts', 'accounts'],
                    ['/banking/opportunities', 'Opportunities', 'opps'], ['/banking/board', 'Pipeline board']]],
      ['Execution', [['/banking/mandates', 'Mandates'], ['/banking/closed', 'Closed projects']]],
      MASTERS
    ]
  },
  institutional: {
    label: 'Institutional Business', hint: 'Coverage · Research · Brokerage',
    right: 'institutional.view', icon: '📈', sub: 'Institutional Business', home: '/institutional',
    sections: [
      ['Coverage', [['/institutional', 'Dashboard'], ['/institutional/clients', 'Clients', 'clients'],
                    ['/institutional/movement', 'Daily movement', 'visits_today']]],
      ['Research', [['/institutional/reports', 'Reports', 'reports_draft']]],
      ['Flow', [['/institutional/brokerage', 'Volume & brokerage']]],
      MASTERS
    ]
  },
  internal: {
    label: 'Internal Work', hint: 'Assignments · Approvals · Meetings',
    right: 'assignments.view', icon: '✓', sub: 'Work Management', home: '/internal/assignments',
    sections: [
      ['Work', [['/internal', 'Dashboard'], ['/internal/my-day', 'My day'],
                ['/internal/assignments', 'Assignments', 'tasks'], ['/internal/kanban', 'Work board'],
                ['/internal/assignments/new', 'New assignment']]],
      ['Control', [['/internal/work-approvals', 'Work approvals', 'wapprovals'], ['/internal/workload', 'Workload'],
                   ['/internal/timelog', 'Time log']]],
      ['Schedule', [['/internal/meetings', 'Meetings'], ['/internal/calendar', 'Calendar'],
                    ['/internal/emails', 'Emails']]],
      ['Insight', [['/notifications', 'Notifications', 'notifications']]],
      MASTERS
    ]
  }
};

const SEARCH_PATH = {
  opportunity: (r) => `/banking/opportunities/${r.id}`,
  account: () => '/banking/accounts',
  institution: (r) => `/institutional/clients/${r.id}/edit`,
  assignment: (r) => `/internal/assignments/${r.id}`,
  user: () => '/users'
};

export default function Shell({ children }) {
  const { user, signOut, can } = useAuth();
  const loc = useLocation();
  const nav = useNavigate();
  // Only true workspace paths pick the workspace. Shared pages (Masters, etc.)
  // leave the current workspace untouched so Masters feels common to all three.
  const wsFromPath = loc.pathname.startsWith('/institutional') ? 'institutional'
                   : loc.pathname.startsWith('/internal') ? 'internal'
                   : loc.pathname.startsWith('/banking') ? 'banking'
                   : SHARED_PREFIXES.some(p => loc.pathname.startsWith(p)) ? null
                   : 'banking';
  const [ws, setWs] = useState(wsFromPath || 'banking');
  const [open, setOpen] = useState(false);        // mobile sidebar
  const [pwOpen, setPwOpen] = useState(false);     // change-password modal
  const [counts, setCounts] = useState({});
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [menu, setMenu] = useState(null);         // 'notif' | 'profile' | null
  const searchRef = useRef(null);

  // Notifications come from the real-time context (SSE); counters still poll.
  const { items: notifItems, unread, total: notifTotal, refresh: refreshNotif,
          loadMore: loadMoreNotif, markRead, markAll, remove: removeNotif, clearAll } = useNotifications();

  useEffect(() => { if (wsFromPath) setWs(wsFromPath); }, [wsFromPath]);

  useEffect(() => {
    const loadCounts = () => get('/nav-counts').then(setCounts).catch(() => {});
    loadCounts();
    const t = setInterval(loadCounts, 20000);
    return () => clearInterval(t);
  }, []);

  // debounced global search
  useEffect(() => {
    if (q.trim().length < 2) { setResults([]); return; }
    const t = setTimeout(() => { get(`/search?q=${encodeURIComponent(q)}`).then(r => setResults(r || [])).catch(() => setResults([])); }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const switchWs = (key) => { setWs(key); setOpen(false); nav(NAV[key].home); };
  const goResult = (r) => { setQ(''); setResults([]); nav((SEARCH_PATH[r.kind] || (() => '/'))(r)); };
  const openNotif = (n) => {
    if (Number(n.is_read) === 0) markRead(n.id);
    const to = notificationPath(n);
    setMenu(null);
    if (to) nav(to);
  };

  return (
    <div className="shell">
      <aside className={`sidebar${open ? ' open' : ''}`}>
        <div className="brand">
          <img src="/logo-mark.jpg" alt="Ashika" />
          <div><div className="nm">ashika</div><div className="sb">{NAV[ws].sub}</div></div>
        </div>

        <div className="ws">
          <div className="eyebrow" style={{ color: '#8FA0C4', marginBottom: 6 }}>Workspace</div>
          {Object.entries(NAV).filter(([, v]) => can(v.right)).map(([key, v]) => (
            <button key={key} className={ws === key ? 'on' : ''} onClick={() => switchWs(key)}>
              <span className="ic">{v.icon}</span>
              <span>{v.label}<small>{v.hint}</small></span>
            </button>
          ))}
        </div>

        {NAV[ws].sections.map(([section, items]) => (
          <div key={section}>
            <div className="navsec">{section}</div>
            {items.map(([to, label, countKey]) => {
              const c = countKey ? Number(counts[countKey] || 0) : 0;
              return (
                <NavLink key={to} to={to} end={to.split('/').length === 2} onClick={() => setOpen(false)}
                  className={({ isActive }) => `navlink${isActive ? ' active' : ''}`}>
                  <span>{label}</span>{c > 0 && <span className="cnt">{c}</span>}
                </NavLink>
              );
            })}
          </div>
        ))}

        <div className="navsec">Session</div>
        <a className="navlink" role="button" onClick={() => { setOpen(false); setPwOpen(true); }}><span>Change password</span></a>
        <a className="navlink" role="button" onClick={signOut}><span>Sign out</span></a>
      </aside>

      <div style={{ minWidth: 0 }}>
        <div className="topbar" onClick={() => menu && setMenu(null)}>
          <button className="hamburger" onClick={() => setOpen(o => !o)}>☰</button>

          <div className="gsearch" ref={searchRef}>
            <input placeholder="Search anything — task, account, mandate, person…" value={q}
              onChange={e => setQ(e.target.value)} autoComplete="off" />
            {results.length > 0 && q.trim().length >= 2 && (
              <div className="gres">
                {results.map((r, i) => (
                  <a key={i} role="button" onClick={() => goResult(r)}>
                    <span><b className="mono" style={{ fontSize: 11.5 }}>{r.ref}</b> {r.label}</span>
                    <span className="k">{r.kind}{r.sub ? ` · ${r.sub}` : ''}</span>
                  </a>
                ))}
              </div>
            )}
          </div>

          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ position: 'relative' }}>
              <button className="icon-btn" title="Notifications"
                onClick={(e) => { e.stopPropagation(); setMenu(m => m === 'notif' ? null : 'notif'); if (menu !== 'notif') refreshNotif(); }}>
                🔔{unread > 0 && <span className="dot">{unread > 99 ? '99+' : unread}</span>}
              </button>
              {menu === 'notif' && (
                <div className="menu" style={{ minWidth: 340 }} onClick={e => e.stopPropagation()}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderBottom: '1px solid var(--line)' }}>
                    <b style={{ fontSize: 13 }}>Notifications{unread > 0 ? ` · ${unread} new` : ''}</b>
                    <span style={{ display: 'flex', gap: 6 }}>
                      {unread > 0 && <button className="btn" style={{ padding: '2px 8px' }} onClick={markAll}>Mark all read</button>}
                      {notifItems.length > 0 && <button className="btn" style={{ padding: '2px 8px', color: 'var(--red)' }} onClick={clearAll}>Clear all</button>}
                    </span>
                  </div>
                  <div style={{ maxHeight: 380, overflow: 'auto' }}>
                    {notifItems.length ? notifItems.map(n => (
                      <div key={n.id} className="notif-row" style={{ background: Number(n.is_read) === 0 ? '#F5F9FF' : '#fff' }}>
                        <span className="notif-dot" style={{ background: Number(n.is_read) === 0 ? 'var(--cyan)' : 'transparent' }} />
                        <div style={{ flex: 1, minWidth: 0, cursor: notificationPath(n) ? 'pointer' : 'default' }} onClick={() => openNotif(n)}>
                          <div style={{ fontSize: 12.5, fontWeight: 600 }}>{n.title}</div>
                          <div style={{ fontSize: 12, color: 'var(--muted)' }}>{n.message}</div>
                          <div className="mono" style={{ fontSize: 10.5, color: 'var(--muted)', marginTop: 2 }}>
                            {n.created_at}{n.sender ? ` · ${n.sender}` : ''}</div>
                        </div>
                        <button className="btn" style={{ padding: '0 6px', alignSelf: 'flex-start' }}
                          title="Delete" onClick={(e) => { e.stopPropagation(); removeNotif(n.id); }}>×</button>
                      </div>
                    )) : <div style={{ padding: 16, fontSize: 13, color: 'var(--muted)', textAlign: 'center' }}>Nothing new.</div>}
                    {notifItems.length < notifTotal &&
                      <button className="mi" style={{ textAlign: 'center', color: 'var(--navy)' }} onClick={loadMoreNotif}>Load more</button>}
                  </div>
                  <Link className="mi" to="/notifications" style={{ textAlign: 'center', borderTop: '1px solid var(--line)' }}
                    onClick={() => setMenu(null)}>View all notifications</Link>
                </div>
              )}
            </div>

            <div style={{ position: 'relative' }}>
              <button className="icon-btn" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}
                onClick={(e) => { e.stopPropagation(); setMenu(m => m === 'profile' ? null : 'profile'); }}>
                <span className="av">{ini(user.name)}</span>
                <span className="d-md" style={{ textAlign: 'left', lineHeight: 1.2 }}>
                  <span style={{ display: 'block', fontWeight: 600, fontSize: 13 }}>{user.name}</span>
                  <span style={{ display: 'block', fontSize: 11, color: 'var(--muted)' }}>Level {user.level} · {user.department || '—'}</span>
                </span>
              </button>
              {menu === 'profile' && (
                <div className="menu" onClick={e => e.stopPropagation()}>
                  <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--line)' }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{user.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>{user.email}</div>
                  </div>
                  <button className="mi" onClick={() => { setMenu(null); nav('/users'); }}>Users &amp; rights</button>
                  <button className="mi" onClick={() => { setMenu(null); nav('/settings'); }}>Settings</button>
                  <button className="mi" onClick={() => { setMenu(null); setPwOpen(true); }}>Change password</button>
                  <button className="mi" style={{ color: 'var(--red)', borderTop: '1px solid var(--line)' }} onClick={signOut}>Sign out</button>
                </div>
              )}
            </div>

            <button className="btn" onClick={signOut}>Sign out</button>
          </div>
        </div>
        <main className="main">{children}</main>
      </div>

      {pwOpen && <ChangePassword onClose={() => setPwOpen(false)} />}
    </div>
  );
}

/* Change your own password. Talks to POST /api/auth/change-password, which
   verifies the current password, applies the policy, updates the PBKDF2 hash,
   writes an audit entry and sends a confirming notification. */
function ChangePassword({ onClose }) {
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);

  const save = async () => {
    setErr('');
    if (!cur) return setErr('Enter your current password');
    if (next.length < 8) return setErr('The new password needs at least 8 characters');
    if (next !== confirm) return setErr('The two new passwords do not match');
    if (next === cur) return setErr('The new password must be different from your current one');
    setBusy(true);
    try {
      await post('/auth/change-password', { current: cur, next });
      setDone(true);
      setTimeout(onClose, 1400);
    } catch (e) {
      setErr(e.message || 'Could not change the password');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Change password" onClose={onClose} onSave={save} saveLabel="Change password" busy={busy || done}>
      {done ? (
        <div style={{ padding: '8px 0', fontSize: 13.5, color: 'var(--green-deep)' }}>
          ✓ Your password has been changed.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {err && <ErrorNote>{err}</ErrorNote>}
          <div>
            <label>Current password</label>
            <input type="password" autoFocus value={cur} onChange={e => setCur(e.target.value)}
              autoComplete="current-password" />
          </div>
          <div>
            <label>New password (minimum 8 characters)</label>
            <input type="password" value={next} onChange={e => setNext(e.target.value)}
              autoComplete="new-password" />
          </div>
          <div>
            <label>Repeat new password</label>
            <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
              autoComplete="new-password"
              onKeyDown={e => { if (e.key === 'Enter') save(); }} />
          </div>
        </div>
      )}
    </Modal>
  );
}
