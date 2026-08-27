import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { get, post, lakh, crore, shortDate } from '../lib/api.js';
import { Card, Pill, Loading, Empty, ErrorNote, Modal } from '../components/Bits.jsx';
import { useAuth } from '../lib/auth.jsx';
import { downloadXLSX, bankingName } from '../lib/xlsx.js';

export const mCls = (s) => ({ Active: 'p-progress', Executed: 'p-done', 'On Hold': 'p-hold', Terminated: 'p-red' }[s] || 'p-hold');
const CLOSED = ['Executed', 'Terminated'];

export const MND_HEADERS = ['No', 'Account', 'Source Opportunity', 'Type', 'Signed', 'End', 'Retainer (L)',
  'Success Fee %', 'Estimated Fee (L)', 'Realised (L)', 'Outstanding (L)', 'Transaction Value (cr)',
  'Milestones Done', 'Team', 'Status'];
export const mndRowX = (m) => [m.mandate_no, m.account, m.opportunity_no || '', m.deal_type,
  m.signed_on ? String(m.signed_on).slice(0, 10) : '', m.expected_end ? String(m.expected_end).slice(0, 10) : '',
  Number(m.retainer_l) || 0, Number(m.success_fee_pct) || 0, Number(m.estimated_fee_l) || 0,
  Number(m.realised_fee_l) || 0, Number(m.outstanding_l) || 0, Number(m.txn_value_cr) || 0,
  `${Number(m.milestones_done) || 0}/${Number(m.milestones) || 0}`, m.team || '', m.status];
const softGet = (p) => get(p).then(r => r || []).catch(() => []);
const num = (v) => Number(v || 0);
const sum = (arr, f) => arr.reduce((n, x) => n + num(f(x)), 0);
const iso = (n = 0) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

export const Kpi = ({ v, l, t = '' }) => (
  <div className={`kpi ${t}`.trim()}><div className="v" style={{ fontSize: 17 }}>{v}</div><div className="l">{l}</div></div>
);

