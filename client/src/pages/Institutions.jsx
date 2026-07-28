import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { get, inr } from '../lib/api.js';
import { Card, Pill, Loading, Empty, ErrorNote } from '../components/Bits.jsx';
import { useAuth } from '../lib/auth.jsx';

export default function Institutions() {
  const { can } = useAuth();
  const [rows, setRows] = useState(null);
  const [q, setQ] = useState('');
  const [err, setErr] = useState('');

  const load = () => get(`/institutions?${new URLSearchParams(q ? { q } : {})}`)
    .then(setRows).catch(e => setErr(e.message));
  // Wrap in a block so the effect returns undefined, not load()'s Promise.
  // React treats an effect's return value as its cleanup, and a Promise there
  // throws "destroy is not a function" on unmount (StrictMode unmounts in dev).
  useEffect(() => { load(); }, []);

  if (err) return <ErrorNote>{err}</ErrorNote>;

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
        <div><div className="eyebrow">Coverage list</div><h3>Institutional clients</h3></div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input placeholder="Name, code or scheme…" value={q} style={{ width: 240 }}
            onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && load()} />
          {can('institutional.create') &&
            <Link className="btn primary" to="/institutional/clients/new">New client</Link>}
        </div>
      </div>

      <Card pad={false}>
        {!rows ? <Loading /> : (
          <table className="tbl">
            <thead><tr>
              <th>Ref</th><th>Client</th><th>Client code</th><th>Schemes</th><th>Type</th>
              <th>Tier</th><th>Empanelment</th><th>RM</th><th>Last met</th><th>Brokerage</th>
            </tr></thead>
            <tbody>
              {rows.length ? rows.map(c => (
                <tr key={c.id}>
                  <td className="mono" style={{ fontSize: 11.5 }}>{c.institution_ref}</td>
                  <td><Link to={`/institutional/clients/${c.id}/edit`}>{c.name}</Link>
                      <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                        {c.contact_name}{c.city ? ` · ${c.city}` : ''}</div></td>
                  <td className="mono" style={{ fontSize: 12 }}>{c.house_code || '—'}</td>
                  <td>{c.schemes ? <Pill kind="p-progress">{c.schemes}</Pill> : '—'}</td>
                  <td>{c.inst_type}</td>
                  <td><Pill kind={c.tier === 'A' ? 'p-done' : c.tier === 'B' ? 'p-progress' : 'p-hold'}>
                      {c.tier}</Pill></td>
                  <td><Pill kind={c.empanelment === 'Empanelled' ? 'p-done' : 'p-pending'}>
                      {c.empanelment}</Pill></td>
                  <td>{c.rm}</td>
                  <td>{c.days_since_met == null ? <Pill kind="p-red">never</Pill>
                       : <Pill kind={c.days_since_met > 30 ? 'p-red' : c.days_since_met > 14 ? 'p-pending' : 'p-done'}>
                           {c.days_since_met}d</Pill>}</td>
                  <td className="mono" style={{ fontSize: 12 }}>{inr(c.brokerage_total)}</td>
                </tr>
              )) : <Empty cols={10}>No clients yet.</Empty>}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}
