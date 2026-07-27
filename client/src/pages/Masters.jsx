import { useEffect, useState } from 'react';
import { get, post, put, del } from '../lib/api.js';
import { Card, Pill, Loading, Empty, ErrorNote } from '../components/Bits.jsx';

const TABS = [
  ['departments', 'Departments'], ['divisions', 'Divisions'], ['groups', 'Groups'],
  ['preferences', 'Preferences'], ['countries', 'Locations'], ['sectors', 'Segments'],
  ['deal-types', 'Deal types'], ['categories', 'Categories'], ['projects', 'Projects'],
  ['work-types', 'Types of work'], ['tags', 'Tags']
];

export default function Masters() {
  const [tab, setTab] = useState('departments');
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState('');
  const [name, setName] = useState('');

  const load = () => { setRows(null); get(`/masters/${tab}`).then(setRows).catch(e => setErr(e.message)); };
  useEffect(load, [tab]);

  const add = async () => {
    if (!name.trim()) return;
    try { await post(`/masters/${tab}`, { name }); setName(''); load(); }
    catch (e) { setErr(e.message); }
  };
  const remove = async (id) => {
    try { await del(`/masters/${tab}/${id}`); load(); }
    catch (e) { setErr(e.message); }        // the server explains why, e.g. still in use
  };

  return (
    <>
      <div className="eyebrow">Lists the rest of the system picks from</div>
      <h3 style={{ marginBottom: 14 }}>Masters</h3>
      {err && <ErrorNote>{err}</ErrorNote>}

      <div style={{ display: 'flex', gap: 2, borderBottom: '1px solid var(--line)',
                    marginBottom: 15, overflowX: 'auto' }}>
        {TABS.map(([key, label]) => (
          <button key={key} onClick={() => { setErr(''); setTab(key); }}
            style={{ background: 'none', border: 0, borderBottom: `2px solid ${tab === key ? 'var(--cyan)' : 'transparent'}`,
              padding: '8px 14px', font: 'inherit', fontSize: 13, cursor: 'pointer',
              color: tab === key ? 'var(--navy)' : 'var(--muted)',
              fontWeight: tab === key ? 600 : 400 }}>{label}</button>
        ))}
      </div>

      <Card pad={false}>
        {!rows ? <Loading /> : (
          <table className="tbl">
            <thead><tr><th>Name</th><th>Status</th><th style={{ textAlign: 'right' }}>Actions</th></tr></thead>
            <tbody>
              {rows.length ? rows.map(r => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 500 }}>{r.name}
                    {r.code && <span className="mono" style={{ color: 'var(--muted)' }}> · {r.code}</span>}</td>
                  <td><Pill kind={r.is_active === 0 ? 'p-hold' : 'p-done'}>
                    {r.is_active === 0 ? 'Retired' : 'Active'}</Pill></td>
                  <td style={{ textAlign: 'right' }}>
                    <button className="btn" style={{ padding: '2px 8px' }}
                      onClick={() => remove(r.id)}>Delete</button>
                  </td>
                </tr>
              )) : <Empty cols={3}>Nothing in this master yet.</Empty>}
            </tbody>
          </table>
        )}
        <div style={{ display: 'flex', gap: 8, padding: 12, borderTop: '1px solid var(--line)' }}>
          <input placeholder="Add a new entry" value={name} onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && add()} />
          <button className="btn primary" onClick={add}>Add</button>
        </div>
      </Card>
    </>
  );
}
