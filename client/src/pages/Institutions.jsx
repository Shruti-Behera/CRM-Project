import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { get, inr } from '../lib/api.js';
import { Card, Pill, Loading, Empty, ErrorNote } from '../components/Bits.jsx';
import { useAuth } from '../lib/auth.jsx';

const TIERS = ['A', 'B', 'C'];

export default function Institutions() {
  const { can } = useAuth();
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState('');
  const [f, setF] = useState({ q: '', type: '', tier: '', rm: '' });

  // Fetch the full coverage list once; filter in the browser so every filter
  // (including RM, which the API doesn't parameterise) works instantly.
  const load = () => get('/institutions').then(setRows).catch(e => setErr(e.message));
  useEffect(() => { load(); }, []);

  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const clear = () => setF({ q: '', type: '', tier: '', rm: '' });

  const typeOptions = useMemo(() => [...new Set((rows || []).map(c => c.inst_type).filter(Boolean))].sort(), [rows]);
  const rmOptions = useMemo(() => [...new Set((rows || []).map(c => c.rm).filter(Boolean))].sort(), [rows]);

  const filtered = useMemo(() => {
    if (!rows) return [];
    const s = f.q.toLowerCase();
    return rows.filter(c =>
      (!f.type || c.inst_type === f.type) &&
      (!f.tier || c.tier === f.tier) &&
      (!f.rm || c.rm === f.rm) &&
      (!s || `${c.name} ${c.house_code || ''} ${c.contact_name || ''} ${c.city || ''}`.toLowerCase().includes(s)));
  }, [rows, f]);

  if (err) return <ErrorNote>{err}</ErrorNote>;

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div><div className="eyebrow">Coverage list</div><h3>Institutional clients</h3></div>
        {can('institutional.create') &&
          <Link className="btn primary" to="/institutional/clients/new">New client</Link>}
      </div>

      <Card>
        <div className="filters">
          <div><label>Search</label>
            <input placeholder="Name, code or scheme…" value={f.q} onChange={e => set('q', e.target.value)} /></div>
          <div><label>Type</label>
            <select value={f.type} onChange={e => set('type', e.target.value)}>
              <option value="">All</option>{typeOptions.map(t => <option key={t}>{t}</option>)}</select></div>
          <div><label>Tier</label>
            <select value={f.tier} onChange={e => set('tier', e.target.value)}>
              <option value="">All</option>{TIERS.map(t => <option key={t}>{t}</option>)}</select></div>
          <div><label>Relationship manager</label>
            <select value={f.rm} onChange={e => set('rm', e.target.value)}>
              <option value="">All</option>{rmOptions.map(r => <option key={r}>{r}</option>)}</select></div>
          <div><label>&nbsp;</label><button className="btn" style={{ width: '100%' }} onClick={clear}>Clear</button></div>
        </div>
      </Card>

      <div style={{ height: 14 }} />

      <Card pad={false}>
        {!rows ? <Loading /> : (
          <>
            <table className="tbl">
              <thead><tr>
                <th>Ref</th><th>Client</th><th>Client code</th><th>Schemes</th><th>Type</th>
                <th>Tier</th><th>Empanelment</th><th>RM</th><th>Last met</th><th>Brokerage</th>
              </tr></thead>
              <tbody>
                {filtered.length ? filtered.map(c => (
                  <tr key={c.id}>
                    <td className="mono" style={{ fontSize: 11.5 }}>{c.institution_ref}</td>
                    <td><Link to={`/institutional/clients/${c.id}/edit`}>{c.name}</Link>
                        <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                          {c.contact_name}{c.city ? ` · ${c.city}` : ''}</div></td>
                    <td className="mono" style={{ fontSize: 12 }}>{c.house_code || '—'}</td>
                    <td>{c.schemes ? <Pill kind="p-progress">{c.schemes}</Pill> : '—'}</td>
                    <td>{c.inst_type}</td>
                    <td><Pill kind={c.tier === 'A' ? 'p-done' : c.tier === 'B' ? 'p-progress' : 'p-hold'}>{c.tier}</Pill></td>
                    <td><Pill kind={c.empanelment === 'Empanelled' ? 'p-done' : 'p-pending'}>{c.empanelment}</Pill></td>
                    <td>{c.rm}</td>
                    <td>{c.days_since_met == null ? <Pill kind="p-red">never</Pill>
                         : <Pill kind={c.days_since_met > 30 ? 'p-red' : c.days_since_met > 14 ? 'p-pending' : 'p-done'}>
                             {c.days_since_met}d</Pill>}</td>
                    <td className="mono" style={{ fontSize: 12 }}>{inr(c.brokerage_total)}</td>
                  </tr>
                )) : <Empty cols={10}>No clients match.</Empty>}
              </tbody>
            </table>
            <div className="eyebrow" style={{ padding: '10px 15px' }}>{filtered.length} of {rows.length} clients</div>
          </>
        )}
      </Card>
    </>
  );
}
