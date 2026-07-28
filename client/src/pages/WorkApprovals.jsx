import { useEffect, useMemo, useState } from 'react';
import { get, post, patch, inr, shortDate } from '../lib/api.js';
import { Card, Pill, statusTone, Avatar, Loading, Empty, ErrorNote, Modal } from '../components/Bits.jsx';
import { useAuth } from '../lib/auth.jsx';

const STATUSES = ['Draft', 'Pending', 'Approved', 'Rejected', 'On hold', 'Withdrawn'];
const PRIORITIES = ['Routine', 'Normal', 'Urgent'];
const softGet = (p) => get(p).then(r => r || []).catch(() => []);
const num = (v) => Number(v || 0);
const rank = (s) => s === 'Pending' ? 0 : s === 'On hold' ? 1 : s === 'Draft' ? 2 : 3;
const addDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
const todayIso = () => addDays(0);

export default function WorkApprovals() {
  const { user, can } = useAuth();
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState('');
  const [workTypes, setWorkTypes] = useState([]);
  const [depts, setDepts] = useState([]);
  const [users, setUsers] = useState([]);
  const [f, setF] = useState({ q: '', type: '', status: '', dept: '', approver: '' });
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = () => get('/work-approvals').then(setRows).catch(e => setErr(e.message));
  useEffect(() => {
    load();
    softGet('/masters/work-types').then(setWorkTypes);
    softGet('/masters/departments').then(setDepts);
    softGet('/users').then(setUsers);
  }, []);

  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const clear = () => setF({ q: '', type: '', status: '', dept: '', approver: '' });

  const decide = async (id, status) => {
    const remarks = window.prompt(`${status} — any remarks?`) ?? '';
    try { await patch(`/work-approvals/${id}/decide`, { status, remarks }); load(); }
    catch (e) { setErr(e.message); }
  };

  const openRaise = () => setForm({
    title: '', work_type_id: '', department_id: '', priority: 'Normal', amount: '',
    vendor: '', needed_by: addDays(14), approver_id: '', status: 'Pending', details: ''
  });
  const setFo = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const raise = async () => {
    if (!form.title.trim()) { setErr('Say what it is for'); return; }
    if (!form.work_type_id) { setErr('Pick a type of work'); return; }
    if (!form.approver_id) { setErr('Pick an approver'); return; }
    setBusy(true);
    try {
      await post('/work-approvals', {
        title: form.title, work_type_id: Number(form.work_type_id),
        department_id: form.department_id ? Number(form.department_id) : undefined,
        priority: form.priority, amount: Number(form.amount) || 0,
        vendor: form.vendor || undefined, needed_by: form.needed_by || undefined,
        approver_id: Number(form.approver_id), status: form.status,
        details: form.details || undefined
      });
      setForm(null); setErr(''); load();
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  const typeOptions = workTypes.length ? workTypes.map(w => w.name) : [...new Set((rows || []).map(r => r.work_type).filter(Boolean))].sort();
  const deptOptions = depts.length ? depts.map(d => d.name) : [...new Set((rows || []).map(r => r.department).filter(Boolean))].sort();
  const approverOptions = [...new Set((rows || []).map(r => r.approver_name).filter(Boolean))].sort();

  const filtered = useMemo(() => {
    if (!rows) return [];
    const q = f.q.toLowerCase();
    return rows.filter(w =>
      (!f.type || w.work_type === f.type) &&
      (!f.status || w.status === f.status) &&
      (!f.dept || w.department === f.dept) &&
      (!f.approver || w.approver_name === f.approver) &&
      (!q || `${w.approval_no} ${w.title} ${w.vendor || ''} ${w.details || ''}`.toLowerCase().includes(q)))
      .sort((a, b) => rank(a.status) - rank(b.status) || (ymd(a.needed_by) < ymd(b.needed_by) ? -1 : 1));
  }, [rows, f]);

  if (err && !rows) return <ErrorNote>{err}</ErrorNote>;
  if (!rows) return <Loading />;

  const kpis = [
    [rows.filter(w => w.status === 'Pending').length, 'Pending', 'b4'],
    [rows.filter(w => w.status === 'Pending' && w.approver_id === user.id).length, 'On you', 'b5'],
    [rows.filter(w => w.status === 'Approved').length, 'Approved', 'b3'],
    [rows.filter(w => w.status === 'Rejected').length, 'Rejected', ''],
    [inr(rows.filter(w => w.status === 'Pending').reduce((n, w) => n + num(w.amount), 0)), 'Value pending', 'b2'],
    [inr(rows.filter(w => w.status === 'Approved').reduce((n, w) => n + num(w.amount), 0)), 'Value approved', '']
  ];
  const totalShown = filtered.reduce((n, w) => n + num(w.amount), 0);

  const exportCsv = () => {
    const cols = ['approval_no', 'title', 'work_type', 'department', 'amount', 'vendor',
      'raised_by_name', 'approver_name', 'needed_by', 'status'];
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [cols.join(','), ...filtered.map(w => cols.map(c => esc(w[c])).join(','))].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'work-approvals.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div><div className="eyebrow">Agreements, fit-outs, purchases and the rest</div><h3>Work approvals</h3></div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" onClick={exportCsv} disabled={!filtered.length}>Export</button>
          {can('workapproval.create') && <button className="btn primary" onClick={openRaise}>Raise a request</button>}
        </div>
      </div>
      {err && <ErrorNote>{err}</ErrorNote>}

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', marginBottom: 14 }}>
        {kpis.map(([v, l, tone]) => (
          <div key={l} className={`stat ${tone}`}><div className="cap">{l}</div>
            <div className="big" style={{ fontSize: 20 }}>{v}</div></div>
        ))}
      </div>

      <Card>
        <div className="filters">
          <div><label>Search</label><input placeholder="No., title, vendor" value={f.q} onChange={e => set('q', e.target.value)} /></div>
          <div><label>Type of work</label>
            <select value={f.type} onChange={e => set('type', e.target.value)}>
              <option value="">All</option>{typeOptions.map(n => <option key={n}>{n}</option>)}</select></div>
          <div><label>Status</label>
            <select value={f.status} onChange={e => set('status', e.target.value)}>
              <option value="">All</option>{STATUSES.map(n => <option key={n}>{n}</option>)}</select></div>
          <div><label>Department</label>
            <select value={f.dept} onChange={e => set('dept', e.target.value)}>
              <option value="">All</option>{deptOptions.map(n => <option key={n}>{n}</option>)}</select></div>
          <div><label>Approver</label>
            <select value={f.approver} onChange={e => set('approver', e.target.value)}>
              <option value="">All</option>{approverOptions.map(n => <option key={n}>{n}</option>)}</select></div>
          <div><label>&nbsp;</label><button className="btn" style={{ width: '100%' }} onClick={clear}>Clear</button></div>
        </div>
      </Card>

      <div style={{ height: 14 }} />

      <Card pad={false}>
        <table className="tbl">
          <thead><tr>
            <th>No.</th><th>What it is for</th><th>Type of work</th><th>Department</th>
            <th style={{ textAlign: 'right' }}>Amount</th><th>Vendor</th><th>Raised by</th><th>Approver</th>
            <th>Needed by</th><th>Status</th><th style={{ textAlign: 'right' }}>Decision</th>
          </tr></thead>
          <tbody>
            {filtered.length ? filtered.map(w => {
              const late = w.status === 'Pending' && w.needed_by && ymd(w.needed_by) < todayIso();
              const canDecide = w.status === 'Pending' && (w.approver_id === user.id || can('workapproval.approve'));
              return (
                <tr key={w.id}>
                  <td className="mono" style={{ fontSize: 11.5, fontWeight: 600 }}>{w.approval_no}
                    {w.attachments > 0 && <span title={`${w.attachments} attachment(s)`}> 📎{w.attachments}</span>}</td>
                  <td style={{ maxWidth: 250 }}>
                    <div style={{ fontWeight: 500 }}>{w.title}</div>
                    {w.priority === 'Urgent' && <Pill kind="p-red">Urgent</Pill>}
                  </td>
                  <td style={{ fontSize: 12.5 }}>{w.work_type}</td>
                  <td style={{ fontSize: 12.5 }}>{w.department || '—'}</td>
                  <td className="mono" style={{ textAlign: 'right', fontSize: 12 }}>{num(w.amount) ? inr(w.amount) : '—'}</td>
                  <td style={{ fontSize: 12.5 }}>{w.vendor || '—'}</td>
                  <td><Avatar name={w.raised_by_name} size={22} /></td>
                  <td><Avatar name={w.approver_name} size={22} /></td>
                  <td className="mono" style={{ fontSize: 12, color: late ? 'var(--red)' : undefined, fontWeight: late ? 600 : 400 }}>
                    {w.needed_by ? shortDate(w.needed_by) : '—'}</td>
                  <td><Pill kind={statusTone(w.status)}>{w.status}</Pill></td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {canDecide ? (
                      <>
                        <button className="btn primary" style={{ padding: '2px 8px' }} onClick={() => decide(w.id, 'Approved')}>Approve</button>{' '}
                        <button className="btn" style={{ padding: '2px 8px', color: 'var(--red)' }} onClick={() => decide(w.id, 'Rejected')}>Reject</button>
                      </>
                    ) : <span style={{ fontSize: 12, color: 'var(--muted)' }}>{w.decided_on ? shortDate(w.decided_on) : ''}</span>}
                  </td>
                </tr>
              );
            }) : <Empty cols={11}>Nothing to show. Raise a request with the button above.</Empty>}
          </tbody>
        </table>
        <div className="eyebrow" style={{ padding: '10px 15px' }}>
          {filtered.length} of {rows.length} · {inr(totalShown)} in total
        </div>
      </Card>

      {form && (
        <Modal title="Raise an approval request" saveLabel="Raise it" busy={busy} onClose={() => setForm(null)} onSave={raise}>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
            <div style={{ gridColumn: '1 / -1' }}><label>What it is for</label>
              <input value={form.title} onChange={e => setFo('title', e.target.value)} /></div>
            <div><label>Type of work</label>
              <select value={form.work_type_id} onChange={e => setFo('work_type_id', e.target.value)}>
                <option value="">— pick —</option>
                {workTypes.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select></div>
            <div><label>Department</label>
              <select value={form.department_id} onChange={e => setFo('department_id', e.target.value)}>
                <option value="">None</option>
                {depts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select></div>
            <div><label>Priority</label>
              <select value={form.priority} onChange={e => setFo('priority', e.target.value)}>
                {PRIORITIES.map(pr => <option key={pr}>{pr}</option>)}</select></div>
            <div><label>Amount (₹)</label><input type="number" value={form.amount} onChange={e => setFo('amount', e.target.value)} /></div>
            <div><label>Vendor or party</label><input value={form.vendor} onChange={e => setFo('vendor', e.target.value)} /></div>
            <div><label>Needed by</label><input type="date" value={form.needed_by} onChange={e => setFo('needed_by', e.target.value)} /></div>
            <div><label>Approver</label>
              <select value={form.approver_id} onChange={e => setFo('approver_id', e.target.value)}>
                <option value="">— pick —</option>
                {users.filter(u => u.status === 'Active' || !u.status).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select></div>
            <div><label>Status</label>
              <select value={form.status} onChange={e => setFo('status', e.target.value)}>
                <option>Draft</option><option>Pending</option></select></div>
            <div style={{ gridColumn: '1 / -1' }}><label>Details</label>
              <textarea rows={3} value={form.details} onChange={e => setFo('details', e.target.value)} /></div>
          </div>
        </Modal>
      )}
    </>
  );
}

function ymd(s) { return (s || '').slice(0, 10); }
