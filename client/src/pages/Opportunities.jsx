import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { get, lakh, crore, shortDate } from '../lib/api.js';
import { Card, Pill, stageTone, Loading, Empty, ErrorNote } from '../components/Bits.jsx';
import { useAuth } from '../lib/auth.jsx';
import OpportunityForm, { OPP_STAGES } from './OpportunityForm.jsx';
import { downloadXLSX, bankingName } from '../lib/xlsx.js';

const OPEN_STAGES = ['Lead', 'Qualified', 'Pitched', 'Term Sheet', 'Mandated'];
const num = (v) => Number(v || 0);
const uniq = (arr) => [...new Set(arr.filter(Boolean))].sort();

const OPP_HEADERS = ['No', 'Account', 'Deal Type', 'Stage', 'Size (cr)', 'Fee (L)', 'Probability %', 'Weighted (L)',
  'Expected Close', 'Owner', 'Source', 'Next Action', 'Action Due', 'Created', 'Days in Pipeline'];
const oppRowX = (o) => [o.opportunity_no, o.account, o.deal_type, o.stage, num(o.txn_size_cr), num(o.expected_fee_l),
  num(o.probability_pct), num(o.weighted_fee_l), o.expected_close ? String(o.expected_close).slice(0, 10) : '',
  o.owner, o.source, o.next_action || '', o.next_action_due ? String(o.next_action_due).slice(0, 10) : '',
  o.created || '', num(o.age_days)];

