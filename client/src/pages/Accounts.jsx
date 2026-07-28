import { useEffect, useMemo, useState } from 'react';
import { get, post, put, del, lakh } from '../lib/api.js';
import { Card, Pill, Avatar, Loading, Empty, ErrorNote, Modal } from '../components/Bits.jsx';
import { useAuth } from '../lib/auth.jsx';

const ACC_TYPES = ['Corporate', 'Promoter / Family Office', 'PE / VC Fund', 'FII / DII', 'HNI', 'Bank / NBFC'];
const KYC = ['Pending', 'Under Review', 'Completed'];
const STATUSES = ['Active', 'Dormant', 'Blacklisted'];
const softGet = (p) => get(p).then(r => r || []).catch(() => []);
const kycTone = (k) => k === 'Completed' ? 'p-done' : k === 'Pending' ? 'p-pending' : 'p-review';

export default function Accounts() {
  const { user, can } = useAuth();
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState('');
  const [f, setF] = useState({ q: '', sector: '', type: '', owner: '' });
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [refs, setRefs] = useState({ users: [], divisions: [], groups: [], sectors: [], countries: [] });

  const load = () => get('/accounts').then(setRows).catch(e => setErr(e.message));
  useEffect(() => {
    load();
    Promise.all([softGet('/users'), softGet('/masters/divisions'), softGet('/masters/groups'), softGet('/masters/sectors'), softGet('/masters/countries')])
      .then(([users, divisions, groups, sectors, countries]) => setRefs({ users, divisions, groups, sectors, countries }));
  }, []);

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
      (!q || `${a.name} ${a.account_code} ${a.city || ''} ${a.group_name || ''} ${a.country || ''}`.toLowerCase().includes(q)));
  }, [rows, f]);

  const openAdd = () => setForm({
    _new: true, name: '', account_type: 'Corporate', owner_id: user?.id || '', division_id: '',
    group_id: '', sector_id: '', country_id: '', city: '', client_since: '', kyc_status: 'Pending', remark: '', status: 'Active'
  });
  const openEdit = (a) => setForm({
    _new: false, id: a.id, name: a.name, account_type: a.account_type, owner_id: a.owner_id || '',
    division_id: a.division_id || '', group_id: a.group_id || '', sector_id: a.sector_id || '',
    country_id: a.country_id || '', city: a.city || '', client_since: a.client_since ? String(a.client_since).slice(0, 10) : '',
    kyc_status: a.kyc_status, remark: a.remark || '', status: a.status
  });
  const setFo = (k, v) => setForm(x => ({ ...x, [k]: v }));

  const save = async () => {
    if (!form.name.trim()) { setErr('An account name is needed'); return; }
    setBusy(true);
    try {
      const body = {
        name: form.name, account_type: form.account_type, owner_id: Number(form.owner_id) || undefined,
        division_id: form.division_id ? Number(form.division_id) : undefined,
        group_id: form.group_id ? Number(form.group_id) : undefined,
        sector_id: form.sector_id ? Number(form.sector_id) : undefined,
        country_id: form.country_id ? Number(form.country_id) : undefined,
        city: form.city || undefined, client_since: form.client_since || undefined,
        kyc_status: form.kyc_status, remark: form.remark || undefined, status: form.status
      };
      if (form._new) await post('/accounts', body);
      else await put(`/accounts/${form.id}`, body);
      setForm(null); setErr(''); load();
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };
  const remove = async (a) => {
    if (!window.confirm(`Delete ${a.name}?`)) return;
    try { await del(`/accounts/${a.id}`); load(); } catch (e) { setErr(e.message); }
  };

  if (err && !rows) return <ErrorNote>{err}</ErrorNote>;
  if (!rows) return <Loading />;

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div><div className="eyebrow">Client and counterparty master</div><h3>Accounts</h3></div>
        {can('accounts.create') && <button className="btn primary" onClick={openAdd}>New account</button>}
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
            <th style={{ textAlign: 'right' }}>Fees earned</th><th>Status</th><th style={{ textAlign: 'right' }}>Actions</th>
          </tr></thead>
          <tbody>
            {filtered.length ? filtered.map(a => (
              <tr key={a.id}>
                <td className="mono" style={{ fontSize: 11.5, fontWeight: 600 }}>{a.account_code}</td>
                <td><div style={{ fontWeight: 500 }}>{a.name}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>{a.account_type}</div></td>
                <td style={{ fontSize: 12.5 }}>{a.group_name || '—'}</td>
                <td style={{ fontSize: 12.5 }}>{a.sector || '—'}</td>
                <td style={{ fontSize: 12.5 }}>{a.city || '—'}<div style={{ fontSize: 11, color: 'var(--muted)' }}>{a.country || ''}</div></td>
                <td><Avatar name={a.owner} size={22} /> <span style={{ fontSize: 12.5 }}>{a.owner}</span></td>
                <td><Pill kind={kycTone(a.kyc_status)}>{a.kyc_status}</Pill></td>
                <td className="mono" style={{ textAlign: 'right' }}>{a.live_opps}</td>
                <td className="mono" style={{ textAlign: 'right' }}>{a.mandates}</td>
                <td className="mono" style={{ textAlign: 'right', fontSize: 12 }}>{Number(a.fees_to_date) ? lakh(a.fees_to_date) : '—'}</td>
                <td><Pill kind={a.status === 'Active' ? 'p-done' : 'p-hold'}>{a.status}</Pill></td>
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  {can('accounts.edit') && <button className="btn" style={{ padding: '2px 8px' }} onClick={() => openEdit(a)}>Edit</button>}{' '}
                  {can('accounts.delete') && <button className="btn" style={{ padding: '2px 8px', color: 'var(--red)' }} onClick={() => remove(a)}>Delete</button>}
                </td>
              </tr>
            )) : <Empty cols={12}>No accounts match. Clear a filter or create one.</Empty>}
          </tbody>
        </table>
        <div className="eyebrow" style={{ padding: '10px 15px' }}>{filtered.length} of {rows.length} accounts</div>
      </Card>

      {form && (
        <Modal title={form._new ? 'New account' : `Edit ${form.name}`} saveLabel={form._new ? 'Create' : 'Save'}
          busy={busy} onClose={() => setForm(null)} onSave={save}>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
            <div style={{ gridColumn: 'span 2' }}><label>Account name</label><input value={form.name} onChange={e => setFo('name', e.target.value)} /></div>
            <div><label>Type</label><select value={form.account_type} onChange={e => setFo('account_type', e.target.value)}>{ACC_TYPES.map(t => <option key={t}>{t}</option>)}</select></div>
            <div><label>Relationship owner</label><select value={form.owner_id} onChange={e => setFo('owner_id', e.target.value)}><option value="">— pick —</option>{refs.users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select></div>
            <div><label>Division</label><select value={form.division_id} onChange={e => setFo('division_id', e.target.value)}><option value="">None</option>{refs.divisions.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></div>
            <div><label>Group</label><select value={form.group_id} onChange={e => setFo('group_id', e.target.value)}><option value="">None</option>{refs.groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}</select></div>
            <div><label>Segment</label><select value={form.sector_id} onChange={e => setFo('sector_id', e.target.value)}><option value="">None</option>{refs.sectors.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
            <div><label>Country</label><select value={form.country_id} onChange={e => setFo('country_id', e.target.value)}><option value="">None</option>{refs.countries.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
            <div><label>City</label><input value={form.city} onChange={e => setFo('city', e.target.value)} /></div>
            <div><label>Client since</label><input type="date" value={form.client_since} onChange={e => setFo('client_since', e.target.value)} /></div>
            <div><label>KYC</label><select value={form.kyc_status} onChange={e => setFo('kyc_status', e.target.value)}>{KYC.map(k => <option key={k}>{k}</option>)}</select></div>
            <div><label>Status</label><select value={form.status} onChange={e => setFo('status', e.target.value)}>{STATUSES.map(s => <option key={s}>{s}</option>)}</select></div>
            <div style={{ gridColumn: '1 / -1' }}><label>Remark</label><textarea rows={2} value={form.remark} onChange={e => setFo('remark', e.target.value)} /></div>
          </div>
        </Modal>
      )}
    </>
  );
}
