import { useEffect, useMemo, useState } from 'react';
import { get, post, put } from '../lib/api.js';
import { Modal, ErrorNote, Loading } from '../components/Bits.jsx';
import { useAuth } from '../lib/auth.jsx';

export const ACC_TYPES = ['Corporate', 'Promoter / Family Office', 'PE / VC Fund', 'FII / DII', 'HNI', 'Bank / NBFC'];
export const KYC = ['Pending', 'Under Review', 'Completed'];
export const STATUSES = ['Active', 'Dormant', 'Blacklisted'];
const softGet = (p) => get(p).then(r => r || []).catch(() => []);

const SectionHead = ({ children }) => (
  <div style={{ gridColumn: '1 / -1' }}><div className="eyebrow" style={{ marginTop: 4 }}>{children}</div></div>
);

// Create/Edit account modal, shared by the list and the detail page. On edit it
// fetches the full account (incl. contact + preferences) and prefills every field.
export default function AccountForm({ accountId = null, onClose, onSaved }) {
  const { user } = useAuth();
  const [refs, setRefs] = useState({ users: [], divisions: [], groups: [], sectors: [], countries: [], preferences: [], cities: [] });
  const [form, setForm] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const blank = () => ({
    _new: true, name: '', account_type: 'Corporate', owner_id: user?.id || '', division_id: '',
    group_id: '', sector_id: '', country_id: '', city: '', client_since: '', kyc_status: 'Pending',
    status: 'Active', remark: '', fees_to_date: 0,
    phone_code: '', phone_number: '', mobile_code: '', mobile_number: '',
    contact_name: '', contact_designation: '', contact_email: '', preference_ids: [],
    _phoneTouched: false, _mobileTouched: false
  });

  useEffect(() => {
    Promise.all([
      softGet('/users'), softGet('/masters/divisions'), softGet('/masters/groups'),
      softGet('/masters/sectors'), softGet('/masters/countries'), softGet('/masters/preferences'),
      softGet('/lookups/cities')
    ]).then(([users, divisions, groups, sectors, countries, preferences, cities]) =>
      setRefs({ users, divisions, groups, sectors, countries, preferences, cities }));
  }, []);

  useEffect(() => {
    if (!accountId) { setForm(blank()); return; }
    get(`/accounts/${accountId}`).then(d => setForm({
      _new: false, id: accountId, name: d.name || '', account_type: d.account_type || 'Corporate',
      owner_id: d.owner_id || '', division_id: d.division_id || '', group_id: d.group_id || '',
      sector_id: d.sector_id || '', country_id: d.country_id || '', city: d.city || '',
      client_since: d.client_since ? String(d.client_since).slice(0, 10) : '',
      kyc_status: d.kyc_status || 'Pending', status: d.status || 'Active', remark: d.remark || '',
      fees_to_date: Number(d.fees_to_date) || 0,
      phone_code: d.phone_code || '', phone_number: d.phone_number || '',
      mobile_code: d.mobile_code || '', mobile_number: d.mobile_number || '',
      contact_name: d.contact?.name || '', contact_designation: d.contact?.designation || '',
      contact_email: d.contact?.email || '',
      preference_ids: (d.preference_ids || []).map(Number),
      _phoneTouched: false, _mobileTouched: false
    })).catch(e => setErr(e.message));
  }, [accountId]);

  const dials = useMemo(() => [...new Set((refs.countries || []).map(c => c.dial_code).filter(Boolean))].sort(), [refs.countries]);
  const dialFor = (cid) => (refs.countries.find(c => c.id === Number(cid)) || {}).dial_code || '';
  const activePrefs = useMemo(() => (refs.preferences || []).filter(p => Number(p.is_active) === 1), [refs.preferences]);
  const cityOptions = useMemo(() => {
    if (!form) return [];
    const list = (refs.cities || []).filter(c => c.country_id === Number(form.country_id)).map(c => c.name);
    if (form.city && !list.includes(form.city)) return [form.city, ...list];
    return list;
  }, [form, refs.cities]);

  const setFo = (k, v) => setForm(x => ({ ...x, [k]: v }));
  const onCountry = (cid) => setForm(x => {
    const dc = dialFor(cid);
    return { ...x, country_id: cid, city: '',
      phone_code: x._phoneTouched ? x.phone_code : (dc || x.phone_code),
      mobile_code: x._mobileTouched ? x.mobile_code : (dc || x.mobile_code) };
  });
  const togglePref = (pid) => setForm(x => ({
    ...x, preference_ids: x.preference_ids.includes(pid) ? x.preference_ids.filter(p => p !== pid) : [...x.preference_ids, pid]
  }));

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
        kyc_status: form.kyc_status, status: form.status, remark: form.remark || undefined,
        fees_to_date: Number(form.fees_to_date) || 0,
        phone_code: form.phone_code || undefined, phone_number: form.phone_number || undefined,
        mobile_code: form.mobile_code || undefined, mobile_number: form.mobile_number || undefined,
        contact_name: form.contact_name || undefined, contact_designation: form.contact_designation || undefined,
        contact_email: form.contact_email || undefined, preference_ids: form.preference_ids
      };
      const res = form._new ? await post('/accounts', body) : await put(`/accounts/${form.id}`, body);
      onSaved?.(form._new ? res?.id : form.id);
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  if (!form) return (
    <Modal title="Account" saveLabel="Save" onClose={onClose} onSave={() => {}} busy>
      {err ? <ErrorNote>{err}</ErrorNote> : <Loading />}
    </Modal>
  );

  return (
    <Modal title={form._new ? 'New account' : `Edit ${form.name}`} saveLabel={form._new ? 'Create account' : 'Save changes'}
      busy={busy} onClose={onClose} onSave={save}>
      {err && <ErrorNote>{err}</ErrorNote>}
      <div className="grid" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
        <div style={{ gridColumn: 'span 2' }}><label>Account name</label>
          <input value={form.name} onChange={e => setFo('name', e.target.value)} /></div>
        <div><label>Status</label>
          <select value={form.status} onChange={e => setFo('status', e.target.value)}>{STATUSES.map(s => <option key={s}>{s}</option>)}</select></div>

        <div><label>Division</label>
          <select value={form.division_id} onChange={e => setFo('division_id', e.target.value)}>
            <option value="">None</option>{refs.divisions.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></div>
        <div><label>Group</label>
          <select value={form.group_id} onChange={e => setFo('group_id', e.target.value)}>
            <option value="">None</option>{refs.groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}</select></div>
        <div><label>Segment</label>
          <select value={form.sector_id} onChange={e => setFo('sector_id', e.target.value)}>
            <option value="">None</option>{refs.sectors.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>

        <div><label>Type</label>
          <select value={form.account_type} onChange={e => setFo('account_type', e.target.value)}>{ACC_TYPES.map(t => <option key={t}>{t}</option>)}</select></div>
        <div><label>Country</label>
          <select value={form.country_id} onChange={e => onCountry(e.target.value)}>
            <option value="">None</option>{refs.countries.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
        <div><label>City</label>
          <select value={form.city} onChange={e => setFo('city', e.target.value)}>
            <option value="">{cityOptions.length ? '— pick —' : '— add cities under Masters → Locations —'}</option>
            {cityOptions.map(c => <option key={c}>{c}</option>)}</select></div>

        <div><label>Relationship owner</label>
          <select value={form.owner_id} onChange={e => setFo('owner_id', e.target.value)}>
            <option value="">— pick —</option>{refs.users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select></div>
        <div><label>Client since</label><input type="date" value={form.client_since} onChange={e => setFo('client_since', e.target.value)} /></div>
        <div><label>KYC status</label>
          <select value={form.kyc_status} onChange={e => setFo('kyc_status', e.target.value)}>{KYC.map(k => <option key={k}>{k}</option>)}</select></div>

        <div><label>Fees earned to date (₹L)</label><input type="number" value={form.fees_to_date} onChange={e => setFo('fees_to_date', e.target.value)} /></div>

        <SectionHead>Primary contact</SectionHead>
        <div><label>Contact name</label><input value={form.contact_name} onChange={e => setFo('contact_name', e.target.value)} /></div>
        <div><label>Designation</label><input value={form.contact_designation} onChange={e => setFo('contact_designation', e.target.value)} /></div>
        <div><label>Email</label><input type="email" value={form.contact_email} onChange={e => setFo('contact_email', e.target.value)} /></div>

        <div style={{ gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div><label>Phone</label>
            <div style={{ display: 'flex', gap: 6 }}>
              <select style={{ width: 110, flex: '0 0 110px' }} value={form.phone_code}
                onChange={e => setForm(x => ({ ...x, phone_code: e.target.value, _phoneTouched: true }))}>
                <option value="">Code</option>{dials.map(d => <option key={d}>{d}</option>)}</select>
              <input style={{ flex: 1, minWidth: 0 }} placeholder="Landline" value={form.phone_number} onChange={e => setFo('phone_number', e.target.value)} />
            </div></div>
          <div><label>Mobile</label>
            <div style={{ display: 'flex', gap: 6 }}>
              <select style={{ width: 110, flex: '0 0 110px' }} value={form.mobile_code}
                onChange={e => setForm(x => ({ ...x, mobile_code: e.target.value, _mobileTouched: true }))}>
                <option value="">Code</option>{dials.map(d => <option key={d}>{d}</option>)}</select>
              <input style={{ flex: 1, minWidth: 0 }} placeholder="Mobile" value={form.mobile_number} onChange={e => setFo('mobile_number', e.target.value)} />
            </div></div>
        </div>

        <div style={{ gridColumn: '1 / -1' }}><label>Preferences</label>
          {activePrefs.length ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, border: '1px solid var(--line)', borderRadius: 6, padding: 10 }}>
              {activePrefs.map(p => {
                const on = form.preference_ids.includes(p.id);
                return (
                  <label key={p.id} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6, margin: 0, cursor: 'pointer', fontSize: 12.5,
                    fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: on ? 'var(--navy)' : 'var(--ink)',
                    background: on ? 'var(--tint)' : '#fff', border: '1px solid', borderColor: on ? 'var(--navy)' : 'var(--line)',
                    borderRadius: 20, padding: '3px 11px'
                  }}>
                    <input type="checkbox" checked={on} onChange={() => togglePref(p.id)} style={{ width: 'auto', margin: 0 }} />
                    {p.name}
                  </label>
                );
              })}
            </div>
          ) : <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0 }}>No preferences defined. Add them under Masters → Preferences.</p>}
        </div>

        <div style={{ gridColumn: '1 / -1' }}><label>Notes</label>
          <textarea rows={3} value={form.remark} onChange={e => setFo('remark', e.target.value)} /></div>
      </div>
    </Modal>
  );
}
