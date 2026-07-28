import { useEffect, useMemo, useState } from 'react';
import { get, post, put, del } from '../lib/api.js';
import { Card, Pill, Avatar, Loading, Empty, ErrorNote, Modal } from '../components/Bits.jsx';
import { useAuth } from '../lib/auth.jsx';

const LEVELS = {
  1: ['Super Admin', 'every record, plus user administration'],
  2: ['Head / Director', 'every record, no user administration'],
  3: ['Manager', 'own department or division, plus their reporting line'],
  4: ['Executive', 'only what they own, support or watch']
};
const levelTone = (l) => l === 1 ? 'p-red' : l === 2 ? 'p-review' : l === 3 ? 'p-progress' : 'p-hold';
const softGet = (p) => get(p).then(r => r || []).catch(() => []);
const isOn = (perm) => perm.override != null ? Number(perm.override) === 1 : !!perm.from_role;

export default function Users() {
  const { user } = useAuth();
  const admin = user?.level === 1;

  const [rows, setRows] = useState(null);
  const [roles, setRoles] = useState([]);
  const [depts, setDepts] = useState([]);
  const [divisions, setDivisions] = useState([]);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');

  const [form, setForm] = useState(null);      // user add/edit modal
  const [rights, setRights] = useState(null);  // { userId, name, level, perms }
  const [busy, setBusy] = useState(false);

  const load = () => get('/users').then(setRows).catch(e => setErr(e.message));
  useEffect(() => {
    load();
    softGet('/roles').then(setRoles);
    softGet('/masters/departments').then(setDepts);
    softGet('/masters/divisions').then(setDivisions);
  }, []);

  const filtered = useMemo(() => {
    if (!rows) return [];
    const s = q.toLowerCase();
    return rows.filter(u => !s || `${u.name} ${u.email} ${u.employee_code} ${u.department || ''}`.toLowerCase().includes(s));
  }, [rows, q]);

  /* ---- user add / edit ---- */
  const openAdd = () => setForm({
    _new: true, employee_code: '', name: '', email: '', mobile: '', department_id: '',
    division_id: '', designation: '', manager_id: '', role_id: roles.find(r => r.level === 4)?.id || '',
    weekly_capacity_hours: 40, status: 'Active', password: ''
  });
  const openEdit = (u) => setForm({
    _new: false, id: u.id, employee_code: u.employee_code, name: u.name, email: u.email,
    mobile: u.mobile || '', department_id: u.department_id || '', division_id: u.division_id || '',
    designation: u.designation || '', manager_id: u.manager_id || '', role_id: u.role_id,
    weekly_capacity_hours: u.weekly_capacity_hours || 40, status: u.status, password: ''
  });
  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const saveUser = async () => {
    if (!form.name.trim() || !form.email.trim()) { setErr('Name and email are both needed'); return; }
    if (form._new && form.password.length < 8) { setErr('A password of at least 8 characters is needed'); return; }
    setBusy(true);
    try {
      const payload = {
        employee_code: form.employee_code, name: form.name, email: form.email,
        mobile: form.mobile || undefined,
        department_id: form.department_id ? Number(form.department_id) : undefined,
        division_id: form.division_id ? Number(form.division_id) : undefined,
        designation: form.designation || undefined,
        manager_id: form.manager_id ? Number(form.manager_id) : undefined,
        role_id: Number(form.role_id),
        weekly_capacity_hours: Number(form.weekly_capacity_hours) || 40,
        status: form.status
      };
      if (form.password) payload.password = form.password;
      if (form._new) await post('/users', payload);
      else await put(`/users/${form.id}`, payload);
      setForm(null); setErr(''); load();
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  const removeUser = async (u) => {
    if (!window.confirm(`Delete ${u.name}? History stays; the record goes. Consider Inactive instead.`)) return;
    try { await del(`/users/${u.id}`); load(); } catch (e) { setErr(e.message); }
  };

  /* ---- rights ---- */
  const openRights = async (u) => {
    try {
      const perms = await get(`/users/${u.id}/permissions`);
      setRights({ userId: u.id, name: u.name, level: u.level, perms: perms.map(p => ({ ...p, checked: isOn(p) })) });
    } catch (e) { setErr(e.message); }
  };
  const toggleRight = (id) => setRights(r => ({
    ...r, perms: r.perms.map(p => p.id === id ? { ...p, checked: !p.checked } : p)
  }));
  const saveRights = async () => {
    setBusy(true);
    try {
      const overrides = rights.perms
        .filter(p => p.checked !== !!p.from_role)
        .map(p => ({ permission_id: p.id, granted: p.checked }));
      await put(`/users/${rights.userId}/permissions`, { overrides });
      setRights(null); load();
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };
  const resetRights = async () => {
    setBusy(true);
    try { await put(`/users/${rights.userId}/permissions`, { overrides: [] }); setRights(null); load(); }
    catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  if (err && !rows) return <ErrorNote>{err}</ErrorNote>;
  if (!rows) return <Loading />;

  const modules = rights ? [...new Set(rights.perms.map(p => p.module))] : [];

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div><div className="eyebrow">Who sees what</div><h3>Users &amp; rights</h3></div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input placeholder="Search users…" value={q} style={{ width: 200 }} onChange={e => setQ(e.target.value)} />
          {admin && <button className="btn primary" onClick={openAdd}>Add user</button>}
        </div>
      </div>
      {err && <ErrorNote>{err}</ErrorNote>}

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', marginBottom: 14 }}>
        {[1, 2, 3, 4].map(l => (
          <div key={l} className={`stat b${l === 1 ? '5' : l === 2 ? '2' : l === 3 ? '3' : '4'}`}>
            <div className="cap">Level {l}</div>
            <div className="big">{rows.filter(u => u.level === l).length}</div>
            <div className="foot">{LEVELS[l][0]}</div>
          </div>
        ))}
      </div>

      <Card title="Hierarchy" extra={<span className="eyebrow">Who sees whose data</span>}>
        {[1, 2, 3, 4].map(l => (
          <div key={l} style={{ display: 'flex', gap: 12, padding: '6px 0', borderBottom: '1px solid #F2F4F8' }}>
            <Pill kind={levelTone(l)}>Level {l}</Pill>
            <div><b style={{ fontSize: 13 }}>{LEVELS[l][0]}</b>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>{LEVELS[l][1]}</div></div>
            <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--muted)' }}>
              {rows.filter(u => u.level === l).length} user(s)</span>
          </div>
        ))}
      </Card>

      <div style={{ height: 14 }} />

      <Card pad={false}>
        <table className="tbl">
          <thead><tr>
            <th>Employee ID</th><th>Name</th><th>Email</th><th>Department</th><th>Designation</th>
            <th>Reports to</th><th>Level</th><th>Rights</th><th>Status</th><th style={{ textAlign: 'right' }}>Actions</th>
          </tr></thead>
          <tbody>
            {filtered.length ? filtered.map(u => (
              <tr key={u.id}>
                <td className="mono" style={{ fontSize: 12 }}>{u.employee_code}</td>
                <td><Avatar name={u.name} size={22} /> <span style={{ fontWeight: 500 }}>{u.name}</span>
                  {u.id === user?.id && <span className="tag" style={{ marginLeft: 4 }}>you</span>}</td>
                <td style={{ fontSize: 12.5 }}>{u.email}</td>
                <td style={{ fontSize: 12.5 }}>{u.department || '—'}</td>
                <td style={{ fontSize: 12.5 }}>{u.designation || '—'}</td>
                <td style={{ fontSize: 12.5 }}>{u.manager || '—'}</td>
                <td><Pill kind={levelTone(u.level)}>Level {u.level}</Pill></td>
                <td className="mono" style={{ fontSize: 11.5 }}>{u.overrides > 0
                  ? <span className="tag">custom</span> : 'role default'}</td>
                <td><Pill kind={u.status === 'Active' ? 'p-done' : 'p-hold'}>{u.status}</Pill></td>
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  {admin ? (
                    <>
                      <button className="btn" style={{ padding: '2px 8px' }} onClick={() => openEdit(u)}>Edit</button>{' '}
                      <button className="btn" style={{ padding: '2px 8px' }} onClick={() => openRights(u)}>Rights</button>{' '}
                      <button className="btn" style={{ padding: '2px 8px', color: 'var(--red)' }} onClick={() => removeUser(u)}>Delete</button>
                    </>
                  ) : <span style={{ fontSize: 12, color: 'var(--muted)' }}>—</span>}
                </td>
              </tr>
            )) : <Empty cols={10}>No users match.</Empty>}
          </tbody>
        </table>
        <div className="eyebrow" style={{ padding: '10px 15px' }}>{filtered.length} of {rows.length} users</div>
      </Card>

      {form && (
        <Modal title={form._new ? 'Add user' : `Edit ${form.name}`} saveLabel={form._new ? 'Create user' : 'Save changes'}
          busy={busy} onClose={() => setForm(null)} onSave={saveUser}>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
            <div><label>Employee ID</label><input value={form.employee_code} onChange={e => setF('employee_code', e.target.value)} /></div>
            <div style={{ gridColumn: 'span 2' }}><label>Full name</label><input value={form.name} onChange={e => setF('name', e.target.value)} /></div>
            <div><label>Email</label><input type="email" value={form.email} onChange={e => setF('email', e.target.value)} /></div>
            <div><label>Mobile</label><input value={form.mobile} onChange={e => setF('mobile', e.target.value)} /></div>
            <div><label>Designation</label><input value={form.designation} onChange={e => setF('designation', e.target.value)} /></div>
            <div><label>Department</label>
              <select value={form.department_id} onChange={e => setF('department_id', e.target.value)}>
                <option value="">None</option>{depts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></div>
            <div><label>Banking division</label>
              <select value={form.division_id} onChange={e => setF('division_id', e.target.value)}>
                <option value="">None</option>{divisions.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></div>
            <div><label>Reports to</label>
              <select value={form.manager_id} onChange={e => setF('manager_id', e.target.value)}>
                <option value="">None</option>
                {rows.filter(u => u.id !== form.id).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select></div>
            <div><label>Access level</label>
              <select value={form.role_id} onChange={e => setF('role_id', e.target.value)}>
                {roles.map(r => <option key={r.id} value={r.id}>{r.name} (L{r.level})</option>)}</select></div>
            <div><label>Status</label>
              <select value={form.status} onChange={e => setF('status', e.target.value)}>
                <option>Active</option><option>Inactive</option></select></div>
            <div><label>Weekly capacity (h)</label><input type="number" value={form.weekly_capacity_hours} onChange={e => setF('weekly_capacity_hours', e.target.value)} /></div>
            <div><label>{form._new ? 'Password' : 'New password (optional)'}</label>
              <input type="text" value={form.password} onChange={e => setF('password', e.target.value)} /></div>
          </div>
          <p style={{ fontSize: 12, color: 'var(--muted)', margin: '10px 0 0' }}>
            A new user starts on the level defaults. Use the <b>Rights</b> button to tick individual permissions afterwards.
          </p>
        </Modal>
      )}

      {rights && (
        <Modal title={`Rights — ${rights.name}`} saveLabel="Save rights" busy={busy}
          onClose={() => setRights(null)} onSave={saveRights}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div><Pill kind={levelTone(rights.level)}>Level {rights.level}</Pill>
              <span style={{ fontSize: 12.5, color: 'var(--muted)', marginLeft: 6 }}>{LEVELS[rights.level][1]}</span></div>
            <button className="btn" onClick={resetRights}>Reset to level defaults</button>
          </div>
          <table className="tbl">
            <thead><tr><th>Module</th><th>Permission</th><th style={{ textAlign: 'center' }}>Granted</th></tr></thead>
            <tbody>
              {modules.map(mod => rights.perms.filter(p => p.module === mod).map((p, i) => (
                <tr key={p.id}>
                  <td style={{ fontSize: 12, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{i === 0 ? mod : ''}</td>
                  <td style={{ fontSize: 12.5 }}>{p.label}
                    {!p.from_role && <span style={{ fontSize: 10.5, color: 'var(--muted)' }}> (not in role)</span>}</td>
                  <td style={{ textAlign: 'center' }}>
                    <input type="checkbox" checked={p.checked} onChange={() => toggleRight(p.id)} style={{ width: 'auto' }} />
                  </td>
                </tr>
              )))}
            </tbody>
          </table>
          <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 10 }}>
            Ticking a box overrides the level default for this person only. The level decides <b>which records</b> they see;
            these boxes decide <b>what they can do</b> with them.
          </p>
        </Modal>
      )}
    </>
  );
}
