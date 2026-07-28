import { useEffect, useMemo, useState } from 'react';
import { get, post, put, del, patch } from '../lib/api.js';
import { Card, Pill, Loading, Empty, ErrorNote, Modal } from '../components/Bits.jsx';
import { useAuth } from '../lib/auth.jsx';

export default function Departments() {
  const { can } = useAuth();
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = () => get('/masters/departments').then(setRows).catch(e => setErr(e.message));
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    if (!rows) return [];
    const s = q.toLowerCase();
    return rows.filter(d => !s || `${d.name} ${d.code || ''}`.toLowerCase().includes(s));
  }, [rows, q]);

  const openAdd = () => setForm({ _new: true, code: '', name: '' });
  const openEdit = (d) => setForm({ _new: false, id: d.id, code: d.code || '', name: d.name });
  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.name.trim()) { setErr('A department name is needed'); return; }
    setBusy(true);
    try {
      const body = { name: form.name, code: form.code || undefined };
      if (form._new) await post('/masters/departments', body);
      else await put(`/masters/departments/${form.id}`, body);
      setForm(null); setErr(''); load();
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  const remove = async (d) => {
    if (!window.confirm(`Delete ${d.name}?`)) return;
    try { await del(`/masters/departments/${d.id}`); load(); }
    catch (e) { setErr(e.message); }  // server explains if still in use
  };

  const toggle = async (d) => {
    try { await patch(`/masters/departments/${d.id}/retire`, { active: Number(d.is_active) === 0 }); load(); }
    catch (e) { setErr(e.message); }
  };

  if (err && !rows) return <ErrorNote>{err}</ErrorNote>;
  if (!rows) return <Loading />;

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div><div className="eyebrow">Organisation structure</div><h3>Departments</h3></div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input placeholder="Search…" value={q} style={{ width: 200 }} onChange={e => setQ(e.target.value)} />
          {can('masters.create') && <button className="btn primary" onClick={openAdd}>Add department</button>}
        </div>
      </div>
      {err && <ErrorNote>{err}</ErrorNote>}

      <Card pad={false}>
        <table className="tbl">
          <thead><tr><th>Code</th><th>Name</th><th>Status</th><th style={{ textAlign: 'right' }}>Actions</th></tr></thead>
          <tbody>
            {filtered.length ? filtered.map(d => (
              <tr key={d.id}>
                <td className="mono" style={{ fontSize: 12 }}>{d.code || '—'}</td>
                <td style={{ fontWeight: 500 }}>{d.name}</td>
                <td><Pill kind={Number(d.is_active) === 0 ? 'p-hold' : 'p-done'}>{Number(d.is_active) === 0 ? 'Retired' : 'Active'}</Pill></td>
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  {can('masters.edit') && <button className="btn" style={{ padding: '2px 8px' }} onClick={() => openEdit(d)}>Edit</button>}{' '}
                  {can('masters.edit') && <button className="btn" style={{ padding: '2px 8px' }} onClick={() => toggle(d)}>{Number(d.is_active) === 0 ? 'Activate' : 'Retire'}</button>}{' '}
                  {can('masters.delete') && <button className="btn" style={{ padding: '2px 8px', color: 'var(--red)' }} onClick={() => remove(d)}>Delete</button>}
                </td>
              </tr>
            )) : <Empty cols={4}>No departments yet.</Empty>}
          </tbody>
        </table>
        <div className="eyebrow" style={{ padding: '10px 15px' }}>{filtered.length} of {rows.length} departments</div>
      </Card>

      {form && (
        <Modal title={form._new ? 'Add department' : `Edit ${form.name}`} saveLabel={form._new ? 'Create' : 'Save'}
          busy={busy} onClose={() => setForm(null)} onSave={save}>
          <div className="grid" style={{ gridTemplateColumns: '1fr 2fr' }}>
            <div><label>Code</label><input value={form.code} onChange={e => setF('code', e.target.value)} /></div>
            <div><label>Name</label><input value={form.name} onChange={e => setF('name', e.target.value)} /></div>
          </div>
        </Modal>
      )}
    </>
  );
}
