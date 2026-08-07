import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { get, post } from '../lib/api.js';
import { Card, ErrorNote } from '../components/Bits.jsx';
import { useAuth } from '../lib/auth.jsx';

const STATUSES = ['Pending', 'In Progress', 'Under Review', 'Completed', 'On Hold'];
const PRIOS = ['Low', 'Medium', 'High', 'Critical'];
const RECUR = ['None', 'Weekly', 'Monthly', 'Quarterly'];

const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); };

// Reference lists need view rights the assignment-creator may not hold; fall
// back gracefully so the form still works instead of erroring on a 403.
const softGet = (path) => get(path).then(r => r || []).catch(() => []);

export default function AssignmentForm() {
  const nav = useNavigate();
  const { user } = useAuth();

  const [users, setUsers] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [categories, setCategories] = useState([]);
  const [projects, setProjects] = useState([]);

  const [form, setForm] = useState({
    title: '', description: '', department_id: '', category_id: '', project_id: '',
    assignees: [], start_date: addDays(0), due_date: addDays(7), sla_days: 5,
    status: 'Pending', priority: 'Medium', estimated_hours: 8, recurrence: 'None'
  });
  const [subtasks, setSubtasks] = useState([]);
  const [checklist, setChecklist] = useState([
    'Requirement received', 'Discussion completed', 'Work started',
    'Under Review', 'Approved', 'Completed'
  ]);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Only people at or below the signed-in user in the reporting tree can be
    // assigned work — the backend returns exactly that set and also enforces it.
    softGet('/assignees').then(list =>
      setUsers(list.length ? list : (user ? [{ id: user.id, name: user.name }] : [])));
    softGet('/masters/departments').then(setDepartments);
    softGet('/masters/categories').then(setCategories);
    softGet('/masters/projects').then(setProjects);
    if (user) setForm(f => ({ ...f, assignees: f.assignees.length ? f.assignees : [user.id] }));
  }, [user]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  // Toggle a person in/out of the assignee list. A plain checkbox list is used
  // instead of a native <select multiple> so every row is a single, reliable
  // click (no Ctrl/Cmd needed) and the selection updates immediately.
  const toggleAssignee = (uid) => setForm(f => ({
    ...f,
    assignees: f.assignees.includes(uid) ? f.assignees.filter(x => x !== uid) : [...f.assignees, uid]
  }));

  const addSub = () => setSubtasks(s => [...s, { title: '', owner_id: '' }]);
  const setSub = (i, key, v) => setSubtasks(s => s.map((x, j) => j === i ? { ...x, [key]: v } : x));
  const dropSub = (i) => setSubtasks(s => s.filter((_, j) => j !== i));

  const addChk = () => setChecklist(c => [...c, '']);
  const setChk = (i, v) => setChecklist(c => c.map((x, j) => j === i ? v : x));
  const dropChk = (i) => setChecklist(c => c.filter((_, j) => j !== i));

  const save = async (e) => {
    e.preventDefault();
    setErr('');
    if (!form.title.trim()) { setErr('Add a title before saving'); return; }
    if (!form.assignees.length) { setErr('Pick at least one person to assign this to'); return; }
    if (form.due_date < form.start_date) { setErr('The due date is before the start date'); return; }
    setBusy(true);
    try {
      const payload = {
        title: form.title,
        description: form.description || undefined,
        department_id: form.department_id ? Number(form.department_id) : undefined,
        category_id: form.category_id ? Number(form.category_id) : undefined,
        project_id: form.project_id ? Number(form.project_id) : undefined,
        assignees: form.assignees.map(Number),
        start_date: form.start_date,
        due_date: form.due_date,
        sla_days: Number(form.sla_days) || 5,
        status: form.status,
        priority: form.priority,
        estimated_hours: Number(form.estimated_hours) || 0,
        recurrence: form.recurrence,
        subtasks: subtasks
          .filter(s => s.title.trim())
          .map(s => ({ title: s.title, owner_id: s.owner_id ? Number(s.owner_id) : undefined })),
        checklist: checklist.map(c => c.trim()).filter(Boolean)
      };
      const res = await post('/assignments', payload);
      nav(res?.id ? `/internal/assignments/${res.id}` : '/internal/assignments');
    } catch (ex) { setErr(ex.message); }
    finally { setBusy(false); }
  };

  return (
    <form onSubmit={save}>
      <div className="eyebrow">New record</div>
      <h3 style={{ marginBottom: 14 }}>Create assignment</h3>
      {err && <ErrorNote>{err}</ErrorNote>}

      <div className="grid" style={{ gridTemplateColumns: '2fr 1fr' }}>
        <Card title="Assignment information">
          <div className="grid" style={{ gridTemplateColumns: 'repeat(2,1fr)' }}>
            <L label="Title" full><input value={form.title} required
              onChange={e => set('title', e.target.value)} /></L>
            <L label="Description" full><textarea rows={3} value={form.description}
              onChange={e => set('description', e.target.value)} /></L>

            <L label="Department"><Select value={form.department_id} onChange={e => set('department_id', e.target.value)}
              opts={departments} placeholder="None" /></L>
            <L label="Category"><Select value={form.category_id} onChange={e => set('category_id', e.target.value)}
              opts={categories} placeholder="None" /></L>
            <L label="Project"><Select value={form.project_id} onChange={e => set('project_id', e.target.value)}
              opts={projects} placeholder="None" /></L>
            <L label="Assigned to (one or more)" full>
              <AssigneePicker users={users} selected={form.assignees} onToggle={toggleAssignee} />
              <p style={{ fontSize: 11.5, color: 'var(--muted)', margin: '6px 0 0' }}>
                Tick everyone this work is for. Only people in your reporting hierarchy are listed.</p>
            </L>

            <L label="Start date"><input type="date" value={form.start_date}
              onChange={e => set('start_date', e.target.value)} /></L>
            <L label="Due date"><input type="date" value={form.due_date}
              onChange={e => set('due_date', e.target.value)} /></L>
            <L label="SLA (working days)"><input type="number" value={form.sla_days}
              onChange={e => set('sla_days', e.target.value)} /></L>
            <L label="Estimated hours"><input type="number" value={form.estimated_hours}
              onChange={e => set('estimated_hours', e.target.value)} /></L>

            <L label="Status"><select value={form.status} onChange={e => set('status', e.target.value)}>
              {STATUSES.map(s => <option key={s}>{s}</option>)}</select></L>
            <L label="Priority"><select value={form.priority} onChange={e => set('priority', e.target.value)}>
              {PRIOS.map(s => <option key={s}>{s}</option>)}</select></L>
            <L label="Repeats"><select value={form.recurrence} onChange={e => set('recurrence', e.target.value)}>
              {RECUR.map(s => <option key={s}>{s}</option>)}</select></L>
          </div>
        </Card>

        <div className="grid">
          <Card title="Checklist" extra={<button type="button" className="btn" onClick={addChk}>Add</button>}>
            {checklist.length ? checklist.map((c, i) => (
              <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 8, alignItems: 'center' }}>
                <input type="checkbox" checked readOnly style={{ width: 'auto' }} title="Ticked off on the assignment page" />
                <input placeholder="Checklist item" value={c} style={{ flex: 1 }}
                  onChange={e => setChk(i, e.target.value)} />
                <button type="button" className="btn" style={{ padding: '0 8px' }} onClick={() => dropChk(i)}>×</button>
              </div>
            )) : <p style={{ color: 'var(--muted)', margin: 0, fontSize: 13 }}>
              No checklist items — add the steps this work must pass through.</p>}
            <p style={{ fontSize: 11.5, color: 'var(--muted)', margin: '6px 0 0' }}>
              These carry over to the assignment, where they can be ticked off.</p>
          </Card>

          <Card title="Sub-tasks" extra={<button type="button" className="btn" onClick={addSub}>Add</button>}>
            {subtasks.length ? subtasks.map((s, i) => (
              <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                <input placeholder="Sub-task" value={s.title} style={{ flex: 2 }}
                  onChange={e => setSub(i, 'title', e.target.value)} />
                <Select value={s.owner_id} onChange={e => setSub(i, 'owner_id', e.target.value)}
                  opts={users} placeholder="Owner" />
                <button type="button" className="btn" style={{ padding: '0 8px' }} onClick={() => dropSub(i)}>×</button>
              </div>
            )) : <p style={{ color: 'var(--muted)', margin: 0, fontSize: 13 }}>
              Break the work down — sub-tasks carry over to the assignment.</p>}
          </Card>
        </div>
      </div>

      <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
        <button className="btn primary" disabled={busy}>{busy ? 'Saving…' : 'Create assignment'}</button>
        <button type="button" className="btn" onClick={() => nav('/internal/assignments')}>Cancel</button>
      </div>
    </form>
  );
}

