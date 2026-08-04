import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../lib/auth.jsx';
import { get, post } from '../lib/api.js';
import { ini } from './Bits.jsx';

// Each nav item: [path, label, countKey?]. countKey maps to /api/nav-counts.
const NAV = {
  banking: {
    label: 'Investment & Merchant Banking', hint: 'Accounts · Opportunities · Mandates',
    right: 'opportunities.view', icon: '₹', sub: 'Investment Banking', home: '/banking',
    sections: [
      ['Pipeline', [['/banking', 'Dashboard'], ['/banking/accounts', 'Accounts', 'accounts'],
                    ['/banking/opportunities', 'Opportunities', 'opps'], ['/banking/board', 'Pipeline board']]],
      ['Execution', [['/banking/mandates', 'Mandates'], ['/banking/closed', 'Closed projects']]]
    ]
  },
  institutional: {
    label: 'Institutional Business', hint: 'Coverage · Research · Brokerage',
    right: 'institutional.view', icon: '📈', sub: 'Institutional Business', home: '/institutional',
    sections: [
      ['Coverage', [['/institutional', 'Dashboard'], ['/institutional/clients', 'Clients', 'clients'],
                    ['/institutional/movement', 'Daily movement', 'visits_today']]],
      ['Research', [['/institutional/reports', 'Reports', 'reports_draft']]],
      ['Flow', [['/institutional/brokerage', 'Volume & brokerage']]]
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
      ['Masters', [['/users', 'Users & rights'], ['/masters', 'Category & project'],
                   ['/departments', 'Departments'], ['/data-backup', 'Data & backup'],
                   ['/settings', 'Settings']]]
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
  const current = loc.pathname.startsWith('/institutional') ? 'institutional'
                : loc.pathname.startsWith('/internal') || ['/users', '/masters', '/departments', '/data-backup', '/settings'].some(p => loc.pathname.startsWith(p)) ? 'internal'
                : 'banking';
  const [ws, setWs] = useState(current);
  const [open, setOpen] = useState(false);        // mobile sidebar
  const [counts, setCounts] = useState({});
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [notif, setNotif] = useState({ unread: 0, items: [] });
  const [menu, setMenu] = useState(null);         // 'notif' | 'profile' | null
  const searchRef = useRef(null);

  useEffect(() => { setWs(current); }, [current]);

  const loadShell = () => {
    get('/nav-counts').then(setCounts).catch(() => {});
    get('/notifications').then(setNotif).catch(() => {});
  };
  useEffect(() => {
    loadShell();
    const t = setInterval(loadShell, 20000);          // near real-time notifications + counters
    const onFocus = () => loadShell();                 // refresh the moment you return to the tab
    window.addEventListener('focus', onFocus);
    return () => { clearInterval(t); window.removeEventListener('focus', onFocus); };
  }, []);

  // debounced global search
  useEffect(() => {
    if (q.trim().length < 2) { setResults([]); return; }
    const t = setTimeout(() => { get(`/search?q=${encodeURIComponent(q)}`).then(r => setResults(r || [])).catch(() => setResults([])); }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const switchWs = (key) => { setWs(key); setOpen(false); nav(NAV[key].home); };
  const goResult = (r) => { setQ(''); setResults([]); nav((SEARCH_PATH[r.kind] || (() => '/'))(r)); };
  const markRead = async () => { try { await post('/notifications/read', {}); loadShell(); } catch { /* noop */ } };

  return (
    <div className="shell">
      <aside className={`sidebar${open ? ' open' : ''}`}>
        <div className="brand">
          <img src="/logo.jpg" alt="Ashika" />
          <div><div className="nm">ashika</div><div className="sb">{NAV[ws].sub}</div></div>
        </div>

        <div className="ws">
          <div className="eyebrow" style={{ color: '#8FA0C4', marginBottom: 6 }}>Workspace</div>
          {Object.entries(NAV).filter(([, v]) => can(v.right)).map(([key, v]) => (
            <button key={key} className={ws === key ? 'on' : ''} onClick={() => switchWs(key)}>
              <span className="ic">{v.icon}</span>{v.label}
              <small>{v.hint}</small>
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
                onClick={(e) => { e.stopPropagation(); setMenu(m => m === 'notif' ? null : 'notif'); }}>
                🔔{notif.unread > 0 && <span className="dot">{notif.unread}</span>}
              </button>
              {menu === 'notif' && (
                <div className="menu" style={{ minWidth: 320 }} onClick={e => e.stopPropagation()}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderBottom: '1px solid var(--line)' }}>
                    <b style={{ fontSize: 13 }}>Notifications</b>
                    {notif.unread > 0 && <button className="btn" style={{ padding: '2px 8px' }} onClick={markRead}>Mark all read</button>}
                  </div>
                  <div style={{ maxHeight: 340, overflow: 'auto' }}>
                    {notif.items.length ? notif.items.slice(0, 20).map(n => (
                      <div key={n.id} style={{ padding: '9px 14px', borderBottom: '1px solid #F2F4F8', background: Number(n.is_read) === 0 ? '#F5F9FF' : '#fff' }}>
                        <div style={{ fontSize: 12.5, fontWeight: 600 }}>{n.title}</div>
                        <div style={{ fontSize: 12, color: 'var(--muted)' }}>{n.message}</div>
                        <div className="mono" style={{ fontSize: 10.5, color: 'var(--muted)', marginTop: 2 }}>{n.created_at}</div>
                      </div>
                    )) : <div style={{ padding: 16, fontSize: 13, color: 'var(--muted)', textAlign: 'center' }}>Nothing new.</div>}
                  </div>
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
                  <button className="mi" style={{ color: 'var(--red)', borderTop: '1px solid var(--line)' }} onClick={signOut}>Sign out</button>
                </div>
              )}
            </div>

            <button className="btn" onClick={signOut}>Sign out</button>
          </div>
        </div>
        <main className="main">{children}</main>
      </div>
    </div>
  );
}