export default function Mandates() {
  const { can } = useAuth();
  const nav = useNavigate();
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState('');
  const [f, setF] = useState({ q: '', status: '' });
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [refs, setRefs] = useState({ accounts: [], dealTypes: [], divisions: [], users: [] });

  const load = () => get('/mandates').then(setRows).catch(e => setErr(e.message));
  useEffect(() => {
    load();
    softGet('/accounts').then(a => setRefs(r => ({ ...r, accounts: a })));
    softGet('/masters/deal-types').then(a => setRefs(r => ({ ...r, dealTypes: a })));
    softGet('/masters/divisions').then(a => setRefs(r => ({ ...r, divisions: a })));
    softGet('/assignees').then(a => setRefs(r => ({ ...r, users: a })));
  }, []);

  const live = useMemo(() => (rows || []).filter(m => !CLOSED.includes(m.status)), [rows]);
  const filtered = useMemo(() => {
    const q = f.q.toLowerCase();
    return live.filter(m =>
      (!f.status || m.status === f.status) &&
      (!q || `${m.mandate_no} ${m.account} ${m.deal_type}`.toLowerCase().includes(q)));
  }, [live, f]);

  const openNew = () => setForm({
    account_id: '', deal_type_id: '', division_id: '', signed_on: iso(0), expected_end: iso(120),
    retainer_l: 5, success_fee_pct: 1.5, estimated_fee_l: 0, txn_value_cr: 0, status: 'Active', team: []
  });
  const setV = (k, v) => setForm(s => ({ ...s, [k]: v }));

  const save = async () => {
    if (!form.account_id) { setErr('Pick an account'); return; }
    if (!form.deal_type_id) { setErr('Pick a mandate type'); return; }
    setBusy(true);
    try {
      const res = await post('/mandates', {
        account_id: Number(form.account_id), deal_type_id: Number(form.deal_type_id),
        division_id: form.division_id ? Number(form.division_id) : undefined,
        signed_on: form.signed_on, expected_end: form.expected_end,
        retainer_l: Number(form.retainer_l) || 0, success_fee_pct: Number(form.success_fee_pct) || 0,
        estimated_fee_l: Number(form.estimated_fee_l) || 0, txn_value_cr: Number(form.txn_value_cr) || 0,
        status: form.status, team: form.team.map(Number)
      });
      setForm(null); setErr('');
      if (res?.id) nav(`/banking/mandates/${res.id}`); else load();
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  if (err && !rows) return <ErrorNote>{err}</ErrorNote>;
  if (!rows) return <Loading />;

  const all = rows;
  const kpis = [
    { v: live.length, l: 'Active' },
    { v: all.filter(m => CLOSED.includes(m.status)).length, l: 'Closed → projects', t: 'g' },
    { v: lakh(sum(all, m => m.estimated_fee_l)), l: 'Fee mandated', t: 'b' },
    { v: lakh(sum(all, m => m.realised_fee_l)), l: 'Fee realised', t: 'g' },
    { v: lakh(sum(all, m => m.estimated_fee_l) - sum(all, m => m.realised_fee_l)), l: 'Outstanding', t: 'a' },
    { v: crore(sum(all, m => m.txn_value_cr)), l: 'Transaction value', t: 'o' }
  ];

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, gap: 12, flexWrap: 'wrap' }}>
        <div><div className="eyebrow">Execution</div><h3>Mandates</h3></div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input placeholder="Search mandate, account, type…" value={f.q} style={{ width: 240 }}
            onChange={e => setF(s => ({ ...s, q: e.target.value }))} />
          <select value={f.status} onChange={e => setF(s => ({ ...s, status: e.target.value }))} style={{ width: 150 }}>
            <option value="">All statuses</option>
            {['Active', 'On Hold', 'Executed', 'Terminated'].map(s => <option key={s}>{s}</option>)}
          </select>
          <button className="btn" onClick={() => rows?.length && downloadXLSX(bankingName('-mandates.xlsx'), [{ name: 'Mandates', headers: MND_HEADERS, rows: rows.map(mndRowX) }])}>Excel</button>
          {can('mandates.create') && <button className="btn primary" onClick={openNew}>New mandate</button>}
        </div>
      </div>
      {err && <ErrorNote>{err}</ErrorNote>}

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', marginBottom: 14 }}>
        {kpis.map((k, i) => <Kpi key={i} {...k} />)}
      </div>

      <Card pad={false}>
        <table className="tbl">
          <thead><tr>
            <th>No.</th><th>Account</th><th>Type</th><th>Signed</th><th>Retainer</th><th>Success fee</th>
            <th>Est. fee</th><th>Realised</th><th>Progress</th><th>Status</th>
          </tr></thead>
          <tbody>
            {filtered.length ? filtered.map(m => {
              const pct = m.milestones ? Math.round(100 * m.milestones_done / m.milestones) : 0;
              return (
                <tr key={m.id} style={{ cursor: 'pointer' }} onClick={() => nav(`/banking/mandates/${m.id}`)}>
                  <td><span className="tid">{m.mandate_no}</span></td>
                  <td style={{ fontSize: 12.5 }}>{m.account}
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>{m.division || '—'}</div></td>
                  <td style={{ fontSize: 12.5 }}>{m.deal_type}</td>
                  <td className="mono" style={{ fontSize: 12 }}>{shortDate(m.signed_on)}</td>
                  <td className="mono" style={{ fontSize: 12 }}>{lakh(m.retainer_l)}</td>
                  <td className="mono" style={{ fontSize: 12 }}>{num(m.success_fee_pct)}%</td>
                  <td className="mono" style={{ fontSize: 12 }}>{lakh(m.estimated_fee_l)}</td>
                  <td className="mono" style={{ fontSize: 12, color: 'var(--green)', fontWeight: 600 }}>{lakh(m.realised_fee_l)}</td>
                  <td><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div className="prog"><i style={{ width: `${pct}%`, background: 'var(--teal)' }} /></div>
                    <span className="mono" style={{ fontSize: 11 }}>{pct}%</span></div></td>
                  <td><Pill kind={mCls(m.status)}>{m.status}</Pill></td>
                </tr>
              );
            }) : <Empty cols={10}>No live mandates. Converted opportunities arrive here; closed ones move to Closed projects.</Empty>}
          </tbody>
        </table>
        <div className="eyebrow" style={{ padding: '10px 15px' }}>{filtered.length} live mandate(s)</div>
      </Card>

      {form && (
        <Modal title="New mandate" saveLabel="Create mandate" busy={busy}
          onClose={() => setForm(null)} onSave={save}>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
            <div style={{ gridColumn: 'span 2' }}><label>Account</label>
              <select value={form.account_id} onChange={e => setV('account_id', e.target.value)}>
                <option value="">— pick —</option>
                {refs.accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
            <div><label>Mandate type</label>
              <select value={form.deal_type_id} onChange={e => setV('deal_type_id', e.target.value)}>
                <option value="">— pick —</option>
                {refs.dealTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
            <div><label>Signed on</label><input type="date" value={form.signed_on} onChange={e => setV('signed_on', e.target.value)} /></div>
            <div><label>Expected end</label><input type="date" value={form.expected_end} onChange={e => setV('expected_end', e.target.value)} /></div>
            <div><label>Division</label>
              <select value={form.division_id} onChange={e => setV('division_id', e.target.value)}>
                <option value="">None</option>
                {refs.divisions.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></div>
            <div><label>Retainer (₹L)</label><input type="number" value={form.retainer_l} onChange={e => setV('retainer_l', e.target.value)} /></div>
            <div><label>Success fee %</label><input type="number" value={form.success_fee_pct} onChange={e => setV('success_fee_pct', e.target.value)} /></div>
            <div><label>Estimated fee (₹L)</label><input type="number" value={form.estimated_fee_l} onChange={e => setV('estimated_fee_l', e.target.value)} /></div>
            <div><label>Transaction value (₹cr)</label><input type="number" value={form.txn_value_cr} onChange={e => setV('txn_value_cr', e.target.value)} /></div>
            <div><label>Status</label>
              <select value={form.status} onChange={e => setV('status', e.target.value)}>
                {['Active', 'On Hold', 'Executed', 'Terminated'].map(s => <option key={s}>{s}</option>)}</select></div>
            <div style={{ gridColumn: '1 / -1' }}><label>Deal team</label>
              <select multiple size={3} value={form.team.map(String)}
                onChange={e => setV('team', [...e.target.selectedOptions].map(o => Number(o.value)))}>
                {refs.users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
              <p style={{ fontSize: 11.5, color: 'var(--muted)', margin: '4px 0 0' }}>First person selected becomes the deal lead.</p>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