export default function Opportunities() {
  const { can } = useAuth();
  const nav = useNavigate();
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState('');
  const [f, setF] = useState({ q: '', division: '', stage: '', type: '', owner: '', includeAll: false });
  const [creating, setCreating] = useState(false);

  const load = () => get('/opportunities').then(setRows).catch(e => setErr(e.message));
  useEffect(() => { load(); }, []);

  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const clear = () => setF({ q: '', division: '', stage: '', type: '', owner: '', includeAll: false });

  const divisions = useMemo(() => uniq((rows || []).map(o => o.division)), [rows]);
  const types = useMemo(() => uniq((rows || []).map(o => o.deal_type)), [rows]);
  const owners = useMemo(() => uniq((rows || []).flatMap(o => [o.owner, ...String(o.team || '').split(', ')])), [rows]);
  const convertedCount = useMemo(() => (rows || []).filter(o => num(o.is_converted) === 1).length, [rows]);

  const filtered = useMemo(() => {
    if (!rows) return [];
    const q = f.q.toLowerCase();
    return rows.filter(o => {
      const live = OPEN_STAGES.includes(o.stage) && num(o.is_converted) === 0;
      const teamNames = String(o.team || '').split(', ');
      return (f.includeAll || live) &&
        (!f.division || o.division === f.division) &&
        (!f.stage || o.stage === f.stage) &&
        (!f.type || o.deal_type === f.type) &&
        (!f.owner || o.owner === f.owner || teamNames.includes(f.owner)) &&
        (!q || `${o.opportunity_no} ${o.account} ${o.deal_type} ${o.next_action || ''}`.toLowerCase().includes(q));
    });
  }, [rows, f]);

  const weightedTotal = useMemo(
    () => filtered.filter(o => OPEN_STAGES.includes(o.stage)).reduce((n, o) => n + num(o.weighted_fee_l), 0),
    [filtered]);

  if (err && !rows) return <ErrorNote>{err}</ErrorNote>;

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, gap: 12, flexWrap: 'wrap' }}>
        <div><div className="eyebrow">Origination pipeline</div><h3>Opportunities</h3></div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link className="btn" to="/banking/board">Board view</Link>
          <button className="btn" onClick={() => rows?.length && downloadXLSX(bankingName('-opportunities.xlsx'), [{ name: 'Opportunities', headers: OPP_HEADERS, rows: rows.map(oppRowX) }])}>Excel</button>
          {can('opportunities.create') && <button className="btn primary" onClick={() => setCreating(true)}>New opportunity</button>}
        </div>
      </div>
      {err && <ErrorNote>{err}</ErrorNote>}

      <Card>
        <div className="filters">
          <div><label>Search</label><input placeholder="No., account, type, next action…" value={f.q} onChange={e => set('q', e.target.value)} /></div>
          <div><label>Division</label><select value={f.division} onChange={e => set('division', e.target.value)}><option value="">All</option>{divisions.map(d => <option key={d}>{d}</option>)}</select></div>
          <div><label>Stage</label><select value={f.stage} onChange={e => set('stage', e.target.value)}><option value="">All</option>{OPP_STAGES.map(s => <option key={s}>{s}</option>)}</select></div>
          <div><label>Deal type</label><select value={f.type} onChange={e => set('type', e.target.value)}><option value="">All</option>{types.map(t => <option key={t}>{t}</option>)}</select></div>
          <div><label>Assigned to</label><select value={f.owner} onChange={e => set('owner', e.target.value)}><option value="">All</option>{owners.map(o => <option key={o}>{o}</option>)}</select></div>
          <div><label>&nbsp;</label><button className="btn" style={{ width: '100%' }} onClick={clear}>Clear</button></div>
        </div>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap', marginTop: 10 }}>
          <label className="remember" style={{ margin: 0 }}>
            <input type="checkbox" checked={f.includeAll} onChange={e => set('includeAll', e.target.checked)} />
            Include converted, won and lost</label>
          <span className="eyebrow">{convertedCount} converted to mandates</span>
        </div>
      </Card>

      <div style={{ height: 14 }} />

      <Card pad={false}>
        {!rows ? <Loading /> : (
          <>
            <table className="tbl">
              <thead><tr>
                <th>No.</th><th>Account</th><th>Deal type</th><th>Stage</th><th style={{ textAlign: 'right' }}>Size</th>
                <th style={{ textAlign: 'right' }}>Fee</th><th>Prob.</th><th style={{ textAlign: 'right' }}>Weighted</th>
                <th>Close</th><th>Assigned to</th><th>Next action</th>
              </tr></thead>
              <tbody>
                {filtered.length ? filtered.map(o => (
                  <tr key={o.id}>
                    <td><Link to={`/banking/opportunities/${o.id}`} className="mono" style={{ fontSize: 11.5, fontWeight: 600 }}>{o.opportunity_no}</Link>
                      {o.attachments > 0 && <span title={`${o.attachments} attachment(s)`}> 📎{o.attachments}</span>}</td>
                    <td style={{ fontSize: 12.5 }}>{o.account}
                      <div style={{ fontSize: 11, color: 'var(--muted)' }}>{o.division || '—'}</div></td>
                    <td style={{ fontSize: 12.5 }}>{o.deal_type}</td>
                    <td><Pill kind={stageTone(o.stage)}>{o.stage}</Pill></td>
                    <td className="mono" style={{ fontSize: 12, textAlign: 'right' }}>{num(o.txn_size_cr) ? crore(o.txn_size_cr) : '—'}</td>
                    <td className="mono" style={{ fontSize: 12, textAlign: 'right' }}>{lakh(o.expected_fee_l)}</td>
                    <td><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div className="prog" style={{ minWidth: 44 }}><i style={{ width: `${num(o.probability_pct)}%`, background: 'var(--teal)' }} /></div>
                      <span className="mono" style={{ fontSize: 11 }}>{num(o.probability_pct)}%</span></div></td>
                    <td className="mono" style={{ fontSize: 12, textAlign: 'right' }}>{lakh(o.weighted_fee_l)}</td>
                    <td className="mono" style={{ fontSize: 12 }}>{shortDate(o.expected_close)}</td>
                    <td style={{ fontSize: 12.5 }}>{o.owner}{o.team && <div style={{ fontSize: 11, color: 'var(--muted)' }}>+ {o.team}</div>}</td>
                    <td style={{ fontSize: 12, maxWidth: 200 }}>
                      {num(o.is_converted) === 1
                        ? <span><Pill kind="p-done">Mandate</Pill> {o.mandate_no && <span className="mono" style={{ fontSize: 11 }}>{o.mandate_no}</span>}</span>
                        : (o.next_action || <span style={{ color: 'var(--muted)' }}>—</span>)}</td>
                  </tr>
                )) : <Empty cols={11}>No opportunities match. Clear a filter or add one.</Empty>}
              </tbody>
            </table>
            <div className="eyebrow" style={{ padding: '10px 15px' }}>
              {filtered.length} of {rows.length} · weighted fee {lakh(Math.round(weightedTotal))}</div>
          </>
        )}
      </Card>

      {creating && <OpportunityForm onClose={() => setCreating(false)}
        onCreated={(id) => { setCreating(false); if (id) nav(`/banking/opportunities/${id}`); else load(); }} />}
    </>
  );
}
