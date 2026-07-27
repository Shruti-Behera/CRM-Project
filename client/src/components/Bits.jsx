export const Stat = ({ cap, big, foot, tone = '' }) => (
  <div className={`stat ${tone}`}>
    <div className="cap">{cap}</div>
    <div className="big">{big}</div>
    {foot && <div className="foot">{foot}</div>}
  </div>
);

export const Card = ({ title, extra, children, pad = true }) => (
  <div className="card">
    {title && <div className="hd"><span>{title}</span>{extra}</div>}
    {pad ? <div className="bd">{children}</div> : children}
  </div>
);

export const Pill = ({ kind = 'p-hold', children }) => (
  <span className={`pill ${kind}`}>{children}</span>
);

export const stageTone = (s) => ({
  Lead: 'p-hold', Qualified: 'p-progress', Pitched: 'p-progress', 'Term Sheet': 'p-review',
  Mandated: 'p-done', 'Closed Won': 'p-done', Lost: 'p-red'
}[s] || 'p-hold');

export const statusTone = (s) => ({
  Pending: 'p-pending', 'In Progress': 'p-progress', 'Under Review': 'p-review',
  Completed: 'p-done', 'On Hold': 'p-hold', Approved: 'p-done', Rejected: 'p-red',
  Draft: 'p-hold', Withdrawn: 'p-hold'
}[s] || 'p-hold');

export const Empty = ({ cols, children }) => (
  <tr><td colSpan={cols} style={{ textAlign: 'center', padding: '40px 0', color: 'var(--muted)' }}>
    {children}</td></tr>
);

export const Loading = () => (
  <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Loading…</div>
);

export const ErrorNote = ({ children }) => <div className="err">{children}</div>;
