import { useEffect, useState } from 'react';
import { get } from '../lib/api.js';
import { Card, Pill, Loading, Empty, ErrorNote } from '../components/Bits.jsx';

const LEVELS = {
  1: ['Super Admin', 'every record, plus user administration'],
  2: ['Head / Director', 'every record, no user administration'],
  3: ['Manager', 'own department or division, plus their reporting line'],
  4: ['Executive', 'only what they own, support or watch']
};

export default function Users() {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => { get('/users').then(setRows).catch(e => setErr(e.message)); }, []);

  if (err) return <ErrorNote>{err}</ErrorNote>;
  if (!rows) return <Loading />;

  return (
    <>
      <div className="eyebrow">Who sees what</div>
      <h3 style={{ marginBottom: 14 }}>Users &amp; rights</h3>

      <Card title="Hierarchy">
        {Object.entries(LEVELS).map(([lvl, [name, note]]) => (
          <div key={lvl} style={{ display: 'flex', gap: 12, padding: '6px 0',
                                  borderBottom: '1px solid #F1F4F8' }}>
            <Pill kind={lvl === '1' ? 'p-red' : lvl === '2' ? 'p-review' : lvl === '3' ? 'p-progress' : 'p-hold'}>
              Level {lvl}</Pill>
            <div><b style={{ fontSize: 13 }}>{name}</b>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>{note}</div></div>
            <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--muted)' }}>
              {rows.filter(r => r.level === Number(lvl)).length} user(s)</span>
          </div>
        ))}
      </Card>

      <Card pad={false} title={null}>
        <table className="tbl">
          <thead><tr>
            <th>Employee ID</th><th>Name</th><th>Email</th><th>Department</th><th>Division</th>
            <th>Reports to</th><th>Level</th><th>Open work</th><th>Status</th>
          </tr></thead>
          <tbody>
            {rows.length ? rows.map(u => (
              <tr key={u.id}>
                <td className="mono" style={{ fontSize: 12 }}>{u.employee_code}</td>
                <td style={{ fontWeight: 500 }}>{u.name}</td>
                <td>{u.email}</td>
                <td>{u.department || '—'}</td>
                <td>{u.division || '—'}</td>
                <td>{u.manager || '—'}</td>
                <td><Pill kind={u.level === 1 ? 'p-red' : u.level === 2 ? 'p-review'
                          : u.level === 3 ? 'p-progress' : 'p-hold'}>Level {u.level}</Pill>
                  {u.overrides > 0 && <span style={{ fontSize: 11, color: 'var(--muted)' }}> custom</span>}</td>
                <td className="mono">{u.open_work}</td>
                <td><Pill kind={u.status === 'Active' ? 'p-done' : 'p-hold'}>{u.status}</Pill></td>
              </tr>
            )) : <Empty cols={9}>No users.</Empty>}
          </tbody>
        </table>
      </Card>
    </>
  );
}
