import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useAuth } from '../lib/auth.jsx';

const NAV = {
  banking: {
    label: 'Investment & Merchant Banking', hint: 'Accounts · Opportunities · Mandates',
    right: 'opportunities.view',
    sections: [
      ['Pipeline', [['/banking', 'Dashboard'], ['/banking/opportunities', 'Opportunities'],
                    ['/banking/accounts', 'Accounts']]],
      ['Execution', [['/banking/mandates', 'Mandates'], ['/banking/closed', 'Closed projects']]]
    ]
  },
  institutional: {
    label: 'Institutional Business', hint: 'Coverage · Research · Brokerage',
    right: 'institutional.view',
    sections: [
      ['Coverage', [['/institutional', 'Dashboard'], ['/institutional/clients', 'Clients'],
                    ['/institutional/movement', 'Daily movement']]],
      ['Research', [['/institutional/reports', 'Reports']]],
      ['Flow', [['/institutional/brokerage', 'Volume & brokerage']]]
    ]
  },
  internal: {
    label: 'Internal Work', hint: 'Assignments · Approvals · Meetings',
    right: 'assignments.view',
    sections: [
      ['Work', [['/internal', 'Dashboard'], ['/internal/my-day', 'My day'],
                ['/internal/assignments', 'Assignments']]],
      ['Control', [['/internal/work-approvals', 'Work approvals'], ['/internal/workload', 'Workload']]],
      ['Masters', [['/masters', 'Masters'], ['/users', 'Users & rights']]]
    ]
  }
};

export default function Shell({ children }) {
  const { user, signOut, can } = useAuth();
  const loc = useLocation();
  const nav = useNavigate();
  const current = loc.pathname.startsWith('/institutional') ? 'institutional'
                : loc.pathname.startsWith('/internal') ? 'internal' : 'banking';
  const [ws, setWs] = useState(current);

  const switchWs = (key) => {
    setWs(key);
    nav(key === 'banking' ? '/banking' : key === 'institutional' ? '/institutional/clients'
                                        : '/internal/assignments');
  };

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">ashika</div>

        <div className="ws">
          <div className="eyebrow" style={{ color: '#8FA0C4', marginBottom: 6 }}>Workspace</div>
          {Object.entries(NAV).filter(([, v]) => can(v.right)).map(([key, v]) => (
            <button key={key} className={ws === key ? 'on' : ''} onClick={() => switchWs(key)}>
              {v.label}
              <small style={{ display: 'block', fontSize: 10, opacity: .72 }}>{v.hint}</small>
            </button>
          ))}
        </div>

        {NAV[ws].sections.map(([section, items]) => (
          <div key={section}>
            <div className="navsec">{section}</div>
            {items.map(([to, label]) => (
              <NavLink key={to} to={to} end={to.split('/').length === 2}
                className={({ isActive }) => `navlink${isActive ? ' active' : ''}`}>{label}</NavLink>
            ))}
          </div>
        ))}

        <div className="navsec">Session</div>
        <a className="navlink" role="button" onClick={signOut}>Sign out</a>
      </aside>

      <div style={{ minWidth: 0 }}>
        <div className="topbar">
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ textAlign: 'right', lineHeight: 1.2 }}>
              <div style={{ fontWeight: 600 }}>{user.name}</div>
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                Level {user.level} · {user.department || '—'}
              </div>
            </div>
          </div>
        </div>
        <main className="main">{children}</main>
      </div>
    </div>
  );
}
