import { useEffect, useState } from 'react';
import { get, shortDate } from '../lib/api.js';
import { Card, Pill, statusTone, Loading, Empty, ErrorNote } from '../components/Bits.jsx';

export default function Assignments() {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState('');
  const [status, setStatus] = useState('');

  useEffect(() => {
    get(`/assignments?${new URLSearchParams(status ? { status } : {})}`)
      .then(setRows).catch(e => setErr(e.message));
  }, [status]);

  if (err) return <ErrorNote>{err}</ErrorNote>;

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
        <div><div className="eyebrow">All departments</div><h3>Assignments</h3></div>
        <select value={status} onChange={e => setStatus(e.target.value)} style={{ width: 180 }}>
          <option value="">Every status</option>
          {['Pending','In Progress','Under Review','Completed','On Hold'].map(s => <option key={s}>{s}</option>)}
        </select>
      </div>

      <Card pad={false}>
        {!rows ? <Loading /> : (
          <table className="tbl">
            <thead><tr>
              <th>No.</th><th>Title</th><th>Department</th><th>Owner</th><th>Due</th>
              <th>Progress</th><th>Priority</th><th>Status</th>
            </tr></thead>
            <tbody>
              {rows.length ? rows.map(a => (
                <tr key={a.id}>
                  <td className="mono" style={{ fontSize: 11.5, color: 'var(--navy)', fontWeight: 600 }}>
                    {a.assignment_no}</td>
                  <td>{a.title}
                    {a.tags && <div style={{ fontSize: 11, color: 'var(--muted)' }}>{a.tags}</div>}</td>
                  <td>{a.department || '—'}</td>
                  <td>{a.assigned_to_name}</td>
                  <td className="mono" style={{ fontSize: 12, color: a.is_overdue ? 'var(--red)' : undefined,
                        fontWeight: a.is_overdue ? 600 : 400 }}>{shortDate(a.due_date)}</td>
                  <td><div className="prog"><i style={{ width: `${a.progress_pct}%` }} /></div></td>
                  <td>{a.priority}</td>
                  <td><Pill kind={statusTone(a.status)}>{a.status}</Pill></td>
                </tr>
              )) : <Empty cols={8}>Nothing here yet.</Empty>}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}