const L = ({ label, children, full }) => (
  <div style={full ? { gridColumn: '1 / -1' } : undefined}>
    <label>{label}</label>{children}
  </div>
);

// A reliable, always-clickable multi-select: one checkbox chip per person.
export const AssigneePicker = ({ users, selected, onToggle }) => (
  <div style={{
    display: 'flex', flexWrap: 'wrap', gap: 8, border: '1px solid var(--line)',
    borderRadius: 6, padding: 10, maxHeight: 168, overflowY: 'auto', background: '#fff'
  }}>
    {users.length ? users.map(u => {
      const on = selected.includes(u.id);
      return (
        <label key={u.id} style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, margin: 0, cursor: 'pointer',
          fontSize: 12.5, fontWeight: 400, textTransform: 'none', letterSpacing: 0,
          color: on ? 'var(--navy)' : 'var(--ink)', background: on ? 'var(--tint)' : '#fff',
          border: '1px solid', borderColor: on ? 'var(--navy)' : 'var(--line)',
          borderRadius: 20, padding: '3px 11px'
        }}>
          <input type="checkbox" checked={on} onChange={() => onToggle(u.id)} style={{ width: 'auto', margin: 0 }} />
          {u.name}{u.department ? <span style={{ color: 'var(--muted)' }}> · {u.department}</span> : null}
        </label>
      );
    }) : <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>No assignable people found.</span>}
  </div>
);

const Select = ({ value, onChange, opts, placeholder }) => (
  <select value={value} onChange={onChange}>
    <option value="">{placeholder}</option>
    {opts.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
  </select>
);
