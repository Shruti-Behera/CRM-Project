import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { get, post, put } from '../lib/api.js';
import { Card, Loading, ErrorNote } from '../components/Bits.jsx';
import { useAuth } from '../lib/auth.jsx';

const TYPES = ['Mutual Fund','Insurance','FII / FPI','DII','PMS','AIF / Hedge Fund',
               'Bank Treasury','Corporate Treasury','Family Office'];
const EMPANEL = ['Empanelled','In process','Not empanelled','Suspended'];

/**
 * The client is the holder; schemes and their codes sit under it.
 * The server refuses a code that already belongs elsewhere, and that
 * message is shown as-is rather than being reworded here.
 */
export default function InstitutionForm() {
  const { id } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const [form, setForm] = useState({
    name: '', house_code: '', inst_type: 'Mutual Fund', tier: 'B',
    empanelment: 'In process', rm_id: '', city: '', aum_cr: 0,
    contact_name: '', contact_role: '', contact_email: '', note: '', schemes: []
  });
  const [users, setUsers] = useState([]);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(!!id);

  useEffect(() => {
    // Managing users needs users.view; a coverage-only role does not have it.
    // Fall back to the signed-in user so the RM field is never an empty dead-end.
    get('/users')
      .then(list => setUsers(list?.length ? list : (user ? [{ id: user.id, name: user.name }] : [])))
      .catch(() => setUsers(user ? [{ id: user.id, name: user.name }] : []));
    if (id) get(`/institutions/${id}`).then(c => {
      setForm({ ...c, schemes: c.schemes || [] });
      setLoading(false);
    }).catch(e => { setErr(e.message); setLoading(false); });
  }, [id]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const setScheme = (i, k, v) =>
    setForm(f => ({ ...f, schemes: f.schemes.map((s, j) => j === i ? { ...s, [k]: v } : s) }));
  const addScheme = () =>
    setForm(f => ({ ...f, schemes: [...f.schemes, { name: '', client_code: '', custodian: '', status: 'Active' }] }));
  const dropScheme = (i) =>
    setForm(f => ({ ...f, schemes: f.schemes.filter((_, j) => j !== i) }));

  const save = async (e) => {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      const payload = {
        ...form,
        rm_id: Number(form.rm_id),
        aum_cr: Number(form.aum_cr) || 0,
        schemes: form.schemes.filter(s => s.name || s.client_code)
      };
      if (id) await put(`/institutions/${id}`, payload);
      else await post('/institutions', payload);
      nav('/institutional/clients');
    } catch (ex) { setErr(ex.message); }
    finally { setBusy(false); }
  };

  if (loading) return <Loading />;

  return (
    <form onSubmit={save}>
      <h3 style={{ marginBottom: 14 }}>{id ? 'Edit client' : 'New institutional client'}</h3>
      {err && <ErrorNote>{err}</ErrorNote>}

      <Card title="The holder">
        <div className="grid" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
          <L label="Client name"><input value={form.name} required
            onChange={e => set('name', e.target.value)} /></L>
          <L label="House client code"><input value={form.house_code || ''}
            onChange={e => set('house_code', e.target.value)} /></L>
          <L label="Relationship manager">
            <select value={form.rm_id} required onChange={e => set('rm_id', e.target.value)}>
              <option value="">— pick —</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select></L>
          <L label="Type"><select value={form.inst_type} onChange={e => set('inst_type', e.target.value)}>
            {TYPES.map(t => <option key={t}>{t}</option>)}</select></L>
          <L label="Tier"><select value={form.tier} onChange={e => set('tier', e.target.value)}>
            {['A','B','C'].map(t => <option key={t}>{t}</option>)}</select></L>
          <L label="Empanelment"><select value={form.empanelment}
            onChange={e => set('empanelment', e.target.value)}>
            {EMPANEL.map(t => <option key={t}>{t}</option>)}</select></L>
          <L label="City"><input value={form.city || ''} onChange={e => set('city', e.target.value)} /></L>
          <L label="AUM (₹ cr)"><input type="number" value={form.aum_cr}
            onChange={e => set('aum_cr', e.target.value)} /></L>
          <L label="Primary contact"><input value={form.contact_name || ''}
            onChange={e => set('contact_name', e.target.value)} /></L>
        </div>
      </Card>

      <Card title="Schemes under this holder"
        extra={<button type="button" className="btn" onClick={addScheme}>Add scheme</button>}>
        {form.schemes.length ? (
          <table className="tbl">
            <thead><tr><th>Scheme</th><th>Client code</th><th>Custodian</th><th>Status</th><th /></tr></thead>
            <tbody>
              {form.schemes.map((s, i) => (
                <tr key={i}>
                  <td><input value={s.name} onChange={e => setScheme(i, 'name', e.target.value)} /></td>
                  <td><input className="mono" value={s.client_code || ''}
                        onChange={e => setScheme(i, 'client_code', e.target.value.toUpperCase())} /></td>
                  <td><input value={s.custodian || ''}
                        onChange={e => setScheme(i, 'custodian', e.target.value)} /></td>
                  <td><select value={s.status} onChange={e => setScheme(i, 'status', e.target.value)}>
                        {['Active','Dormant','Closed'].map(x => <option key={x}>{x}</option>)}</select></td>
                  <td><button type="button" className="btn" onClick={() => dropScheme(i)}>×</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p style={{ color: 'var(--muted)', margin: 0 }}>
            No schemes yet. A house trading through one account can be left as it is —
            put its code in the field above.
          </p>
        )}
      </Card>

      <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
        <button className="btn primary" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        <button type="button" className="btn" onClick={() => nav('/institutional/clients')}>Cancel</button>
      </div>
    </form>
  );
}

const L = ({ label, children }) => <div><label>{label}</label>{children}</div>;
