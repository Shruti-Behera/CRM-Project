import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { get, lakh } from '../lib/api.js';
import { Card, Pill, Avatar, Loading, Empty, ErrorNote } from '../components/Bits.jsx';
import { useAuth } from '../lib/auth.jsx';
import AccountForm, { ACC_TYPES } from './AccountForm.jsx';
import { downloadXLSX, bankingName } from '../lib/xlsx.js';

const kycTone = (k) => k === 'Completed' ? 'p-done' : k === 'Pending' ? 'p-pending' : 'p-review';

const ACC_HEADERS = ['Code', 'Account', 'Sector', 'Type', 'Owner', 'City', 'Since', 'KYC', 'Contact', 'Designation', 'Email', 'Phone', 'Fees Earned (L)', 'Status'];
const accRowX = (a) => [a.account_code, a.name, a.sector, a.account_type, a.owner, a.city,
  a.client_since ? String(a.client_since).slice(0, 10) : '', a.kyc_status, a.contact, a.contact_designation,
  a.contact_email, `${a.phone_code || ''} ${a.phone_number || ''}`.trim(), Number(a.fees_to_date) || 0, a.status];

export default function Accounts() {
  const { can } = useAuth();
  const nav = useNavigate();
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState('');
  const [f, setF] = useState({ q: '', sector: '', type: '', owner: '' });
  const [form, setForm] = useState(null);   // { id } for edit, { _new:true } for create

  const load = () => get('/accounts').then(setRows).catch(e => setErr(e.message));
  useEffect(() => { load(); }, []);

  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const clear = () => setF({ q: '', sector: '', type: '', owner: '' });
  const sectorOptions = useMemo(() => [...new Set((rows || []).map(a => a.sector).filter(Boolean))].sort(), [rows]);
  const ownerOptions = useMemo(() => [...new Set((rows || []).map(a => a.owner).filter(Boolean))].sort(), [rows]);

  const filtered = useMemo(() => {
    if (!rows) return [];
    const q = f.q.toLowerCase();
    return rows.filter(a =>
      (!f.sector || a.sector === f.sector) &&
      (!f.type || a.account_type === f.type) &&
      (!f.owner || a.owner === f.owner) &&
      (!q || `${a.name} ${a.account_code} ${a.contact || ''} ${a.city || ''} ${a.group_name || ''} ${a.country || ''}`.toLowerCase().includes(q)));
  }, [rows, f]);

  const exportExcel = () => {
    if (!rows?.length) return;
    downloadXLSX(bankingName('-accounts.xlsx'), [{ name: 'Accounts', headers: ACC_HEADERS, rows: rows.map(accRowX) }]);
  };

  if (err && !rows) return <ErrorNote>{err}</ErrorNote>;
  if (!rows) return <Loading />;

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, gap: 12, flexWrap: 'wrap' }}>
        <div><div className="eyebrow">Client and counterparty master</div><h3>Accounts</h3></div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" onClick={exportExcel}>Excel</button>
          {can('accounts.create') && <button className="btn primary" onClick={() => setForm({ _new: true })}>New account</button>}
        </div>
      </div>
      {err && <ErrorNote>{err}</ErrorNote>}

      <Card>
        <div className="filters">
          <div><label>Search</label><input placeholder="Name, code, city…" value={f.q} onChange={e => set('q', e.target.value)} /></div>
          <div><label>Segment</label><select value={f.sector} onChange={e => set('sector', e.target.value)}><option value="">All</option>{sectorOptions.map(s => <option key={s}>{s}</option>)}</select></div>
          <div><label>Type</label><select value={f.type} onChange={e => set('type', e.target.value)}><option value="">All</option>{ACC_TYPES.map(t => <option key={t}>{t}</option>)}</select></div>
          <div><label>Owner</label><select value={f.owner} onChange={e => set('owner', e.target.value)}><option value="">All</option>{ownerOptions.map(o => <option key={o}>{o}</option>)}</select></div>
          <div><label>&nbsp;</label><button className="btn" style={{ width: '100%' }} onClick={clear}>Clear</button></div>
        </div>
      </Card>

      <div style={{ height: 14 }} />

      <Card pad={false}>
        <table className="tbl">
          <thead><tr>
            <th>Code</th><th>Account</th><th>Group</th><th>Segment</th><th>Location</th><th>Relationship owner</th>
            <th>KYC</th><th style={{ textAlign: 'right' }}>Live opps</th><th style={{ textAlign: 'right' }}>Mandates</th>
            <th style={{ textAlign: 'right' }}>Fees earned</th><th>Notes</th><th>Status</th>
          </tr></thead>
          <tbody>
            {filtered.length ? filtered.map(a => (
              <tr key={a.id} style={{ cursor: 'pointer' }} onClick={() => nav(`/banking/accounts/${a.id}`)}>
                <td><span className="tid">{a.account_code}</span></td>
                <td><div style={{ fontWeight: 500 }}>{a.name}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>{[a.contact, a.account_type].filter(Boolean).join(' · ')}</div></td>
                <td style={{ fontSize: 12.5 }}>{a.group_name || '—'}</td>
                <td style={{ fontSize: 12.5 }}>{a.sector || '—'}</td>
                <td style={{ fontSize: 12.5 }}>{a.city || '—'}<div style={{ fontSize: 11, color: 'var(--muted)' }}>{a.country || ''}</div></td>
                <td><Avatar name={a.owner} size={22} tone="t" /> <span style={{ fontSize: 12.5 }}>{a.owner}</span></td>
                <td><Pill kind={kycTone(a.kyc_status)}>{a.kyc_status}</Pill></td>
                <td className="mono" style={{ textAlign: 'right' }}>{a.live_opps}</td>
                <td className="mono" style={{ textAlign: 'right' }}>{a.mandates}</td>
                <td className="mono" style={{ textAlign: 'right', fontSize: 12 }}>{Number(a.fees_to_date) ? lakh(a.fees_to_date) : '—'}</td>
                <td style={{ fontSize: 12, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={a.remark || ''}>
                  {a.remark || <span style={{ color: 'var(--muted)' }}>—</span>}</td>
                <td><Pill kind={a.status === 'Active' ? 'p-done' : 'p-hold'}>{a.status}</Pill></td>
              </tr>
            )) : <Empty cols={12}>No accounts match. Clear a filter or create one.</Empty>}
          </tbody>
        </table>
        <div className="eyebrow" style={{ padding: '10px 15px' }}>{filtered.length} of {rows.length} accounts</div>
      </Card>

      {form && <AccountForm accountId={form.id || null} onClose={() => setForm(null)}
        onSaved={() => { setForm(null); setErr(''); load(); }} />}
    </>
  );
}
