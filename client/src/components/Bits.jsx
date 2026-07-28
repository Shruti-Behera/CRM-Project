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

export const ini = (name = '') =>
  name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';

export const Avatar = ({ name, size }) => (
  <span className="av" title={name}
    style={size ? { width: size, height: size, fontSize: Math.round(size * 0.4) } : undefined}>
    {ini(name)}
  </span>
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

export const pClass = (p) => ({
  Low: 'p-hold', Medium: 'p-progress', High: 'p-pending', Critical: 'p-red'
}[p] || 'p-hold');

export const Empty = ({ cols, children }) => (
  <tr><td colSpan={cols} style={{ textAlign: 'center', padding: '40px 0', color: 'var(--muted)' }}>
    {children}</td></tr>
);

export const Loading = () => (
  <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Loading…</div>
);

export const ErrorNote = ({ children }) => <div className="err">{children}</div>;

export const Modal = ({ title, onClose, onSave, saveLabel = 'Save', busy, children }) => (
  <div onClick={onClose} style={{
    position: 'fixed', inset: 0, background: 'rgba(16,24,48,.45)', display: 'grid',
    placeItems: 'center', zIndex: 100, padding: 16
  }}>
    <div onClick={e => e.stopPropagation()} style={{
      background: '#fff', borderRadius: 9, width: 'min(640px, 100%)', maxHeight: '90vh',
      overflow: 'auto', boxShadow: '0 28px 70px rgba(10,20,50,.4)'
    }}>
      <div className="hd" style={{ padding: '13px 16px', borderBottom: '1px solid var(--line)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 600 }}>
        <span>{title}</span>
        <button className="btn" style={{ padding: '2px 9px' }} onClick={onClose}>×</button>
      </div>
      <div style={{ padding: 16 }}>{children}</div>
      <div style={{ padding: '12px 16px', borderTop: '1px solid var(--line)', display: 'flex',
        gap: 8, justifyContent: 'flex-end' }}>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" onClick={onSave} disabled={busy}>{busy ? 'Saving…' : saveLabel}</button>
      </div>
    </div>
  </div>
);
