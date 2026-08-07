import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { get } from '../lib/api.js';
import { Avatar, Loading, ErrorNote } from '../components/Bits.jsx';

const STATUSES = ['Pending', 'In Progress', 'Under Review', 'Completed', 'On Hold'];

const border = (t) =>
  t.is_overdue ? 'var(--red)'
    : t.status === 'Completed' ? 'var(--green)'
    : t.status === 'Under Review' ? 'var(--cyan)'
    : t.status === 'In Progress' ? 'var(--blue)'
    : t.status === 'On Hold' ? 'var(--amber)' : 'var(--navy)';

export default function Kanban() {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => { get('/assignments').then(setRows).catch(e => setErr(e.message)); }, []);

  if (err) return <ErrorNote>{err}</ErrorNote>;
  if (!rows) return <Loading />;

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div><div className="eyebrow">Assignments by status</div><h3>Work board</h3></div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link className="btn" to="/internal/assignments">Table view</Link>
          <Link className="btn primary" to="/internal/assignments/new">New assignment</Link>
        </div>
      </div>

      <div className="board">
        {STATUSES.map(s => {
          const list = rows.filter(t => t.status === s);
          return (
            <div key={s} className="col-k">
              <div className="kh"><span>{s}</span><span className="n">{list.length}</span></div>
              {list.length ? list.map(t => (
                <Link key={t.id} className="kcard" to={`/internal/assignments/${t.id}`}
                  style={{ borderLeftColor: border(t) }}>
                  <span className="mono" style={{ fontSize: 10.5, color: 'var(--muted)' }}>{t.assignment_no}</span>
                  <div className="t">{t.title}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                    <div className="prog" style={{ maxWidth: 80 }}><i style={{ width: `${t.progress_pct}%` }} /></div>
                    <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                      {(t.assigned_to_name || '').split(', ').filter(Boolean).slice(0, 3).map((n, i) => (
                        <span key={i} style={{ marginLeft: i ? -6 : 0 }}><Avatar name={n} size={22} title={n} /></span>
                      ))}
                    </span>
                  </div>
                </Link>
              )) : <div style={{ fontSize: 12, color: 'var(--muted)', padding: '8px 2px' }}>Nothing here</div>}
            </div>
          );
        })}
      </div>
    </>
  );
}
