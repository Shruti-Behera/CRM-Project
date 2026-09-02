import { useEffect, useMemo, useState } from 'react';
import { get, post, put, del } from '../lib/api.js';
import { Card, Pill, Avatar, Loading, Empty, ErrorNote, Modal } from '../components/Bits.jsx';
import { useAuth } from '../lib/auth.jsx';
import { downloadXLSX, readXLSX } from '../lib/xlsx.js';

// Bulk-upload columns mirror the manual Add-user form's fields exactly, in the
// same order: Employee ID, Full name, Email, Mobile, Department, Banking division,
// Designation, Reports to (manager), Access level (role), Weekly capacity, Status,
// Password. Department/division/role/manager are given by name/email and resolved
// to the same ids the manual dropdowns use; the password is stored as a temporary
// one the user must change on first sign-in.
const IMPORT_COLS = ['employee_code', 'name', 'email', 'mobile', 'department', 'division',
  'designation', 'manager_email', 'role', 'weekly_capacity_hours', 'status', 'password'];
const stamp = () => new Date().toISOString().slice(0, 10);

// Five-tier hierarchy. Level 1 (Super Admin) is the only tier that can
// administer users; scope decides which records each tier can see.
const LEVELS = {
  1: { name: 'Super Admin', scope: 'all',  note: 'Every record, every action, plus user administration' },
  2: { name: 'Management',  scope: 'all',  note: 'Organisation-wide visibility; cannot manage users' },
  3: { name: 'Head / HOD',  scope: 'all',  note: 'Every record across all workspaces; cannot manage users' },
  4: { name: 'Manager',     scope: 'team', note: 'Own department or division, plus their reporting line' },
  5: { name: 'Executive',   scope: 'own',  note: 'Only records they own, support or watch' }
};
const LEVEL_KEYS = [1, 2, 3, 4, 5];
const levelTone = (l) => ({ 1: 'p-red', 2: 'p-review', 3: 'p-progress', 4: 'p-pending', 5: 'p-hold' }[l] || 'p-hold');
const levelAvTone = (l) => (l === 1 ? '' : l === 2 ? 't' : 'g');   // navy / teal / green, per prototype
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
    division_id: '', designation: '', manager_id: '', role_id: roles.find(r => r.level === 5)?.id || '',
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
    const open = Number(u.open_work) || 0;
    const owns = Number(u.owns) || 0;
    const msg = `Deactivate ${u.name}?`
      + (open ? `\n\n${open} open assignment(s) are with them.` : '')
      + (owns ? `${open ? '\n' : '\n\n'}${owns} account(s)/opportunity(s) are owned by them.` : '')
      + `\n\nTheir history stays intact. They won't be able to log in or take new assignments. You can reactivate them anytime.`;
    if (!window.confirm(msg)) return;
    try { await del(`/users/${u.id}`); load(); } catch (e) { setErr(e.message); }
  };

  const reactivateUser = async (u) => {
    try { await put(`/users/${u.id}`, { status: 'Active' }); load(); } catch (e) { setErr(e.message); }
  };

  /* ---- bulk import ---- */
  const [impOpen, setImpOpen] = useState(false);
  const [impRows, setImpRows] = useState([]);        // parsed spreadsheet rows
  const [impPreview, setImpPreview] = useState(null); // dry-run result
  const [impResult, setImpResult] = useState(null);   // committed result
  const [impBusy, setImpBusy] = useState(false);
  const [impErr, setImpErr] = useState('');
  const [impFile, setImpFile] = useState('');

  const openImport = () => {
    setImpOpen(true); setImpRows([]); setImpPreview(null);
    setImpResult(null); setImpErr(''); setImpFile('');
  };

  const downloadTemplate = () => {
    const l5 = roles.find(r => r.level === 5) || roles[roles.length - 1] || {};
    const example = {
      employee_code: 'EMP1001', name: 'Asha Rao', email: 'asha.rao@example.com',
      mobile: '+91 90000 00000', department: depts[0]?.name || '', division: divisions[0]?.name || '',
      designation: 'Analyst', manager_email: '', role: l5.name || 'Executive',
      weekly_capacity_hours: '40', status: 'Active', password: 'Temp@1234'
    };
    const users = { name: 'Users', headers: IMPORT_COLS, rows: [IMPORT_COLS.map(c => example[c] ?? '')] };
    const ref = {
      name: 'Reference', headers: ['Field (matches Add-user form)', 'Accepted values'], rows: [
        ['role  (Access level)', roles.map(r => `${r.name} (L${r.level})`).join(', ')],
        ['department', depts.map(d => d.name).join(', ')],
        ['division  (Banking division)', divisions.map(d => d.name).join(', ')],
        ['manager_email  (Reports to)', 'email of an existing user (optional) — same as picking one in the dropdown'],
        ['status', 'Active, Inactive'],
        ['weekly_capacity_hours', 'number, defaults to 40'],
        ['password', 'min 8 characters — stored as a temporary password the user must change on first sign-in']
      ]
    };
    downloadXLSX(`ashika-users-template-${stamp()}.xlsx`, [users, ref]);
  };

  const onImportFile = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    setImpErr(''); setImpResult(null); setImpPreview(null); setImpBusy(true); setImpFile(file.name);
    try {
      const rows = await readXLSX(file);
      if (!rows.length) { setImpErr('That file has no data rows.'); return; }
      setImpRows(rows);
      setImpPreview(await post('/users/import', { rows, commit: false }));
    } catch (err) { setImpErr(err.message); }
    finally { setImpBusy(false); e.target.value = ''; }
  };

  const confirmImport = async () => {
    if (!impPreview?.valid) return;
    setImpBusy(true); setImpErr('');
    try {
      setImpResult(await post('/users/import', { rows: impRows, commit: true }));
      load();
    } catch (err) { setImpErr(err.message); }
    finally { setImpBusy(false); }
  };

  const downloadFailed = () => {
    const serverRows = (impResult || impPreview)?.rows || [];
    const failed = serverRows.map((sr, i) => ({ sr, orig: impRows[i] || {} })).filter(x => !x.sr.valid);
    if (!failed.length) return;
    const headers = [...IMPORT_COLS, 'errors'];
    const out = failed.map(({ sr, orig }) => [...IMPORT_COLS.map(c => orig[c] ?? ''), (sr.errors || []).join('; ')]);
    downloadXLSX(`ashika-users-import-errors-${stamp()}.xlsx`, [{ name: 'Failed rows', headers, rows: out }]);
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
          {admin && <button className="btn" onClick={openImport}>Import users</button>}
          {admin && <button className="btn primary" onClick={openAdd}>Add user</button>}
        </div>
      </div>
      {err && <ErrorNote>{err}</ErrorNote>}

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', marginBottom: 14 }}>
        {LEVEL_KEYS.map(l => (
          <div key={l} className={`stat b${l}`}>
            <div className="cap">Level {l}</div>
            <div className="big">{rows.filter(u => u.level === l).length}</div>
            <div className="foot">{LEVELS[l].name}</div>
          </div>
        ))}
      </div>

      <Card title="Hierarchy" extra={<span className="eyebrow">Who sees whose data</span>}>
        {LEVEL_KEYS.map((l, i) => (
          <div key={l} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '8px 0',
            borderBottom: i < LEVEL_KEYS.length - 1 ? '1px solid #F2F4F8' : 'none' }}>
            <Pill kind={levelTone(l)}>Level {l}</Pill>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 500 }}>{LEVELS[l].name}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>{LEVELS[l].note}</div>
            </div>
            <span className="mono" style={{ marginLeft: 'auto', fontSize: 11.5, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
              scope: {LEVELS[l].scope}</span>
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
                <td><Avatar name={u.name} size={22} tone={levelAvTone(u.level)} /> <span style={{ fontWeight: 500 }}>{u.name}</span>
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
                      {u.status === 'Active'
                        ? <button className="btn" style={{ padding: '2px 8px', color: 'var(--red)' }} onClick={() => removeUser(u)}>Deactivate</button>
                        : <button className="btn" style={{ padding: '2px 8px', color: 'var(--green)' }} onClick={() => reactivateUser(u)}>Reactivate</button>}
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

      {impOpen && (
        <Modal title="Import users" busy={impBusy}
          saveLabel={impResult ? 'Done'
            : impPreview ? (impPreview.valid ? `Create ${impPreview.valid} user${impPreview.valid === 1 ? '' : 's'}` : 'Nothing to import')
            : 'Import'}
          onClose={() => setImpOpen(false)}
          onSave={impResult ? () => setImpOpen(false) : impPreview ? confirmImport : () => {}}>
          {impErr && <ErrorNote>{impErr}</ErrorNote>}

          {!impPreview && !impResult && (
            <div>
              <p style={{ fontSize: 13, marginTop: 0 }}>
                Upload an <b>.xlsx</b> with one row per user. Columns are the same fields as the Add-user form:
                employee_code, name, email, mobile, department, division, designation, manager_email, role,
                weekly_capacity_hours, status and password. Each row is validated and created exactly like a
                manual user (the password is temporary — the user must reset it on first sign-in).
              </p>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <button className="btn" onClick={downloadTemplate}>Download template</button>
                <label className="btn primary" style={{ cursor: 'pointer', margin: 0 }}>
                  {impBusy ? 'Reading…' : 'Choose Excel file'}
                  <input type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={onImportFile} />
                </label>
                {impFile && <span style={{ fontSize: 12, color: 'var(--muted)' }}>{impFile}</span>}
              </div>
              <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 0 }}>
                Passwords are hashed before storage — plaintext is never saved. Imported users must reset their
                temporary password the first time they sign in.
              </p>
            </div>
          )}

          {impPreview && !impResult && (
            <div>
              <div style={{ display: 'flex', gap: 12, marginBottom: 8, fontSize: 13, alignItems: 'center' }}>
                <b style={{ color: 'var(--green)' }}>{impPreview.valid} valid</b>
                <b style={{ color: 'var(--red)' }}>{impPreview.invalid} invalid</b>
                <span style={{ color: 'var(--muted)' }}>of {impPreview.total} rows</span>
                {impPreview.invalid > 0 &&
                  <button className="btn" style={{ padding: '2px 8px', marginLeft: 'auto' }} onClick={downloadFailed}>Download invalid rows</button>}
              </div>
              <div style={{ maxHeight: 320, overflow: 'auto' }}>
                <table className="tbl">
                  <thead><tr><th>#</th><th>Name</th><th>Email</th><th>Role</th><th>Reports to</th><th>Status</th><th>Result</th></tr></thead>
                  <tbody>
                    {impPreview.rows.map((r, i) => (
                      <tr key={i} style={{ background: r.valid ? '' : '#FFF5F5' }}>
                        <td className="mono" style={{ fontSize: 11.5 }}>{r.row}</td>
                        <td style={{ fontSize: 12.5 }}>{r.name || '—'}</td>
                        <td style={{ fontSize: 12.5 }}>{r.email || '—'}</td>
                        <td style={{ fontSize: 12.5 }}>{r.role || '—'}</td>
                        <td style={{ fontSize: 12.5 }}>{r.reports_to || '—'}</td>
                        <td style={{ fontSize: 12.5 }}>{r.status}</td>
                        <td style={{ fontSize: 12 }}>
                          {r.valid ? <Pill kind="p-done">Ready</Pill>
                            : <span style={{ color: 'var(--red)' }}>{r.errors.join('; ')}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 0 }}>
                Only valid rows are created, inside one transaction. Invalid rows are skipped.
              </p>
            </div>
          )}

          {impResult && (
            <div>
              <div style={{ display: 'flex', gap: 16, fontSize: 14, marginBottom: 10 }}>
                <b style={{ color: 'var(--green)' }}>{impResult.created} created</b>
                <b style={{ color: impResult.failed ? 'var(--red)' : 'var(--muted)' }}>{impResult.failed} failed</b>
                <span style={{ color: 'var(--muted)' }}>of {impResult.total} rows</span>
              </div>
              {impResult.failed > 0 &&
                <button className="btn" onClick={downloadFailed}>Download failed rows with reasons</button>}
              <p style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 0 }}>
                Imported users can sign in with their temporary password and will be prompted to set a new one.
              </p>
            </div>
          )}
        </Modal>
      )}

      {rights && (
        <Modal title={`Rights — ${rights.name}`} saveLabel="Save rights" busy={busy}
          onClose={() => setRights(null)} onSave={saveRights}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div><Pill kind={levelTone(rights.level)}>Level {rights.level}</Pill>
              <span style={{ fontSize: 12.5, color: 'var(--muted)', marginLeft: 6 }}>{LEVELS[rights.level]?.note}</span></div>
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
